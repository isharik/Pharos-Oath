import { getNetwork } from "./networks.js";
import { runTool } from "./tools.js";

// The published Pharos Skill Engine is an installable Agent Skill (instructions
// and references), not an HTTP/MCP service. This adapter executes its supported
// query workflows through OATH's chain-ID-checked RPC/Chain MCP tool layer.
export const PHAROS_SKILLS = Object.freeze([
  { id:"network-health", title:"Network health", operation:"network_status", source:"SKILL.md#network-configuration" },
  { id:"wallet-investigation", title:"Wallet investigation", operation:"investigate_address", source:"references/query.md#address-portfolio-wallet-asset-overview" },
  { id:"contract-inspection", title:"Contract inspection", operation:"inspect_contract", source:"references/query.md#contract-read-only-call" },
  { id:"transaction-analysis", title:"Transaction analysis", operation:"inspect_transaction", source:"references/query.md#transaction-query" },
  { id:"approval-risk-assessment", title:"Approval risk assessment", operation:"inspect_erc20_allowance", source:"references/query.md#contract-read-only-call" },
  { id:"failed-transaction-diagnosis", title:"Failed transaction diagnosis", operation:"inspect_transaction", source:"references/query.md#transaction-query" },
  { id:"transaction-preparation", title:"Transaction preparation", operation:"estimate_transaction", source:"references/transaction.md#gas-estimation" },
  { id:"post-execution-verification", title:"Post-execution verification", operation:"inspect_transaction", source:"references/query.md#transaction-status-determination-logic" },
  { id:"developer-docs-lookup", title:"Developer docs lookup", operation:"search_pharos_docs", source:"https://docs.pharos.xyz/llms.txt" }
]);

export const PHAROS_SKILL_TOOL = { functionDeclarations:[{
  name:"run_pharos_skill",
  description:"Select and execute one published Pharos Skill Engine workflow using OATH's validated read-only RPC/MCP adapters. It cannot sign, broadcast, deploy, or access a private key.",
  parameters:{ type:"OBJECT", properties:{
    skillId:{ type:"STRING", enum:PHAROS_SKILLS.map(skill=>skill.id) },
    address:{ type:"STRING" }, hash:{ type:"STRING" }, token:{ type:"STRING" }, owner:{ type:"STRING" }, spender:{ type:"STRING" },
    from:{ type:"STRING" }, to:{ type:"STRING" }, value:{ type:"STRING" }, data:{ type:"STRING" }, query:{ type:"STRING" }
  }, required:["skillId"] }
}]};

export function choosePharosSkill(message, connectedAddress) {
  const text = String(message || "");
  const hashes = text.match(/0x[a-fA-F0-9]{64}/g) || [];
  const addresses = text.match(/0x[a-fA-F0-9]{40}/g) || [];
  if (/approval|allowance|spender|approve/i.test(text) && addresses.length >= 3) return { skillId:"approval-risk-assessment", args:{ token:addresses[0], owner:addresses[1], spender:addresses[2] } };
  if (hashes.length && /fail|revert|error|went wrong|autopsy|diagnos/i.test(text)) return { skillId:"failed-transaction-diagnosis", args:{ hash:hashes[0] } };
  if (hashes.length) return { skillId:"transaction-analysis", args:{ hash:hashes[0] } };
  if (/estimate|prepare|gas/i.test(text) && addresses.length) return { skillId:"transaction-preparation", args:{ to:addresses[0] } };
  if (/contract|bytecode|code|storage/i.test(text) && addresses.length) return { skillId:"contract-inspection", args:{ address:addresses[0] } };
  if (/docs?|documentation|standard|x402|network config|how does/i.test(text)) return { skillId:"developer-docs-lookup", args:{ query:text.slice(0,1000) } };
  if (addresses.length) return { skillId:"wallet-investigation", args:{ address:addresses[0] } };
  if (/balance|wallet|holdings|portfolio/i.test(text)) return { skillId:"wallet-investigation", args:{ ...( /^0x[a-fA-F0-9]{40}$/.test(connectedAddress||"") ? { address:connectedAddress } : {}) } };
  return { skillId:"network-health", args:{} };
}

export async function runPharosSkill(skillId, input = {}) {
  const skill = PHAROS_SKILLS.find(entry=>entry.id===skillId);
  if (!skill) throw new Error("Unknown Pharos Skill Engine workflow.");
  const network = getNetwork(input.network);
  const args = { ...input, network:network.key, source:input.source || "auto" };
  let result;
  switch (skillId) {
    case "network-health":
      result = await runTool("network_status", args); break;
    case "wallet-investigation":
      if (!input.address) throw new Error("Wallet investigation needs a public address.");
      result = await runTool("investigate_address", args); break;
    case "contract-inspection":
      if (!input.address) throw new Error("Contract inspection needs a contract address.");
      result = await runTool("inspect_contract", args); break;
    case "transaction-analysis":
    case "failed-transaction-diagnosis":
    case "post-execution-verification":
      if (!input.hash) throw new Error("Transaction workflow needs a transaction hash.");
      result = await runTool("inspect_transaction", args);
      if (skillId === "failed-transaction-diagnosis" && result.facts?.status !== "failed") result = { ...result, diagnosis:"The transaction receipt is not marked failed; no failure cause is inferred." };
      break;
    case "approval-risk-assessment":
      if (![input.token,input.owner,input.spender].every(Boolean)) throw new Error("Approval assessment needs token, owner, and spender addresses.");
      result = await runTool("inspect_erc20_allowance", args); break;
    case "transaction-preparation":
      if (!input.to) throw new Error("Transaction preparation needs a destination address.");
      result = await runTool("estimate_transaction", args); break;
    case "developer-docs-lookup":
      if (!input.query) throw new Error("Developer documentation lookup needs a question.");
      result = await runTool("search_pharos_docs", args); break;
  }
  return {
    skill:{ id:skill.id, title:skill.title, upstream:"https://github.com/PharosNetwork/pharos-skill-engine", reference:skill.source },
    execution:{ network:network.name, chainId:network.chainId, requestedSource:args.source, mode:"OATH read-only Skill Engine adapter" },
    ...result
  };
}
