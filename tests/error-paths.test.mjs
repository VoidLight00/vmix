// Every external call vmix makes (registry file, CCR config, proxy catalog, router)
// must fail loudly with a next step — never succeed silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, exampleRegistry, mockServer, run, tempDir, unusedPortUrl, writeJson } from "./helpers.mjs";

const REGISTRY_BIN = path.join(ROOT, "bin", "vmix-registry.mjs");
const ROUTER = path.join(ROOT, "ccr", "custom-router.js");

function files(registry = exampleRegistry()) {
  const dir = tempDir();
  const paths = { registry: path.join(dir, "models.json"), config: path.join(dir, "config.json") };
  writeJson(paths.registry, registry);
  return paths;
}

const tool = (args, env) => run("node", [REGISTRY_BIN, ...args], { env: { ...process.env, ...env } });

test("missing or broken registry exits 1 with the file path", async () => {
  const dir = tempDir();
  const missing = await tool(["resolve", "sol"], { VMIX_REGISTRY: path.join(dir, "nope.json") });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /registry not found: .*nope\.json/);
  fs.writeFileSync(path.join(dir, "bad.json"), "{");
  const broken = await tool(["validate"], { VMIX_REGISTRY: path.join(dir, "bad.json") });
  assert.equal(broken.code, 1);
  assert.match(broken.stderr, /not valid JSON/);
});

test("sync refuses a missing provider and leaves the config untouched", async () => {
  const registry = exampleRegistry();
  registry.models.find((model) => model.id === "gpt-6-sol-1m").enabled = true;
  const paths = files(registry);
  const original = { Providers: [{ name: "vibeproxy", api_base_url: "http://x:8317/v1/messages", models: [] }] };
  writeJson(paths.config, original);
  const before = fs.readFileSync(paths.config, "utf8");
  const result = await tool(["sync"], { VMIX_REGISTRY: paths.registry, VMIX_CCR_CONFIG: paths.config });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /lacks provider\(s\): solgate/);
  assert.equal(fs.readFileSync(paths.config, "utf8"), before);
});

test("doctor fails when the proxy and the router are unreachable", async () => {
  const paths = files();
  const dead = await unusedPortUrl();
  writeJson(paths.config, {
    CUSTOM_ROUTER_PATH: ROUTER,
    Providers: [{ name: "vibeproxy", api_base_url: `${dead}/v1/messages`, models: ["gpt-6-sol", "gemini-3.8-flash-high", "gpt-6-luna", "gpt-6-astra"] }],
  });
  const result = await tool(["doctor"], { VMIX_REGISTRY: paths.registry, VMIX_CCR_CONFIG: paths.config, VMIX_CCR_URL: dead, VMIX_TIMEOUT_MS: "1500" });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAIL {2}vibeproxy: cannot read model list/);
  assert.match(result.stdout, /FAIL {2}claude-code-router is not answering/);
});

test("doctor catches a model the proxy no longer offers and a non-vmix router", async () => {
  const upstream = await mockServer((req) => (req.url === "/v1/models"
    ? { status: 200, json: { data: [{ id: "gpt-6-sol" }, { id: "gpt-6-luna" }, { id: "gpt-6-astra" }] } }
    : null));
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const paths = files();
  const oldRouter = path.join(path.dirname(paths.config), "old-router.js");
  fs.writeFileSync(oldRouter, "module.exports = async () => null;\n");
  writeJson(paths.config, {
    CUSTOM_ROUTER_PATH: oldRouter,
    Providers: [{ name: "vibeproxy", api_base_url: `${upstream.url}/v1/messages`, models: ["gpt-6-sol", "gemini-3.8-flash-high", "gpt-6-luna", "gpt-6-astra"] }],
  });
  const result = await tool(["doctor"], { VMIX_REGISTRY: paths.registry, VMIX_CCR_CONFIG: paths.config, VMIX_CCR_URL: ccr.url });
  await upstream.close();
  await ccr.close();
  assert.equal(result.code, 1);
  assert.match(result.stdout, /not offered upstream: gemini-3\.8-flash-high/);
  assert.match(result.stdout, /does not point to ccr\/custom-router\.js/);
});

test("doctor passes on a healthy setup", async () => {
  const ids = ["gpt-6-sol", "gemini-3.8-flash-high", "gpt-6-luna", "gpt-6-astra"];
  const upstream = await mockServer((req) => (req.url === "/v1/models" ? { status: 200, json: { data: ids.map((id) => ({ id })) } } : null));
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const paths = files();
  writeJson(paths.config, { CUSTOM_ROUTER_PATH: ROUTER, Providers: [{ name: "vibeproxy", api_base_url: `${upstream.url}/v1/messages`, models: ids }] });
  const result = await tool(["doctor"], { VMIX_REGISTRY: paths.registry, VMIX_CCR_CONFIG: paths.config, VMIX_CCR_URL: ccr.url });
  await upstream.close();
  await ccr.close();
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /all checks passed/);
});

test("smoke fails when another model answers or the blocked model is served", async () => {
  const ccr = await mockServer((req, body) => {
    const model = JSON.parse(body || "{}").model || "";
    if (model.includes("gemini")) return { status: 400, json: { error: { message: "quota used up" } } };
    return { status: 200, json: { model: "gpt-5.6-sol" } };
  });
  const paths = files();
  const result = await tool(["smoke", "sol", "gemini"], { VMIX_REGISTRY: paths.registry, VMIX_CCR_URL: ccr.url });
  await ccr.close();
  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAIL {2}gpt-6-sol: HTTP 200, answered as gpt-5\.6-sol/);
  assert.match(result.stdout, /FAIL {2}gemini-3\.8-flash-high: HTTP 400.*quota used up/);
  assert.match(result.stdout, /FAIL {2}unregistered claude-opus-5-5 was answered/);
});
