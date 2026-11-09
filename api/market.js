import express from "express";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/express";
import { getNetwork } from "./_lib/networks.js";
import { runTool } from "./_lib/tools.js";

const NATIVE_SCHEME = "pharos-native-transfer";
const NATIVE_RESOURCE = "/premium";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;

function terms(networkKey) {
  const net = getNetwork(networkKey);
  const prefix = networkKey === "atlantic" ? "X402_ATLANTIC" : "X402_PACIFIC";
  return {
    network: net.caip2,
    payTo: process.env[`${prefix}_PAY_TO`],
    asset: process.env[`${prefix}_ASSET`],
    amount: process.env[`${prefix}_PRICE_BASE_UNITS`],
    facilitator: process.env[`${prefix}_FACILITATOR_URL`] || process.env.X402_FACILITATOR_URL,
    facilitatorToken: process.env[`${prefix}_FACILITATOR_TOKEN`] || process.env.X402_FACILITATOR_TOKEN
  };
}

async function requestJson(url, options = {}, timeoutMs = 15000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  let data = {};
  try { data = await response.json(); } catch { /* response details are optional */ }
  return { response, data };
}

async function facilitatorStatus(config, network) {
  if (!config.facilitator) return { ok: false, reason: "Facilitator URL is not configured." };
  const baseUrl = config.facilitator.replace(/\/$/, "");
  const headers = config.facilitatorToken ? { authorization: `Bearer ${config.facilitatorToken}` } : {};
  try {
    const { response, data } = await requestJson(`${baseUrl}/supported`, { headers });
    if (!response.ok) return { ok: false, reason: `Facilitator /supported returned HTTP ${response.status}.` };

    const exact = (data.kinds || []).some(item => item.x402Version === 2 && item.scheme === "exact" && item.network === network);
    if (exact) return { ok: true, scheme: "exact", mode: "exact", reason: `Facilitator supports x402 v2 exact on ${network}.` };

    const native = data.x402Version === 2 && data.network === network
      && (data.accepts || []).some(item => item.scheme === NATIVE_SCHEME && item.network === network && item.asset === "native:PHRS");
    if (native) {
      if (network !== "eip155:688689") return { ok: false, scheme: NATIVE_SCHEME, mode: "native", reason: "The native PHRS facilitator supports Atlantic Testnet only." };
      const challengeResult = await requestJson(`${baseUrl}${NATIVE_RESOURCE}`, { headers });
      if (challengeResult.response.status !== 402) return { ok: false, scheme: NATIVE_SCHEME, mode: "native", reason: `Facilitator premium route did not return its 402 challenge (HTTP ${challengeResult.response.status}).` };
      const challenge = challengeResult.data;
      const requirement = (challenge.accepts || []).find(item => item.scheme === NATIVE_SCHEME && item.network === network && item.asset === "native:PHRS");
      if (!requirement || !ADDRESS_RE.test(requirement.payTo || "") || !/^\d+$/.test(requirement.amount || "") || BigInt(requirement.amount) <= 0n) {
        return { ok: false, scheme: NATIVE_SCHEME, mode: "native", reason: "Facilitator challenge is missing a valid recipient or PHRS amount." };
      }
      if (Number(requirement.extra?.chainId) !== 688689) return { ok: false, scheme: NATIVE_SCHEME, mode: "native", reason: "Facilitator challenge chain ID is not Atlantic Testnet (688689)." };
      return { ok: true, scheme: NATIVE_SCHEME, mode: "native", reason: "Facilitator supports native PHRS payments on Atlantic Testnet.", challenge };
    }

    return { ok: false, reason: `Facilitator does not advertise a supported x402 v2 scheme for ${network}.` };
  } catch (error) {
    return { ok: false, reason: `Facilitator capability check failed: ${error.message}` };
  }
}

function decodePaymentHeader(value) {
  if (!value || value.length > 12000) return null;
  try {
    const json = Buffer.from(value, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch { /* allow the JSON header form used by some clients */ }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function encodeHeader(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function requestHeader(req, name) {
  const key = name.toLowerCase();
  const value = req.headers?.[key] ?? req.headers?.[name] ?? req.get?.(name);
  return Array.isArray(value) ? value[0] : value;
}

function sendChallenge(res, challenge, error) {
  const body = { ...challenge, ...(error ? { error } : {}) };
  // setHeader is available on Vercel's Node response and on Express responses.
  res.setHeader("PAYMENT-REQUIRED", encodeHeader(body));
  return res.status(402).json(body);
}

async function createReport(query, source, network) {
  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery || trimmedQuery.length > 1000) throw Object.assign(new Error("Provide a question up to 1,000 characters."), { status: 400 });
  if (!(["auto", "rpc", "mcp"].includes(source))) throw Object.assign(new Error("Source must be auto, rpc, or mcp."), { status: 400 });

  const hashes = [...trimmedQuery.matchAll(/0x[a-fA-F0-9]{64}/g)].map(match => match[0]);
  const addresses = [...trimmedQuery.matchAll(/0x[a-fA-F0-9]{40}/g)].map(match => match[0]);
  const plan = hashes.length ? [{ name: "inspect_transaction", args: { hash: hashes[0] } }]
    : /allowance|approval|spender/i.test(trimmedQuery) && addresses.length >= 3 ? [{ name: "inspect_erc20_allowance", args: { token: addresses[0], owner: addresses[1], spender: addresses[2] } }]
    : addresses.length ? [{ name: "investigate_address", args: { address: addresses[0] } }]
    : [{ name: "network_status", args: {} }];
  if (/documentation|standard|x402|network configuration|how does/i.test(trimmedQuery)) plan.push({ name: "search_pharos_docs", args: { query: trimmedQuery } });
  const toolCalls = await Promise.all(plan.map(async tool => {
    try { return { name: tool.name, result: await runTool(tool.name, { ...tool.args, network, source }) }; }
    catch (error) { return { name: tool.name, error: error.message }; }
  }));
  return {
    objective: trimmedQuery,
    network: getNetwork(network).name,
    toolCalls,
    assessment: "Findings are limited to the returned RPC/MCP evidence. Unknowns are stated per tool result; this service does not certify contract safety."
  };
}

async function handleNativePayment(req, res, config, network, status) {
  const challenge = status.challenge;
  const payment = decodePaymentHeader(requestHeader(req, "payment-signature"));
  if (!payment) return sendChallenge(res, challenge);
  const payer = payment.payload?.payer;
  const txHash = payment.payload?.txHash;
  if (payment.x402Version !== 2 || payment.scheme !== NATIVE_SCHEME || payment.network !== network
      || !ADDRESS_RE.test(payer || "") || !HASH_RE.test(txHash || "")) {
    return sendChallenge(res, challenge, "Payment proof format, payer, or transaction hash is invalid.");
  }

  const baseUrl = config.facilitator.replace(/\/$/, "");
  const authHeaders = config.facilitatorToken ? { authorization: `Bearer ${config.facilitatorToken}` } : {};
  let verification;
  try {
    const verified = await requestJson(`${baseUrl}/verify`, {
      method: "POST", headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ resource: NATIVE_RESOURCE, payment })
    }, 20000);
    if (!verified.response.ok || verified.data.isValid !== true) {
      return sendChallenge(res, challenge, verified.data.invalidReason || `Facilitator verification failed (HTTP ${verified.response.status}).`);
    }
    verification = verified.data.details;
    if (!verification || String(verification.txHash).toLowerCase() !== txHash.toLowerCase()
        || String(verification.payer).toLowerCase() !== payer.toLowerCase()
        || Number(verification.chainId) !== 688689 || verification.network !== network
        || BigInt(verification.amountWei || "0") < BigInt(challenge.accepts[0].amount)) {
      return sendChallenge(res, challenge, "Facilitator verification details do not match the challenge and submitted payment proof.");
    }
  } catch (error) {
    return res.status(503).json({ error: `Facilitator verification unavailable: ${error.message}` });
  }

  let report;
  try { report = await createReport(req.body?.query, String(req.body?.source || "auto"), "atlantic"); }
  catch (error) { return res.status(error.status || 502).json({ error: error.message || "Report generation failed." }); }

  try {
    const settled = await requestJson(`${baseUrl}/settle`, {
      method: "POST", headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ resource: NATIVE_RESOURCE, payment })
    }, 20000);
    if (!settled.response.ok || settled.data.success !== true
        || String(settled.data.txHash).toLowerCase() !== txHash.toLowerCase()
        || String(settled.data.payer).toLowerCase() !== payer.toLowerCase()
        || Number(settled.data.chainId) !== 688689) {
      return res.status(402).json({ error: settled.data.invalidReason || "Facilitator did not confirm settlement for the submitted transaction." });
    }
    return res.status(200).json({
      service: "OATH Premium Intelligence", requestedQuery: report.objective, network: report.network, report,
      payment: { verifiedByFacilitator: true, scheme: NATIVE_SCHEME, network, txHash, payer, amount: settled.data.amount, asset: "PHRS", explorerUrl: settled.data.explorerUrl }
    });
  } catch (error) {
    return res.status(503).json({ error: `Facilitator settlement unavailable: ${error.message}`, paymentVerified: true, txHash });
  }
}

export default async function handler(req, res) {
  const networkKey = String(req.method === "GET" ? req.query?.network : req.body?.network || "atlantic");
  let net;
  try { net = getNetwork(networkKey); } catch (error) { return res.status(400).json({ error: error.message }); }
  const config = terms(net.key);
  const facilitator = await facilitatorStatus(config, config.network);
  const enabled = process.env.X402_ENABLED === "true";
  const nativeConfigured = enabled && Boolean(config.facilitator) && facilitator.mode === "native" && net.key === "atlantic";
  const exactConfigured = enabled && Boolean(config.payTo && config.asset && config.amount && config.facilitator) && facilitator.mode === "exact";
  const configured = nativeConfigured || exactConfigured;
  const isReady = configured && facilitator.ok;

  if (req.method === "GET") {
    const nativeRequirement = facilitator.challenge?.accepts?.[0];
    return res.status(200).json({
      service: "OATH Premium Intelligence", network: net.name, caip2: net.caip2,
      scheme: facilitator.scheme || "unavailable", amount: nativeRequirement?.amountFormatted || config.amount || null,
      asset: nativeRequirement?.asset || config.asset || null, recipient: nativeRequirement?.payTo || config.payTo || null,
      facilitator: config.facilitator || null, configured, facilitatorSupported: facilitator.ok,
      status: isReady ? "ready" : "unavailable",
      reason: !enabled ? "Set X402_ENABLED=true after adding the Atlantic facilitator URL." : !configured ? facilitator.reason || "Configure a compatible facilitator for the selected network." : facilitator.reason,
      deliverable: "Extended read-only Pharos investigation report"
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST required." });
  if (!configured) return res.status(503).json({ error: "Paid intelligence is not configured for this network.", reason: facilitator.reason });
  if (!facilitator.ok) return res.status(503).json({ error: "The configured facilitator does not verify this network; paid delivery is disabled.", reason: facilitator.reason });

  if (nativeConfigured) return handleNativePayment(req, res, config, net.caip2, facilitator);

  if (!ADDRESS_RE.test(config.payTo || "") || !ADDRESS_RE.test(config.asset || "") || !/^\d{1,78}$/.test(config.amount || "") || BigInt(config.amount) === 0n || BigInt(config.amount) >= 2n ** 256n) {
    return res.status(503).json({ error: "Payment configuration is invalid. payTo and asset must be EVM addresses; amount must be a positive uint256 in base units." });
  }
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitator,
    ...(config.facilitatorToken ? { createAuthHeaders: async () => {
      const authorization = { Authorization: `Bearer ${config.facilitatorToken}` };
      return { verify: authorization, settle: authorization, supported: authorization };
    } } : {})
  });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(config.network, new ExactEvmScheme());
  const app = express();
  app.use(express.json({ limit: "8kb" }));
  app.use(paymentMiddleware({
    "POST /api/market": {
      accepts: [{ scheme: "exact", network: config.network, payTo: config.payTo, price: { amount: config.amount, asset: config.asset } }],
      description: "Extended OATH on-chain investigation report", mimeType: "application/json"
    }
  }, resourceServer));
  app.post("/api/market", async (request, response) => {
    try {
      const source = String(request.body?.source || "auto");
      const report = await createReport(request.body?.query, source, net.key);
      return response.status(200).json({ service: "OATH Premium Intelligence", requestedQuery: report.objective, network: net.name, report,
        payment: { verifiedByMiddleware: true, receipt: response.getHeader("X-PAYMENT-RESPONSE") || response.getHeader("PAYMENT-RESPONSE") || null } });
    } catch (error) { return response.status(error.status || 502).json({ error: error.message || "Report generation failed." }); }
  });
  return app(req, res);
}
