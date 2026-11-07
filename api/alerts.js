const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const EVENT_TYPES = new Set(["approval", "contract", "wallet", "activity"]);
const WEBHOOK_HOSTS = new Set(["discord.com", "discordapp.com"]);
const sendTimes = new Map();

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === String(host).toLowerCase(); }
  catch { return false; }
}

function clientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function withinRateLimit(req) {
  const now = Date.now();
  const key = clientKey(req);
  const recent = (sendTimes.get(key) || []).filter(time => now - time < 60_000);
  if (recent.length >= 10) return false;
  recent.push(now);
  sendTimes.set(key, recent);
  if (sendTimes.size > 500) {
    for (const [client, times] of sendTimes) if (!times.some(time => now - time < 60_000)) sendTimes.delete(client);
  }
  return true;
}

function webhookUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || !WEBHOOK_HOSTS.has(url.hostname)
      || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) return null;
  url.search = "";
  url.searchParams.set("wait", "true");
  return url;
}

export default async function handler(req, res) {
  const secret = process.env.DISCORD_ALERTS_WEBHOOK_URL || "";
  if (req.method === "GET") return res.status(200).json({ service: "OATH Watch Discord delivery", configured: Boolean(webhookUrl(secret)) });
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST required." });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Same-origin requests only." });
  if (!withinRateLimit(req)) return res.status(429).json({ error: "Discord alert rate limit reached. Try again shortly." });
  const target = webhookUrl(secret);
  if (!target) return res.status(503).json({ error: "Discord delivery is not configured with a valid webhook URL." });

  const { network, wallet, events } = req.body || {};
  if (!new Set(["atlantic", "pacific"]).has(network) || !ADDRESS_RE.test(wallet || "")
      || !Array.isArray(events) || events.length < 1 || events.length > 10) {
    return res.status(400).json({ error: "Provide a supported network, wallet address, and 1–10 alert events." });
  }
  const safeEvents = [];
  for (const event of events) {
    if (!EVENT_TYPES.has(event?.type) || typeof event?.message !== "string" || !event.message.trim() || event.message.length > 280) {
      return res.status(400).json({ error: "An alert event has an invalid type or message." });
    }
    safeEvents.push(`• **${event.type.toUpperCase()}** · ${event.message.replace(/@/g, "@​").replace(/[\r\n]+/g, " ")}`);
  }

  const payload = {
    username: "OATH Watch",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `Pharos ${network === "atlantic" ? "Atlantic Testnet" : "Pacific Mainnet"} activity`,
      description: `Wallet: \`${wallet.slice(0, 8)}…${wallet.slice(-6)}\`\n\n${safeEvents.join("\n")}`.slice(0, 3800),
      color: 0x1935c5,
      footer: { text: "OATH Watch · evidence from configured Pharos RPC logs" },
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return res.status(502).json({ error: `Discord rejected the alert (HTTP ${response.status}).` });
    return res.status(200).json({ delivered: true, eventCount: safeEvents.length });
  } catch (error) {
    return res.status(502).json({ error: `Discord alert delivery failed: ${error.name === "TimeoutError" ? "request timed out" : "webhook unavailable"}.` });
  }
}
