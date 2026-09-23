import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, multiRegistry, mockServer, readJson, run, tempDir, unusedPortUrl, writeExecutable, writeJson } from "./helpers.mjs";

const VMIX = path.join(ROOT, "bin", "vmix");

// A fake `claude` that records the arguments and environment it was started with.
function setup() {
  const dir = tempDir();
  const registry = path.join(dir, "models.json");
  const record = path.join(dir, "claude-call.json");
  const fakeClaude = path.join(dir, "claude");
  writeJson(registry, multiRegistry());
  writeExecutable(fakeClaude, `#!/usr/bin/env node
const fs = require("fs");
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }));
if (process.env.FAKE_CLAUDE_MODEL_WRITE) {
  const settingsPath = require("path").join(process.env.CLAUDE_CONFIG_DIR, "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, model: process.env.FAKE_CLAUDE_MODEL_WRITE }, null, 2) + "\\n");
}
process.exit(Number(process.env.FAKE_CLAUDE_EXIT || 0));
`);
  return { dir, registry, record, fakeClaude };
}

async function launch(args, ccrUrl, extraEnv = {}) {
  const ctx = setup();
  const claudeConfig = path.join(ctx.dir, "claude-config");
  fs.mkdirSync(claudeConfig, { recursive: true });
  writeJson(path.join(claudeConfig, "settings.json"), { model: "opus[1m]", permissions: {} });
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: claudeConfig,
    VMIX_REGISTRY: ctx.registry,
    VMIX_CLAUDE_BIN: ctx.fakeClaude,
    VMIX_CCR_URL: ccrUrl,
    ANTHROPIC_API_KEY: "sk-ant-should-not-leak",
    ...extraEnv,
  };
  const result = await run(VMIX, args, { env });
  const call = fs.existsSync(ctx.record) ? readJson(ctx.record) : null;
  const settings = readJson(path.join(claudeConfig, "settings.json"));
  return { ...result, call, settings };
}

test("default launch uses the registry default and pins every picker slot", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const { code, call, stderr } = await launch([], ccr.url);
  await ccr.close();
  assert.equal(code, 0, stderr);
  assert.equal(call.argv[0], "--model");
  assert.equal(call.argv[1], "solgate,gpt-6-sol[330k]");
  assert.equal(call.argv[2], "--settings");
  const settings = JSON.parse(call.argv[3]);
  assert.ok(settings.availableModels.includes("vibeproxy,glm-4.7[100k]"));
  assert.ok(!settings.availableModels.some((model) => model.includes("claude-")));
  assert.equal(call.env.ANTHROPIC_BASE_URL, ccr.url);
  assert.equal(call.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "solgate,gpt-6-sol[330k]");
  assert.equal(call.env.ANTHROPIC_DEFAULT_SONNET_MODEL, "solgate,gpt-5.6-terra[330k]");
  assert.equal(call.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "solgate,gpt-6-luna[330k]");
  assert.equal(call.env.ANTHROPIC_SMALL_FAST_MODEL, "solgate,gpt-6-luna[330k]");
  assert.equal(call.env.ANTHROPIC_CUSTOM_MODEL_OPTION, "solgate,gpt-6-astra[240k]");
  assert.equal(call.env.CLAUDE_CODE_NO_MODEL_FALLBACK, "1");
  assert.equal(call.env.ANTHROPIC_API_KEY, undefined, "a real Anthropic key must not reach the router");
});

test("an alias selects the model and the remaining arguments pass through", async () => {
  const ccr = await mockServer(() => ({ status: 404, json: {} }));
  const one = await launch(["gemini", "-p", "hello"], ccr.url);
  const two = await launch(["gpt6", "luna", "fix the bug"], ccr.url);
  await ccr.close();
  assert.deepEqual(one.call.argv.slice(0, 2), ["--model", "vibeproxy,gemini-3.8-flash-high[700k]"]);
  assert.deepEqual(one.call.argv.slice(-2), ["-p", "hello"]);
  assert.deepEqual(two.call.argv.slice(0, 2), ["--model", "solgate,gpt-6-luna[330k]"]);
  assert.equal(two.call.argv.at(-1), "fix the bug");
});

test("unknown or disabled models stop before Claude Code starts", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const unknown = await launch(["claude-opus-5-5"], ccr.url);
  const disabled = await launch(["not-a-model"], ccr.url);
  await ccr.close();
  for (const result of [unknown, disabled]) {
    assert.equal(result.code, 2);
    assert.equal(result.call, null);
    assert.match(result.stderr, /unknown or disabled model/);
  }
});

test("a dead router stops the launch with exit 69 and a fix", async () => {
  const result = await launch([], await unusedPortUrl());
  assert.equal(result.code, 69);
  assert.equal(result.call, null);
  assert.match(result.stderr, /ccr start/);
});

test("proxy model picks are reverted without hiding Claude Code's exit status", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const result = await launch([], ccr.url, {
    FAKE_CLAUDE_MODEL_WRITE: "haiku",
    FAKE_CLAUDE_EXIT: "7",
  });
  await ccr.close();
  assert.equal(result.code, 7);
  assert.equal(result.settings.model, "opus[1m]");
  assert.match(result.stderr, /restored default model/);
});

test("a native Claude model selected during the session is preserved", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const result = await launch([], ccr.url, {
    FAKE_CLAUDE_MODEL_WRITE: "claude-sonnet-5",
  });
  await ccr.close();
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.settings.model, "claude-sonnet-5");
  assert.doesNotMatch(result.stderr, /restored default model/);
});

test("--profile applies the registry profile: model, slots, extra args, then user args", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const { code, call, stderr } = await launch(["--profile", "gpt", "astra", "-p", "hi"], ccr.url);
  await ccr.close();
  assert.equal(code, 0, stderr);
  assert.deepEqual(call.argv.slice(0, 2), ["--model", "solgate,gpt-6-astra[240k]"]);
  assert.deepEqual(call.argv.slice(4), ["--permission-mode", "acceptEdits", "--autocompact", "220k", "-p", "hi"]);
  assert.equal(call.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "solgate,gpt-5.6-sol[330k]");
  assert.equal(call.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "solgate,gpt-5.6-luna[330k]");
  assert.equal(call.env.ANTHROPIC_SMALL_FAST_MODEL, "solgate,gpt-5.6-luna[330k]");
});

test("a profile refuses a model from another family before Claude Code starts", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const result = await launch(["--profile", "gpt", "gemini"], ccr.url);
  await ccr.close();
  assert.equal(result.code, 2);
  assert.equal(result.call, null);
  assert.match(result.stderr, /only runs gpt models/);
});

test("the prelaunch hook runs with the chosen model, and a failing hook only warns", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const dir = tempDir();
  const seen = path.join(dir, "hook-env.txt");
  const okHook = path.join(dir, "ok-hook");
  writeExecutable(okHook, `#!/bin/sh\nprintf '%s %s %s' "$VMIX_MODEL_ID" "$VMIX_MODEL_FAMILY" "$VMIX_PROFILE" > ${JSON.stringify(seen)}\n`);
  const ok = await launch(["--profile", "gemini", "3.7"], ccr.url, { VMIX_PRELAUNCH: okHook });
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(fs.readFileSync(seen, "utf8"), "gemini-3.7-flash-high gemini gemini");
  const badHook = path.join(dir, "bad-hook");
  writeExecutable(badHook, "#!/bin/sh\nexit 3\n");
  const bad = await launch([], ccr.url, { VMIX_PRELAUNCH: badHook });
  await ccr.close();
  assert.equal(bad.code, 0, bad.stderr);
  assert.ok(bad.call, "Claude Code still starts");
  assert.match(bad.stderr, /prelaunch hook .* failed; continuing/);
});
