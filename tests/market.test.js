import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import marketHandler from "../api/market.js";

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

const ENV_KEYS = [
  "X402_ENABLED", "X402_FACILITATOR_URL", "X402_FACILITATOR_TOKEN",
  "X402_ATLANTIC_FACILITATOR_URL", "X402_ATLANTIC_FACILITATOR_TOKEN",
  "X402_ATLANTIC_PAY_TO", "X402_ATLANTIC_ASSET", "X402_ATLANTIC_PRICE_BASE_UNITS"
];

test("x402 requires configured terms and a v2 exact facilitator for the selected Pharos chain", async () => {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  let kinds = [];
  let receivedAuthorization = "";
  const server = createServer((req, res) => {
    receivedAuthorization = req.headers.authorization || "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ kinds }));
  });

  try {
    for (const key of ENV_KEYS) delete process.env[key];
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const facilitatorUrl = `http://127.0.0.1:${server.address().port}`;
    Object.assign(process.env, {
      X402_ENABLED: "true",
      X402_ATLANTIC_FACILITATOR_URL: facilitatorUrl,
      X402_ATLANTIC_FACILITATOR_TOKEN: "test-facilitator-token",
      X402_ATLANTIC_PAY_TO: "0x1111111111111111111111111111111111111111",
      X402_ATLANTIC_ASSET: "0x2222222222222222222222222222222222222222",
      X402_ATLANTIC_PRICE_BASE_UNITS: "100000"
    });

    kinds = [{ x402Version: 1, scheme: "exact", network: "eip155:688689" }];
    let res = mockResponse();
    await marketHandler({ method: "GET", query: { network: "atlantic" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "unavailable", "v1 must not be accepted for a v2 middleware route");
    assert.match(res.body.reason, /x402 v2 exact support/);
    assert.equal(receivedAuthorization, "Bearer test-facilitator-token");

    kinds = [{ x402Version: 2, scheme: "exact", network: "eip155:688689" }];
    res = mockResponse();
    await marketHandler({ method: "GET", query: { network: "atlantic" } }, res);
    assert.equal(res.body.status, "ready");

    kinds = [{ x402Version: 2, scheme: "exact", network: "eip155:1672" }];
    res = mockResponse();
    await marketHandler({ method: "GET", query: { network: "atlantic" } }, res);
    assert.equal(res.body.status, "unavailable", "a facilitator for another chain must not be accepted");

    process.env.X402_ENABLED = "false";
    res = mockResponse();
    await marketHandler({ method: "POST", query: {}, body: { network: "atlantic" } }, res);
    assert.equal(res.statusCode, 503, "paid delivery remains closed when the feature flag is off");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
