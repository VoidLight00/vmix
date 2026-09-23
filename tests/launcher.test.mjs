import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, exampleRegistry, mockServer, readJson, run, tempDir, unusedPortUrl, writeExecutable, writeJson } from "./helpers.mjs";

const VMIX = path.join(ROOT, "bin", "vmix");

// A fake `claude` that records the arguments and environment it was started with.
function setup() {
  const dir = tempDir();
  const registry = path.join(dir, "models.json");
  const record = path.join(dir, "claude-call.json");
  const fakeClaude = path.join(dir, "claude");
  writeJson(registry, exampleRegistry());
  writeExecutable(fakeClaude, `#!/usr/bin/env node
require("fs").writeFileSync(${JSON.stringify(record)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }));
`);
  return { registry, record, fakeClaude };
}

async function launch(args, ccrUrl, extraEnv = {}) {
  const ctx = setup();
  const env = {
    ...process.env,
    VMIX_REGISTRY: ctx.registry,
    VMIX_CLAUDE_BIN: ctx.fakeClaude,
    VMIX_CCR_URL: ccrUrl,
    ANTHROPIC_API_KEY: "sk-ant-should-not-leak",
    ...extraEnv,
  };
  const result = await run(VMIX, args, { env });
  const call = fs.existsSync(ctx.record) ? readJson(ctx.record) : null;
  return { ...result, call };
}

test("default launch uses the registry default and pins every picker slot", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const { code, call, stderr } = await launch([], ccr.url);
  await ccr.close();
  assert.equal(code, 0, stderr);
  assert.deepEqual(call.argv, ["--model", "vibeproxy,gpt-6-sol[330k]"]);
  assert.equal(call.env.ANTHROPIC_BASE_URL, ccr.url);
  assert.equal(call.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "vibeproxy,gpt-6-sol[330k]");
  assert.equal(call.env.ANTHROPIC_DEFAULT_SONNET_MODEL, "vibeproxy,gemini-3.8-flash-high[700k]");
  assert.equal(call.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "vibeproxy,gpt-6-luna[330k]");
  assert.equal(call.env.ANTHROPIC_SMALL_FAST_MODEL, "vibeproxy,gpt-6-luna[330k]");
  assert.equal(call.env.ANTHROPIC_CUSTOM_MODEL_OPTION, "vibeproxy,gpt-6-astra[240k]");
  assert.equal(call.env.CLAUDE_CODE_NO_MODEL_FALLBACK, "1");
  assert.equal(call.env.ANTHROPIC_API_KEY, undefined, "a real Anthropic key must not reach the router");
});

test("an alias selects the model and the remaining arguments pass through", async () => {
  const ccr = await mockServer(() => ({ status: 404, json: {} }));
  const one = await launch(["gemini", "-p", "hello"], ccr.url);
  const two = await launch(["gpt6", "luna", "fix the bug"], ccr.url);
  await ccr.close();
  assert.deepEqual(one.call.argv, ["--model", "vibeproxy,gemini-3.8-flash-high[700k]", "-p", "hello"]);
  assert.deepEqual(two.call.argv, ["--model", "vibeproxy,gpt-6-luna[330k]", "fix the bug"]);
});

test("unknown or disabled models stop before Claude Code starts", async () => {
  const ccr = await mockServer(() => ({ status: 200, json: {} }));
  const unknown = await launch(["claude-opus-5-5"], ccr.url);
  const disabled = await launch(["sol1m"], ccr.url);
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
