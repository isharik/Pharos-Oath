import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chain from "./api/chain.js";
import config from "./api/config.js";
import docs from "./api/docs.js";
import integrations from "./api/integrations.js";
import agent from "./api/agent.js";
import market from "./api/market.js";
import registry from "./api/registry.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !match[2].startsWith("#") && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  next();
});
app.use(express.json({ limit: "16kb" }));

for (const [route, handler] of Object.entries({ chain, config, docs, integrations, agent, market, registry })) {
  app.all(`/api/${route}`, async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error); }
  });
}

app.use(express.static(root, { extensions: ["html"], fallthrough: true }));
app.use((req, res) => res.status(404).send("Not found"));
app.use((error, req, res, _next) => {
  console.error(`${req.method} ${req.path}:`, error.message);
  if (!res.headersSent) res.status(500).json({ error: "Local OATH server error." });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "127.0.0.1", () => console.log(`Pharos OATH local preview: http://localhost:${port}`));
