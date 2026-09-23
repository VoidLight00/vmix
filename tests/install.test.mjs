import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, run, tempDir, writeExecutable, writeJson } from "./helpers.mjs";

function sandbox() {
  const home = tempDir("vmix-home-");
  const fakeBin = path.join(home, "fakebin");
  writeExecutable(path.join(fakeBin, "claude"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(fakeBin, "ccr"), "#!/bin/sh\necho 'claude-code-router version: 2.0.0'\n");
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${fakeBin}:${process.env.PATH}`,
    VMIX_BIN_DIR: path.join(home, "bin"),
    VMIX_CONFIG_DIR: path.join(home, "cfg"),
    VMIX_CCR_DIR: path.join(home, "ccr"),
  };
  return { home, env };
}

const install = (env, args = []) => run("bash", [path.join(ROOT, "install.sh"), ...args], { env });

test("fresh install wires the router, the proxy host and the provider list", async () => {
  const { env } = sandbox();
  const result = await install(env, ["--proxy-host", "proxy-box.local"]);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(fs.statSync(path.join(env.VMIX_BIN_DIR, "vmix")).mode & 0o111);
  const config = readJson(path.join(env.VMIX_CCR_DIR, "config.json"));
  assert.equal(config.CUSTOM_ROUTER_PATH, path.join(env.VMIX_CCR_DIR, "custom-router.js"));
  const provider = config.Providers.find((item) => item.name === "vibeproxy");
  assert.equal(provider.api_base_url, "http://proxy-box.local:8317/v1/messages");
  assert.deepEqual(provider.models, ["gpt-6-sol", "gemini-3.8-flash-high", "gpt-6-luna", "gpt-6-astra"]);
});

test("re-running keeps the user's registry and other CCR settings, and backs up the router", async () => {
  const { env } = sandbox();
  writeJson(path.join(env.VMIX_CCR_DIR, "config.json"), {
    PORT: 3456,
    Providers: [{ name: "ollama", api_base_url: "http://localhost:11434/v1/chat/completions", models: ["qwen"] }],
    Router: { default: "ollama,qwen" },
  });
  fs.writeFileSync(path.join(env.VMIX_CCR_DIR, "custom-router.js"), "module.exports = async () => null;\n");
  assert.equal((await install(env)).code, 0);

  const registryFile = path.join(env.VMIX_CONFIG_DIR, "models.json");
  const registry = readJson(registryFile);
  registry.models.find((model) => model.id === "gpt-6-astra").enabled = false;
  registry.models.find((model) => model.id === "gpt-6-astra").picker = undefined;
  writeJson(registryFile, registry);
  const second = await install(env);
  assert.equal(second.code, 0, second.stderr);

  assert.equal(readJson(registryFile).models.find((model) => model.id === "gpt-6-astra").enabled, false);
  const config = readJson(path.join(env.VMIX_CCR_DIR, "config.json"));
  assert.equal(config.PORT, 3456);
  assert.deepEqual(config.Router, { default: "ollama,qwen" });
  assert.ok(config.Providers.some((item) => item.name === "ollama"));
  assert.ok(!config.Providers.find((item) => item.name === "vibeproxy").models.includes("gpt-6-astra"));
  const backups = fs.readdirSync(env.VMIX_CCR_DIR).filter((name) => name.startsWith("custom-router.js.bak."));
  assert.equal(backups.length, 1);
});

test("install refuses a proxy host that could break out of the URL", async () => {
  const { env } = sandbox();
  const result = await install(env, ["--proxy-host", "evil.com/x?"]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /invalid --proxy-host/);
  assert.ok(!fs.existsSync(path.join(env.VMIX_CCR_DIR, "config.json")));
});

test("install stops with a hint when a prerequisite is missing", async () => {
  const { env } = sandbox();
  fs.rmSync(path.join(env.HOME, "fakebin", "ccr"));
  const result = await install({ ...env, PATH: `${path.join(env.HOME, "fakebin")}:/usr/bin:/bin:${path.dirname(process.execPath)}` });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /npm install -g @musistudio\/claude-code-router@2\.0\.0/);
});

test("install refuses an untested claude-code-router major version", async () => {
  const { env } = sandbox();
  writeExecutable(path.join(env.HOME, "fakebin", "ccr"), "#!/bin/sh\necho 'claude-code-router version: 3.1.1'\n");
  const refused = await install(env);
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /tested with 2\.x/);
  const forced = await install({ ...env, VMIX_ALLOW_ANY_CCR: "1" });
  assert.equal(forced.code, 0, forced.stderr);
});
