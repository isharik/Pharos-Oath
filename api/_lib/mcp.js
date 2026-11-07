const PROTOCOL_VERSION = "2025-03-26";

function pickMessage(payload) {
  if (payload && typeof payload === "object") return payload;
  const events = String(payload).split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  for (const event of events.reverse()) {
    try { const value = JSON.parse(event); if (value?.result || value?.error) return value; } catch { /* other SSE event */ }
  }
  throw new Error("MCP server returned no JSON-RPC result.");
}

function parseContentJson(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  const text = (result?.content || []).map(part => part.text || "").join("\n").trim();
  try { return JSON.parse(text); } catch { return { text }; }
}

export async function mcpSession(url, token, call) {
  let sessionId;
  let id = 0;
  async function send(method, params, notification = false) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const body = { jsonrpc: "2.0", method, params };
    if (!notification) body.id = ++id;
    const response = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(12000)
    });
    sessionId ||= response.headers.get("mcp-session-id") || undefined;
    if (response.status === 202 && notification) return null;
    if (!response.ok) throw new Error(`MCP ${method} returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (notification && !contentType.includes("json") && !contentType.includes("event-stream")) return null;
    const raw = contentType.includes("json") ? await response.json() : await response.text();
    const envelope = pickMessage(raw);
    if (envelope.error) throw new Error(envelope.error.message || `MCP ${method} failed.`);
    return envelope.result;
  }
  await send("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "pharos-oath", version: "0.2.0" }
  });
  await send("notifications/initialized", {}, true);
  return call({ send, close: async () => {
    if (!sessionId) return;
    const headers = { "mcp-session-id": sessionId };
    if (token) headers.authorization = `Bearer ${token}`;
    await fetch(url, { method: "DELETE", headers, signal: AbortSignal.timeout(2500) }).catch(() => {});
  }});
}

const chainMcpMetadata = new Map();
function chainMcpConfig(network) {
  const prefix = network.key === "atlantic" ? "PHAROS_ATLANTIC_MCP" : "PHAROS_PACIFIC_MCP";
  return {
    url:process.env[`${prefix}_URL`] || process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp",
    token:process.env[`${prefix}_TOKEN`] || process.env.PHAROS_MCP_TOKEN
  };
}

async function getChainMcpMetadata(network) {
  const {url,token}=chainMcpConfig(network);
  const key=`${url}|${network.chainId}|${token ? "authenticated" : "public"}`;
  const current=chainMcpMetadata.get(key);
  if(current?.pending)return current.pending;
  if(current?.value&&current.expires>Date.now())return current.value;
  const entry={expires:Date.now()+20000,value:null,pending:null};
  entry.pending=mcpSession(url,token,async client=>{
    try{
      const listed=await client.send("tools/list",{});
      const names=(listed?.tools||[]).map(tool=>tool.name);
      if(!names.includes("get_chain_info"))return {available:false,toolNames:names,reason:"Configured Pharos MCP does not expose get_chain_info."};
      const result=await client.send("tools/call",{name:"get_chain_info",arguments:{}});
      const data=parseContentJson(result);
      const chainId=Number(data.chainId??data.expectedChainId??data.data?.chainId);
      return {available:true,chainId,networkMatch:chainId===network.chainId,toolNames:names,data};
    }finally{await client.close()}
  }).then(value=>{entry.value=value;entry.pending=null;entry.expires=Date.now()+20000;return value}).catch(error=>{entry.value={available:false,error:error.message,reason:`Pharos Chain MCP connection failed: ${error.message}`};entry.pending=null;entry.expires=Date.now()+5000;return entry.value});
  chainMcpMetadata.set(key,entry);
  return entry.pending;
}

export async function pharosMcpCall(network, method, params) {
  const {url,token}=chainMcpConfig(network);
  const metadata=await getChainMcpMetadata(network);
  if(!metadata.available)return {used:false,reason:metadata.reason};
  if(metadata.chainId!==network.chainId)return {used:false,reason:`Configured Pharos MCP serves chain ${Number.isFinite(metadata.chainId)?metadata.chainId:"an unknown network"}, expected ${network.chainId}. Configure ${network.key==='atlantic'?'PHAROS_ATLANTIC_MCP_URL':'PHAROS_PACIFIC_MCP_URL'} for this network.`};
  const names=new Set(metadata.toolNames);
      const toolMap = {
        eth_chainId: ["get_chain_info", {}],
        eth_blockNumber: ["get_block_number", {}],
        eth_gasPrice: ["get_gas_price", {}],
        eth_maxPriorityFeePerGas: ["get_gas_price", {}],
        eth_getBalance: ["get_balance", { address: params[0], ...(params[1] ? { block: params[1] } : {}) }],
        eth_getCode: ["get_code", { address: params[0], ...(params[1] ? { block: params[1] } : {}) }],
        eth_getTransactionCount: ["get_transaction_count", { address: params[0], ...(params[1] ? { block: params[1] } : {}) }],
        eth_getTransactionByHash: ["get_transaction", { hash: params[0] }],
        eth_getTransactionReceipt: ["get_transaction_receipt", { hash: params[0] }],
        eth_getStorageAt: ["get_storage_at", { address: params[0], position: params[1], ...(params[2] ? { block: params[2] } : {}) }],
        eth_getBlockByNumber: ["get_block", { block: params[0] || "latest", includeTransactions: Boolean(params[1]) }],
        eth_getLogs: ["get_logs", params[0] || {}],
        eth_call: ["eth_call", { transaction: params[0], ...(params[1] ? { block: params[1] } : {}) }],
        eth_estimateGas: ["estimate_gas", { transaction: params[0] }]
      };
      const mapped = toolMap[method];
      if (!mapped || !names.has(mapped[0])) return { used: false, reason: `MCP tool for ${method} is not exposed.` };
  return mcpSession(url,token,async client=>{
    try{
      const result = await client.send("tools/call", { name: mapped[0], arguments: mapped[1] });
      return { used: true, result: parseContentJson(result), info: metadata.data };
    }finally{await client.close()}
  });
}

export async function pharosMcpNetworkInfo(network) {
  return getChainMcpMetadata(network);
}

export async function pharosMcpStatus(network) {
  try {
    const info = await pharosMcpNetworkInfo(network);
    if (!info.available) return { status: info.error ? "unavailable" : "connected_no_matching_tool", chainId: info.chainId, selectedNetworkCompatible: false, error:info.error, note: info.reason };
    return { status: "connected", chainId: info.chainId, selectedNetworkCompatible: info.networkMatch, tools: info.toolNames, note: info.networkMatch ? undefined : `MCP serves chain ${info.chainId}; selected network is ${network.chainId}.` };
  } catch (error) {
    return { status: "unavailable", selectedNetworkCompatible: false, error: error.message };
  }
}

export async function docsMcpSearch(query) {
  const url = process.env.PHAROS_DOCS_MCP_URL;
  if (!url) {
    const indexUrl = process.env.PHAROS_DOCS_INDEX_URL || "https://docs.pharos.xyz/llms.txt";
    const response = await fetch(indexUrl, { signal: AbortSignal.timeout(10000), headers:{ accept:"text/plain, text/markdown, */*" } });
    if (!response.ok) return { configured:true, available:false, endpoint:indexUrl, message:`Pharos documentation index returned HTTP ${response.status}.` };
    const text = await response.text();
    const terms = String(query).toLowerCase().split(/[^a-z0-9]+/).filter(term=>term.length>2);
    const lines = text.split(/\r?\n/);
    const ranked = lines.map((line,index)=>({line,index,score:terms.reduce((score,term)=>score+(line.toLowerCase().includes(term)?1:0),0)})).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
    const pages = [];
    const seen = new Set();
    for (const entry of ranked) {
      const match = entry.line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)(?::\s*(.*))?/);
      if (!match || seen.has(match[2])) continue;
      let parsedUrl;
      try { parsedUrl = new URL(match[2]); } catch { continue; }
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "docs.pharos.xyz") continue;
      seen.add(match[2]);
      pages.push({ title:match[1].trim(), url:match[2], summary:(match[3]||"").trim(), score:entry.score });
      if (pages.length === 3) break;
    }
    const documents = await Promise.all(pages.map(async page => {
      try {
        const doc = await fetch(page.url, { signal:AbortSignal.timeout(9000), headers:{ accept:"text/markdown, text/plain, */*" } });
        if (!doc.ok) return { ...page, available:false, error:`HTTP ${doc.status}` };
        const markdown = (await doc.text()).slice(0, 120000);
        const paragraphs = markdown.split(/\n\s*\n/).map(part=>part.replace(/\s+/g," ").trim()).filter(Boolean);
        const excerpts = paragraphs.map((paragraph,index)=>({ paragraph,index,score:terms.reduce((score,term)=>score+(paragraph.toLowerCase().includes(term)?1:0),0) })).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).sort((a,b)=>a.index-b.index).map(item=>item.paragraph.slice(0,900));
        return { ...page, available:true, excerpts };
      } catch (error) { return { ...page, available:false, error:error.message }; }
    }));
    return { configured:true, available:true, provider:"Pharos Developer Docs llms.txt", endpoint:indexUrl, query, documents, evidence:documents.filter(doc=>doc.available).flatMap(doc=>doc.excerpts.map(excerpt=>({ title:doc.title, url:doc.url, excerpt }))), note:"The official index selected relevant canonical pages; page excerpts were fetched live. Treat documentation as reference context, not transaction authority." };
  }
  return mcpSession(url, process.env.PHAROS_DOCS_MCP_TOKEN, async (client) => {
    try {
      const list = await client.send("tools/list", {});
      const tool = (list?.tools || []).find((entry) => /search|query|fetch|docs/i.test(`${entry.name} ${entry.description || ""}`));
      if (!tool) return { configured: true, available: false, message: "Configured Docs MCP exposes no recognizable read/search tool." };
      const schema = tool.inputSchema?.properties || {};
      const queryField = ["query", "q", "question", "search_query"].find((key) => key in schema);
      if (!queryField) return { configured: true, available: false, message: `Docs MCP tool ${tool.name} has no known query field.` };
      const result = await client.send("tools/call", { name: tool.name, arguments: { [queryField]: query } });
      return { configured: true, available: true, tool: tool.name, evidence: result?.structuredContent ?? result?.content ?? result };
    } finally { await client.close(); }
  });
}
