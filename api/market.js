import express from "express";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/express";
import { getNetwork } from "./_lib/networks.js";
import { runTool } from "./_lib/tools.js";

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

async function facilitatorStatus(url, network, token) {
  if (!url) return { ok:false, reason:"Facilitator URL is not configured." };
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/supported`, { headers:token ? { authorization:`Bearer ${token}` } : {}, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return { ok:false, reason:`Facilitator /supported returned HTTP ${response.status}.` };
    const data = await response.json();
    const supported = (data.kinds || []).some(item => item.x402Version === 2 && item.scheme === "exact" && item.network === network);
    return { ok:supported, reason:supported ? "Facilitator reports x402 v2 exact support for this network." : `Facilitator does not advertise x402 v2 exact support for ${network}.`, networks:[...new Set((data.kinds || []).filter(k=>k.x402Version===2&&k.scheme==="exact").map(k=>k.network))] };
  } catch (error) { return { ok:false, reason:`Facilitator capability check failed: ${error.message}` }; }
}

export default async function handler(req, res) {
  const networkKey = String(req.method === "GET" ? req.query?.network : req.body?.network || "atlantic");
  let net;
  try { net = getNetwork(networkKey); } catch (error) { return res.status(400).json({ error:error.message }); }
  const config = terms(net.key);
  const facilitator = await facilitatorStatus(config.facilitator, config.network, config.facilitatorToken);
  const configured = process.env.X402_ENABLED === "true" && Boolean(config.payTo && config.asset && config.amount && config.facilitator);
  if (req.method === "GET") return res.status(200).json({
    service:"OATH Premium Intelligence", network:net.name, caip2:net.caip2,
    scheme:"exact", amount:config.amount || null, asset:config.asset || null, recipient:config.payTo || null,
    facilitator:config.facilitator || null, configured, facilitatorSupported:facilitator.ok,
    status:configured && facilitator.ok ? "ready" : "unavailable",
    reason:!configured ? "Set the network-specific receiver, payment asset, base-unit price, facilitator URL, and X402_ENABLED=true." : facilitator.reason,
    deliverable:"Extended read-only Pharos investigation report"
  });
  if (req.method !== "POST") return res.status(405).json({ error:"GET or POST required." });
  if (!configured) return res.status(503).json({ error:"Paid intelligence is not configured for this network.", ...facilitator });
  if (!facilitator.ok) return res.status(503).json({ error:"The configured facilitator does not verify this network; paid delivery is disabled.", ...facilitator });
  if (!/^0x[a-fA-F0-9]{40}$/.test(config.payTo) || !/^0x[a-fA-F0-9]{40}$/.test(config.asset) || !/^\d{1,78}$/.test(config.amount) || BigInt(config.amount) === 0n || BigInt(config.amount) >= 2n ** 256n) return res.status(503).json({ error:"Payment configuration is invalid. payTo and asset must be EVM addresses; amount must be a positive uint256 in base units." });
  const facilitatorClient = new HTTPFacilitatorClient({
    url:config.facilitator,
    ...(config.facilitatorToken ? { createAuthHeaders:async () => {
      const authorization = { Authorization:`Bearer ${config.facilitatorToken}` };
      return { verify:authorization, settle:authorization, supported:authorization };
    } } : {})
  });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(config.network, new ExactEvmScheme());
  const app = express();
  app.use(express.json({ limit:"8kb" }));
  app.use(paymentMiddleware({
    "POST /api/market": {
      accepts:[{ scheme:"exact", network:config.network, payTo:config.payTo, price:{ amount:config.amount, asset:config.asset } }],
      description:"Extended OATH on-chain investigation report",
      mimeType:"application/json"
    }
  }, resourceServer));
  app.post("/api/market", async (request, response) => {
    try {
      const query = String(request.body?.query || "").trim();
      if (!query || query.length > 1000) return response.status(400).json({ error:"Provide a question up to 1,000 characters." });
      const source = String(request.body?.source || "auto");
      if (!["auto", "rpc", "mcp"].includes(source)) return response.status(400).json({ error:"Source must be auto, rpc, or mcp." });
      const hashes = [...query.matchAll(/0x[a-fA-F0-9]{64}/g)].map(match => match[0]);
      const addresses = [...query.matchAll(/0x[a-fA-F0-9]{40}/g)].map(match => match[0]);
      const plan = hashes.length ? [{ name:"inspect_transaction", args:{ hash:hashes[0] } }]
        : /allowance|approval|spender/i.test(query) && addresses.length >= 3 ? [{ name:"inspect_erc20_allowance", args:{ token:addresses[0], owner:addresses[1], spender:addresses[2] } }]
        : addresses.length ? [{ name:"investigate_address", args:{ address:addresses[0] } }]
        : [{ name:"network_status", args:{} }];
      if (/documentation|standard|x402|network configuration|how does/i.test(query)) plan.push({ name:"search_pharos_docs", args:{ query } });
      const toolCalls = await Promise.all(plan.map(async tool => {
        try { return { name:tool.name, result:await runTool(tool.name, { ...tool.args, network:net.key, source }) }; }
        catch (error) { return { name:tool.name, error:error.message }; }
      }));
      const report = { objective:query, network:net.name, toolCalls, assessment:"Findings are limited to the returned RPC/MCP evidence. Unknowns are stated per tool result; this service does not certify contract safety." };
      return response.status(200).json({ service:"OATH Premium Intelligence", requestedQuery:query, network:net.name, report, payment:{ verifiedByMiddleware:true, receipt:response.getHeader("X-PAYMENT-RESPONSE") || response.getHeader("PAYMENT-RESPONSE") || null } });
    } catch (error) { return response.status(502).json({ error:error.message || "Report generation failed." }); }
  });
  return app(req, res);
}
