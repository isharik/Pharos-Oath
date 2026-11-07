import { getNetwork } from "./_lib/networks.js";
import { docsMcpSearch } from "./_lib/mcp.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required." });
  const query = String(req.body?.query || "").trim();
  if (!query || query.length > 1000) return res.status(400).json({ error: "Enter a documentation question up to 1,000 characters." });
  try {
    const network = getNetwork(req.body?.network);
    const mcp = await docsMcpSearch(`${query}; target network ${network.name}, chain ${network.chainId}`).catch((error) => ({ configured: true, available: false, message: error.message }));
    if (mcp.available) return res.status(200).json({ source: mcp.provider || "Pharos Developer Docs MCP", network: network.key, ...mcp });
    return res.status(200).json({ source: "Official Pharos docs reference", network: network.key, docsMcpConfigured: mcp.configured, message: mcp.message || "Docs MCP did not return a usable result.", references: ["https://docs.pharos.xyz/", "https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide"] });
  } catch (error) { return res.status(502).json({ error: error.message }); }
}
