function rpcEndpoints(primary, fallbackList = "") {
  return Object.freeze([...new Set([primary, ...fallbackList.split(",").map(url => url.trim()).filter(Boolean)])]);
}

export const NETWORKS = Object.freeze({
  atlantic: Object.freeze({
    key: "atlantic", name: "Pharos Atlantic Testnet", chainId: 688689,
    caip2: "eip155:688689", chainIdHex: "0xa8231", nativeSymbol: "PHRS",
    rpcUrl: process.env.PHAROS_ATLANTIC_RPC_URL || "https://atlantic.dplabs-internal.com",
    rpcUrls: rpcEndpoints(process.env.PHAROS_ATLANTIC_RPC_URL || "https://atlantic.dplabs-internal.com", process.env.PHAROS_ATLANTIC_RPC_FALLBACK_URLS),
    explorerUrl: "https://atlantic.pharosscan.xyz"
  }),
  pacific: Object.freeze({
    key: "pacific", name: "Pharos Pacific Mainnet", chainId: 1672,
    caip2: "eip155:1672", chainIdHex: "0x688", nativeSymbol: "PROS",
    rpcUrl: process.env.PHAROS_PACIFIC_RPC_URL || "https://rpc.pharos.xyz",
    rpcUrls: rpcEndpoints(process.env.PHAROS_PACIFIC_RPC_URL || "https://rpc.pharos.xyz", process.env.PHAROS_PACIFIC_RPC_FALLBACK_URLS),
    explorerUrl: "https://www.pharosscan.xyz"
  })
});

export function getNetwork(value) {
  const network = NETWORKS[String(value || "atlantic").toLowerCase()];
  if (!network) throw new Error("Unsupported network. Select Atlantic testnet or Pacific mainnet.");
  return network;
}
