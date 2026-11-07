import { encodeFunctionData, decodeFunctionResult } from "viem";
import { getNetwork } from "./_lib/networks.js";
import { rpcRequest } from "./_lib/rpc.js";

const ABI = [
  { type:"function", name:"registerReport", stateMutability:"nonpayable", inputs:[{name:"reportHash",type:"bytes32"}], outputs:[] },
  { type:"function", name:"registerPolicy", stateMutability:"nonpayable", inputs:[{name:"policyHash",type:"bytes32"}], outputs:[] },
  { type:"function", name:"verify", stateMutability:"view", inputs:[{name:"hash",type:"bytes32"}], outputs:[{name:"exists",type:"bool"},{name:"reporter",type:"address"},{name:"timestamp",type:"uint64"},{name:"kind",type:"uint8"}] }
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error:"POST required." });
  try {
    const network = getNetwork(req.body?.network);
    const action = String(req.body?.action || "");
    const source = String(req.body?.source || "auto");
    if (!["auto", "rpc", "mcp"].includes(source)) return res.status(400).json({ error:"Source must be auto, rpc, or mcp." });
    if (!/^0x[a-fA-F0-9]{64}$/.test(req.body?.hash || "")) return res.status(400).json({ error:"Hash must be a 32-byte 0x-prefixed value." });
    const registry = req.body?.registry || (network.key === "atlantic" ? process.env.OATH_REGISTRY_ATLANTIC_ADDRESS || process.env.OATH_REGISTRY_ADDRESS : process.env.OATH_REGISTRY_PACIFIC_ADDRESS);
    if (!/^0x[a-fA-F0-9]{40}$/.test(registry || "")) return res.status(503).json({ error:"No valid OATH Registry address is configured for this network." });
    if (action === "encode") {
      const code = await rpcRequest(network.key, "eth_getCode", [registry, "latest"], source);
      if (!code || code === "0x" || code === "0x0") return res.status(400).json({ error:"No contract bytecode exists at the selected registry address on this network." });
      const kind = req.body?.kind === "policy" ? "registerPolicy" : "registerReport";
      return res.status(200).json({ to:registry, data:encodeFunctionData({ abi:ABI, functionName:kind, args:[req.body.hash] }), network:network.key, chainId:network.chainId, warning:"This only encodes a wallet transaction. The connected user must review and sign it." });
    }
    if (action !== "verify") return res.status(400).json({ error:"Supported actions: encode, verify." });
    const code = await rpcRequest(network.key, "eth_getCode", [registry, "latest"], source);
    if (!code || code === "0x" || code === "0x0") return res.status(400).json({ error:"No contract bytecode exists at the supplied registry address on the selected chain." });
    const data = encodeFunctionData({ abi:ABI, functionName:"verify", args:[req.body.hash] });
    const result = await rpcRequest(network.key, "eth_call", [{ to:registry, data }, "latest"], source);
    const [exists, reporter, timestamp, kind] = decodeFunctionResult({ abi:ABI, functionName:"verify", data:result });
    return res.status(200).json({ network:network.name, registry, hash:req.body.hash, exists, reporter, timestamp:Number(timestamp), kind:Number(kind), evidence:"eth_call verify(bytes32)" });
  } catch (error) { return res.status(502).json({ error:error.message || "Registry request failed." }); }
}
