import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, exampleRegistry, tempDir, writeJson } from "./helpers.mjs";

const registryFile = path.join(tempDir(), "models.json");
writeJson(registryFile, exampleRegistry());
process.env.VMIX_REGISTRY = registryFile;
const router = createRequire(import.meta.url)(path.join(ROOT, "ccr", "custom-router.js"));
const route = (model) => router({ body: { model } });

test("registered models go to the provider the registry declares", async () => {
  assert.equal(await route("gpt-6-sol"), "vibeproxy,gpt-6-sol");
  assert.equal(await route("vibeproxy,gemini-3.8-flash-high[700k]"), "vibeproxy,gemini-3.8-flash-high");
});

test("unregistered, disabled and Claude models are refused instead of falling back", async () => {
  for (const model of ["claude-opus-5-5", "claude-haiku-4-5-20251001", "gpt-6-sol-1m", "not-a-model", "", undefined]) {
    const decision = await route(model);
    assert.match(decision, /^vibeproxy,__vmix_unsupported__/, `${model} -> ${decision}`);
    assert.notEqual(decision, null);
  }
});

test("a provider prefix cannot smuggle a model past the registry", async () => {
  assert.match(await route("solgate,claude-opus-5-5"), /__vmix_unsupported__claude-opus-5-5$/);
});

test("registry edits apply without restarting the router", async () => {
  const registry = exampleRegistry();
  registry.models.find((model) => model.id === "gpt-6-sol-1m").enabled = true;
  writeJson(registryFile, registry);
  assert.equal(await route("solgate,gpt-6-sol-1m[1m]"), "solgate,gpt-6-sol-1m");
  writeJson(registryFile, exampleRegistry());
});

test("an unreadable registry blocks every request", async () => {
  fs.writeFileSync(registryFile, "{ not json");
  assert.match(await route("gpt-6-sol"), /__vmix_unsupported__gpt-6-sol$/);
  writeJson(registryFile, exampleRegistry());
});
