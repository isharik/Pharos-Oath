import { getNetwork } from "./networks.js";
import { pharosMcpCall } from "./mcp.js";

const SAFE_METHODS = new Set([
  "eth_chainId", "eth_blockNumber", "eth_gasPrice", "eth_maxPriorityFeePerGas",
  "eth_getBalance", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByNumber",
  "eth_getLogs", "eth_call", "eth_estimateGas", "web3_clientVersion"
]);

export async function rpcRequest(networkKey, method, params = [], source = "rpc") {
  const network = getNetwork(networkKey);
  if (!SAFE_METHODS.has(method)) throw new Error(`RPC method ${method} is not enabled by OATH.`);
  if (method === "eth_getLogs") {
    const filter = params[0];
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new Error("eth_getLogs requires a filter object.");
    const parseBlock = value => {
      if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
      if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) return BigInt(value);
      if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
      return null;
    };
    const from = parseBlock(filter.fromBlock), to = parseBlock(filter.toBlock);
    if (from === null || to === null || to < from || to - from > 999n) throw new Error("eth_getLogs requires an ordered numeric range spanning at most 1,000 blocks.");
  }
  if (source === "mcp" || source === "auto") {
    let viaMcp;
    try { viaMcp = await pharosMcpCall(network, method, params); }
    catch (error) { if (source === "mcp") throw error; }
    if (viaMcp?.used) {
      try { return normalizeMcpResult(network, method, viaMcp.result); }
      catch (error) { if (source === "mcp") throw error; }
    }
    if (source === "mcp") throw new Error(`Selected MCP cannot serve ${method} on ${network.name}: ${viaMcp?.reason || "endpoint is unavailable"}`);
  }
  let lastError;
  for (const rpcUrl of network.rpcUrls || [network.rpcUrl]) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}.`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || "RPC request failed.");
      const observed = method === "eth_chainId" ? payload.result : await fetchChainId(rpcUrl);
      const actual = Number.parseInt(observed, 16);
      if (actual !== network.chainId) throw new Error(`Endpoint returned chain ${actual}; expected ${network.chainId}.`);
      return payload.result;
    } catch (error) { lastError = error; }
  }
  throw new Error(`All configured ${network.name} RPC endpoints failed: ${lastError?.message || "no endpoints configured"}`);
}

export async function chainRequest(networkKey, method, params = [], source = "auto") {
  if (!["auto", "rpc", "mcp"].includes(source)) throw new Error("Read source must be Automatic, RPC, or MCP.");
  const network = getNetwork(networkKey);
  if (source !== "rpc") {
    let viaMcp;
    try { viaMcp = await pharosMcpCall(network, method, params); }
    catch (error) { if (source === "mcp") throw error; }
    if (viaMcp?.used) {
      try { return { result: normalizeMcpResult(network, method, viaMcp.result), source: "Pharos Chain MCP", network:network.key, chainId:network.chainId }; }
      catch (error) { if (source === "mcp") throw error; }
    }
    if (source === "mcp") throw new Error(`Selected MCP cannot serve ${method} on ${network.name}: ${viaMcp?.reason || "endpoint is unavailable"}`);
  }
  return { result: await rpcRequest(network.key, method, params), source:"Pharos JSON-RPC", network:network.key, chainId:network.chainId };
}

function normalizeMcpResult(network, method, value) {
  const quantity = (raw) => {
    if (typeof raw === "string" && /^0x[0-9a-f]+$/i.test(raw)) return raw;
    if (/^\d+$/.test(String(raw))) return `0x${BigInt(raw).toString(16)}`;
    throw new Error(`Pharos MCP returned an invalid ${method} value.`);
  };
  if (method === "eth_chainId") {
    const id = Number(value?.chainId ?? value?.data?.chainId ?? value?.expectedChainId ?? value);
    if (!Number.isFinite(id)) throw new Error("Pharos MCP returned no verifiable chain ID.");
    if (id !== network.chainId) throw new Error(`Pharos MCP reports chain ${id}; expected ${network.chainId}.`);
    return `0x${id.toString(16)}`;
  }
  if (method === "eth_blockNumber") {
    const raw = value?.blockNumber ?? value?.number ?? value?.data?.blockNumber ?? value;
    return quantity(raw);
  }
  if (["eth_gasPrice","eth_maxPriorityFeePerGas"].includes(method)) {
    const raw = value?.gasPrice ?? value?.gasPriceWei ?? value?.data?.gasPrice ?? value;
    return quantity(raw);
  }
  const properties = {
    eth_getBalance:["balance","balanceWei","value"], eth_getCode:["code","bytecode"],
    eth_getTransactionCount:["transactionCount","nonce"], eth_getTransactionByHash:["transaction","tx"],
    eth_getTransactionReceipt:["receipt"], eth_getStorageAt:["value","storage"],
    eth_call:["returnData","result","data"], eth_estimateGas:["gas","gasLimit","estimatedGas"], eth_getLogs:["logs"]
  };
  let result = value;
  for (const property of properties[method] || []) if (value?.[property] !== undefined) { result = value[property]; break; }
  if (["eth_getBalance","eth_getTransactionCount","eth_estimateGas"].includes(method)) return quantity(result);
  if (["eth_getCode","eth_getStorageAt","eth_call"].includes(method)) {
    if (typeof result !== "string" || !/^0x[0-9a-f]*$/i.test(result)) throw new Error(`Pharos MCP returned a non EVM result for ${method}.`);
    return result;
  }
  if (method === "eth_getLogs" && !Array.isArray(result)) throw new Error("Pharos MCP returned invalid logs.");
  if (["eth_getBlockByNumber","eth_getTransactionByHash","eth_getTransactionReceipt"].includes(method) && result !== null && (typeof result !== "object" || Array.isArray(result))) throw new Error(`Pharos MCP returned an invalid ${method} object.`);
  return result?.result ?? result?.data ?? result;
}

async function fetchChainId(url) {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Unable to verify RPC chain ID (HTTP ${response.status}).`);
  const data = await response.json();
  if (data.error || !data.result) throw new Error("Unable to verify RPC chain ID.");
  return data.result;
}
