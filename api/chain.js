import { getNetwork } from "./_lib/networks.js";
import { chainRequest } from "./_lib/rpc.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required." });
  try {
    const { network: key = "atlantic", method, params = [], source = "auto" } = req.body || {};
    const network = getNetwork(key);
    if (typeof method !== "string" || !Array.isArray(params)) return res.status(400).json({ error: "Invalid RPC request." });
    if (params.length > 4 || Buffer.byteLength(JSON.stringify(params), "utf8") > 12 * 1024) return res.status(413).json({ error: "RPC parameters exceed OATH's safe request limit." });
    const result = await chainRequest(network.key, method, params, source);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(502).json({ error: error.message || "Chain query failed." });
  }
}
