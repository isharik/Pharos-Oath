const PROVIDERS = {
  nvidia: {
    label: "NVIDIA NIM · Nemotron 3.5 Super VL",
    key: "NVIDIA_API_KEY",
    model: () => process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b",
    baseUrl: () => (process.env.NVIDIA_API_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "")
  },
  gemini: {
    label: "Google Gemini",
    key: "GEMINI_API_KEY",
    model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash"
  }
};

export function getAiConfig() {
  const requested = String(process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  const provider = requested === "auto"
    ? (process.env.NVIDIA_API_KEY ? "nvidia" : process.env.GEMINI_API_KEY ? "gemini" : "nvidia")
    : ["google", "google-gemini"].includes(requested) ? "gemini"
      : ["nvidia-nim", "nemotron"].includes(requested) ? "nvidia"
        : requested;
  if (provider === "skill-engine") return { provider, label: "Pharos Skill Engine", configured: false, model: null };
  const config = PROVIDERS[provider] || PROVIDERS.nvidia;
  return {
    provider: PROVIDERS[provider] ? provider : "nvidia",
    label: config.label,
    configured: Boolean(process.env[config.key]),
    model: config.model(),
    apiKey: process.env[config.key] || "",
    ...(provider === "nvidia" ? { baseUrl: config.baseUrl() } : {})
  };
}
