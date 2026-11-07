import { NETWORKS } from "./_lib/networks.js";
import { PHAROS_SKILLS } from "./_lib/skill-engine.js";
import { getAiConfig } from "./_lib/ai-config.js";

export default function handler(req, res) {
  const ai = getAiConfig();
  const registryAddresses = {
    atlantic: process.env.OATH_REGISTRY_ATLANTIC_ADDRESS || process.env.OATH_REGISTRY_ADDRESS || null,
    pacific: process.env.OATH_REGISTRY_PACIFIC_ADDRESS || null
  };
  const x402Ready = process.env.X402_ENABLED === "true" && ["ATLANTIC", "PACIFIC"].some(network => {
    const facilitator = process.env[`X402_${network}_FACILITATOR_URL`] || process.env.X402_FACILITATOR_URL;
    const payTo = process.env[`X402_${network}_PAY_TO`];
    const asset = process.env[`X402_${network}_ASSET`];
    const amount = process.env[`X402_${network}_PRICE_BASE_UNITS`];
    return Boolean(facilitator && /^0x[a-fA-F0-9]{40}$/.test(payTo || "") && /^0x[a-fA-F0-9]{40}$/.test(asset || "") && /^\d{1,78}$/.test(amount || "") && BigInt(amount) > 0n && BigInt(amount) < 2n ** 256n);
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    networks: Object.values(NETWORKS).map(({ key, name, chainId, caip2, chainIdHex, nativeSymbol, explorerUrl }) => ({ key, name, chainId, caip2, chainIdHex, nativeSymbol, explorerUrl })),
    ai: { configured: ai.configured },
    integrations: {
      pharosChainMcp: true,
      developerDocsMcp: Boolean(process.env.PHAROS_DOCS_MCP_URL),
      developerDocsIndex: process.env.PHAROS_DOCS_INDEX_URL || "https://docs.pharos.xyz/llms.txt",
      skillEngine: { provider:"Pharos Skill Engine workflow adapter", workflowCount:PHAROS_SKILLS.length },
      rpc: true,
      x402: x402Ready,
      registry: Boolean(registryAddresses.atlantic || registryAddresses.pacific)
    },
    registryAddresses,
    registryAddress: registryAddresses.atlantic,
    x402: { enabled: x402Ready }
  });
}
