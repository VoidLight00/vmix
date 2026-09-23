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
  assert.ok(fs.statSync(path.join(env.VMIX_BIN_DIR, "vmix-default-guard.mjs")).mode & 0o111);
  const config = readJson(path.join(env.VMIX_CCR_DIR, "config.json"));
  assert.equal(config.CUSTOM_ROUTER_PATH, path.join(env.VMIX_CCR_DIR, "custom-router.js"));
  const vibeproxy = config.Providers.find((item) => item.name === "vibeproxy");
  const solgate = config.Providers.find((item) => item.name === "solgate");
  assert.equal(vibeproxy.api_base_url, "http://proxy-box.local:8317/v1/messages");
  // The public example works with VibeProxy alone; solgate stays optional (tutorial step 7).
  assert.deepEqual(vibeproxy.models, ["gpt-6-sol", "gpt-5.6-terra", "gpt-6-luna", "gpt-6-astra", "gemini-3.8-flash-high"]);
  assert.deepEqual(solgate.models, []);
});

test("install replaces an old vmix symlink with the tested launcher and keeps a backup", async () => {
  const { home, env } = sandbox();
  const oldWrapper = path.join(home, "old-wrapper");
  writeExecutable(oldWrapper, "#!/bin/sh\nexit 0\n");
  fs.mkdirSync(env.VMIX_BIN_DIR, { recursive: true });
  fs.symlinkSync(oldWrapper, path.join(env.VMIX_BIN_DIR, "vmix"));
  const result = await install(env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(fs.lstatSync(path.join(env.VMIX_BIN_DIR, "vmix")).isSymbolicLink(), false);
  const backups = fs.readdirSync(env.VMIX_BIN_DIR).filter((name) => name.startsWith("vmix.bak."));
  assert.equal(backups.length, 1);
});

test("re-running keeps the user's registry and other CCR settings, and backs up the router", async () => {
  const { env } = sandbox();
  writeJson(path.join(env.VMIX_CCR_DIR, "config.json"), {
    PORT: 3456,
    Providers: [
      { name: "ollama", api_base_url: "http://localhost:11434/v1/chat/completions", models: ["qwen"] },
      { name: "vibeproxy", api_base_url: "http://proxy:8317/v1/messages", models: [] },
      { name: "solgate", api_base_url: "http://127.0.0.1:8321/v1/chat/completions", models: [] },
    ],
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
