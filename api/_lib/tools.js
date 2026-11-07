import { getNetwork } from "./networks.js";
import { rpcRequest } from "./rpc.js";
import { docsMcpSearch, pharosMcpCall } from "./mcp.js";
import { createHash } from "node:crypto";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const selector = { allowance: "0xdd62ed3e", approve: "0x095ea7b3", transfer: "0xa9059cbb", transferFrom: "0x23b872dd", name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567" };
const word = (address) => address.slice(2).toLowerCase().padStart(64, "0");
const amount = (wei, decimals = 18) => {
  const n = BigInt(wei || "0x0"); const scale = 10n ** BigInt(decimals);
  const whole = n / scale; const frac = String(n % scale).padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
};

async function withMcpEvidence(network, method, params, result, source = "auto") {
  if (source === "rpc") return { ...result, evidenceSources: { rpc: "selected Pharos JSON-RPC", pharosChainMcp: { used: false, reason: "RPC was selected." } } };
  try {
    const mcp = await pharosMcpCall(network, method, params);
    return { ...result, evidenceSources: { selected:source, pharosChainMcp: mcp.used ? { used: true, chain: network.name, corroboratingResult: mcp.result } : { used: false, reason: mcp.reason }, rpcFallback:source === "auto" && !mcp.used } };
  } catch (error) {
    return { ...result, evidenceSources: { selected:source, pharosChainMcp: { used: false, reason: error.message }, rpcFallback:source === "auto" } };
  }
}

export async function runTool(name, args = {}) {
  const network = getNetwork(args.network);
  if (name === "network_status") {
    const [chainId, block, gasPrice] = await Promise.all([
      rpcRequest(network.key, "eth_chainId", [], args.source || "auto"), rpcRequest(network.key, "eth_blockNumber", [], args.source || "auto"),
      rpcRequest(network.key, "eth_gasPrice", [], args.source || "auto")
    ]);
    const actualId = Number.parseInt(chainId, 16);
    return withMcpEvidence(network, "eth_blockNumber", [], { facts: { network: network.name, expectedChainId: network.chainId, observedChainId: actualId, block: Number.parseInt(block, 16), gasPriceWei: BigInt(gasPrice).toString() }, evidence: ["eth_chainId", "eth_blockNumber", "eth_gasPrice"], classification: actualId === network.chainId ? "VERIFIED" : "DANGER", unknowns: ["Validator health and finality are not independently checked."] }, args.source || "auto");
  }
  if (name === "investigate_address") {
    if (!ADDRESS.test(args.address || "")) throw new Error("Invalid EVM address.");
    const [balance, code, nonce, block] = await Promise.all([
      rpcRequest(network.key, "eth_getBalance", [args.address, "latest"], args.source || "auto"), rpcRequest(network.key, "eth_getCode", [args.address, "latest"], args.source || "auto"),
      rpcRequest(network.key, "eth_getTransactionCount", [args.address, "latest"], args.source || "auto"), rpcRequest(network.key, "eth_blockNumber", [], args.source || "auto")
    ]);
    const isContract = code !== "0x" && code !== "0x0";
    return withMcpEvidence(network, "eth_getBalance", [args.address, "latest"], { facts: { address: args.address, nativeBalance: `${amount(balance)} ${network.nativeSymbol}`, codeBytes: isContract ? (code.length - 2) / 2 : 0, hasCode: isContract, nonce: Number.parseInt(nonce, 16), block: Number.parseInt(block, 16) }, evidence: ["eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_blockNumber"], classification: isContract ? "CAUTION" : "UNKNOWN", unknowns: ["Source verification, permissions, audit status, and intent were not established by these reads."] }, args.source || "auto");
  }
  if (name === "inspect_contract") {
    if (!ADDRESS.test(args.address || "")) throw new Error("Invalid contract address.");
    const code = await rpcRequest(network.key, "eth_getCode", [args.address, "latest"], args.source || "auto");
    const deployed = code !== "0x" && code !== "0x0";
    const result = { facts:{ address:args.address, hasCode:deployed, bytecodeBytes:deployed ? Math.max(0,(code.length-2)/2) : 0, bytecodeSha256:deployed ? createHash("sha256").update(code).digest("hex") : null, selector:deployed ? code.slice(0,10) : null }, evidence:["eth_getCode"], classification:deployed?"UNKNOWN":"DANGER", unknowns:[deployed?"Bytecode presence and fingerprint do not establish source verification, audit status, permissions, or runtime behavior.":"No contract bytecode was returned at this address on the selected network."] };
    return withMcpEvidence(network,"eth_getCode",[args.address,"latest"],result,args.source||"auto");
  }
  if (name === "inspect_transaction") {
    if (!HASH.test(args.hash || "")) throw new Error("Invalid transaction hash.");
    const tx = await rpcRequest(network.key, "eth_getTransactionByHash", [args.hash], args.source || "auto");
    if (!tx) return { facts: { hash: args.hash, found: false }, evidence: ["eth_getTransactionByHash"], classification: "UNKNOWN", unknowns: ["The selected RPC returned no transaction for this hash."] };
    const receipt = await rpcRequest(network.key, "eth_getTransactionReceipt", [args.hash], args.source || "auto");
    const success = receipt ? receipt.status === "0x1" : null;
    const recognized = { "0x095ea7b3": "approve(address,uint256)", "0xa9059cbb": "transfer(address,uint256)", "0x23b872dd": "transferFrom(address,address,uint256)" };
    let decoded = "Unknown selector";
    const sig = tx.input?.slice(0, 10);
    if (tx.input === "0x") decoded = "Empty calldata (native transfer or empty call)";
    else if (recognized[sig]) decoded = recognized[sig];
    const facts = { hash: args.hash, status: receipt ? (success ? "success" : "failed") : "pending", from: tx.from, to: tx.to, value: `${amount(tx.value)} ${network.nativeSymbol}`, block: tx.blockNumber ? Number.parseInt(tx.blockNumber, 16) : null, gasUsed: receipt?.gasUsed ? BigInt(receipt.gasUsed).toString() : null, selector: sig || null, recognizedFunction: decoded, receiptLogs: receipt?.logs?.length ?? null };
    return withMcpEvidence(network, "eth_getTransactionByHash", [args.hash], { facts, evidence: ["eth_getTransactionByHash", "eth_getTransactionReceipt"], classification: success === false ? "DANGER" : "UNKNOWN", unknowns: [success === false ? "Receipt shows failure, but this RPC did not provide a transaction trace or revert reason." : "Recognizing a function selector does not prove the complete contract behavior."], explorer: `${network.explorerUrl}/tx/${args.hash}` }, args.source || "auto");
  }
  if (name === "inspect_erc20_allowance") {
    if (![args.token,args.owner,args.spender].every(x => ADDRESS.test(x || ""))) throw new Error("Token, owner, and spender must be valid EVM addresses.");
    const data = selector.allowance + word(args.owner) + word(args.spender);
    const [raw, code] = await Promise.all([rpcRequest(network.key, "eth_call", [{ to: args.token, data }, "latest"], args.source || "auto"), rpcRequest(network.key, "eth_getCode", [args.token, "latest"], args.source || "auto")]);
    if (code === "0x" || code === "0x0") throw new Error("Token address has no deployed code on the selected network.");
    if (!/^0x[0-9a-fA-F]{64,}$/.test(raw)) throw new Error("Token did not return a valid allowance word.");
    const value = BigInt(raw);const unlimited = value >= (1n << 255n);
    return { facts: { token: args.token, owner: args.owner, spender: args.spender, allowanceRaw: value.toString(), isMaxUint256: value === ((1n << 256n) - 1n) }, evidence: ["eth_call allowance(address,address)", "eth_getCode"], classification: unlimited ? "DANGER" : value > 0n ? "CAUTION" : "UNKNOWN", unknowns: ["The token's metadata and decimals were not assumed; allowance is shown in raw units."] };
  }
  if (name === "estimate_transaction") {
    if (args.to && !ADDRESS.test(args.to)) throw new Error("Invalid destination address.");
    if (args.from && !ADDRESS.test(args.from)) throw new Error("Invalid sender address.");
    if (args.data && !/^0x([a-fA-F0-9]{2})*$/.test(args.data)) throw new Error("Transaction data must be 0x-prefixed hex bytes.");
    const transaction = { ...(args.from ? { from: args.from } : {}), to: args.to, ...(args.value ? { value: args.value } : {}), ...(args.data ? { data: args.data } : {}) };
    const [gas, gasPrice] = await Promise.all([rpcRequest(network.key, "eth_estimateGas", [transaction], args.source || "auto"), rpcRequest(network.key, "eth_gasPrice", [], args.source || "auto")]);
    const limit = (BigInt(gas) * 120n + 99n) / 100n;
    return { facts: { estimatedGas: BigInt(gas).toString(), suggestedGasLimit: limit.toString(), gasPriceWei: BigInt(gasPrice).toString(), estimatedFeeNative: amount((limit * BigInt(gasPrice)).toString(), 18) }, evidence: ["eth_estimateGas", "eth_gasPrice"], classification: "CAUTION", unknowns: ["Gas estimation is not a full state simulation and does not guarantee successful execution."] };
  }
  if (name === "search_pharos_docs") return docsMcpSearch(`${String(args.query || "").slice(0, 1000)}; target network ${network.name}, chain ${network.chainId}`);
  throw new Error(`Unsupported read-only OATH tool: ${name}`);
}
