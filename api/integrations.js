import { getNetwork } from "./_lib/networks.js";
import { mcpSession, pharosMcpStatus } from "./_lib/mcp.js";
import { rpcRequest } from "./_lib/rpc.js";
import { PHAROS_SKILLS } from "./_lib/skill-engine.js";

async function inspectMcp(url, token, contains) {
  if (!url) return { configured:false, status:"not_configured" };
  return mcpSession(url, token, async client => {
    try {
      const data = await client.send("tools/list", {});
      const tools = data?.tools || [];
      return { configured:true, status:tools.some(tool => contains.test(`${tool.name} ${tool.description || ""}`)) ? "connected" : "connected_no_matching_tool", tools:tools.map(x=>x.name) };
    } finally { await client.close(); }
  }).catch(error => ({ configured:true, status:"unavailable", error:error.message }));
}

async function inspectDocsIndex(url) {
  try {
    const response = await fetch(url, { signal:AbortSignal.timeout(8000), headers:{ accept:"text/plain, text/markdown, */*" } });
    if (!response.ok) return { status:"unavailable", endpoint:url, error:`HTTP ${response.status}` };
    const index = await response.text();
    return { status:"connected", endpoint:url, entries:index.split(/\r?\n/).filter(line=>/https?:\/\//i.test(line)).length };
  } catch (error) { return { status:"unavailable", endpoint:url, error:error.message }; }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error:"GET required." });
  try {
    const network = getNetwork(req.query?.network);
    const docsIndexUrl = process.env.PHAROS_DOCS_INDEX_URL || "https://docs.pharos.xyz/llms.txt";
    const [chainMcp, docsMcp, docsIndex, chain] = await Promise.all([
      pharosMcpStatus(network),
      inspectMcp(process.env.PHAROS_DOCS_MCP_URL, process.env.PHAROS_DOCS_MCP_TOKEN, /search|docs|fetch|query/i),
      inspectDocsIndex(docsIndexUrl),
      rpcRequest(network.key,"eth_chainId").then(value=>({status:Number.parseInt(value,16)===network.chainId?"connected":"chain_mismatch",chainId:Number.parseInt(value,16)})).catch(error=>({status:"unavailable",error:error.message}))
    ]);
    return res.status(200).json({ network:network.key, integrations:{
      chainMcp:{...chainMcp, note:network.chainId===688689&&chainMcp.status==="connected"&&!chainMcp.selectedNetworkCompatible?"Atlantic requires an MCP endpoint configured with chain ID 688689; OATH verifies before using it.":chainMcp.note},
      rpc:chain,
      developerDocsMcp:docsMcp,
      developerDocsIndex:docsIndex,
      developerDocs:{status:docsIndex.status,transport:"llms.txt index plus canonical Markdown pages",endpoint:docsIndex.endpoint,mcpConfigured:docsMcp.configured},
      skillEngine:{status:"ready",provider:"Pharos Skill Engine workflow adapter",upstream:"https://github.com/PharosNetwork/pharos-skill-engine",workflowCount:PHAROS_SKILLS.length,workflows:PHAROS_SKILLS.map(({id,title})=>({id,title})),note:"OATH executes the published Pharos read/query workflows through its chain-validated RPC/MCP adapters. Signing and broadcasting remain in the connected wallet."},
      gemini:{configured:Boolean(process.env.GEMINI_API_KEY),model:process.env.GEMINI_MODEL||"gemini-2.5-flash"}
    }});
  } catch (error) { return res.status(400).json({ error:error.message }); }
}
