import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, multiRegistry, tempDir, writeJson } from "./helpers.mjs";

const registryFile = path.join(tempDir(), "models.json");
writeJson(registryFile, multiRegistry());
process.env.VMIX_REGISTRY = registryFile;
const router = createRequire(import.meta.url)(path.join(ROOT, "ccr", "custom-router.js"));
const route = (model, tokenCount = 1000) => router({ body: { model }, tokenCount });

test("every registered model goes to the provider the registry declares", async () => {
  for (const model of multiRegistry().models.filter((item) => item.enabled)) {
    assert.equal(await route(`${model.provider},${model.id}[${model.contextCap}]`), `${model.provider},${model.id}`);
  }
});

test("long GPT requests stay on the selected GPT route", async () => {
  assert.equal(await route("gpt-6-sol", 900000), "solgate,gpt-6-sol");
  assert.equal(await route("gpt-5.6-sol", 900000), "solgate,gpt-5.6-sol");
});

test("unregistered, disabled and Claude models are refused instead of falling back", async () => {
  const registry = multiRegistry();
  registry.models.find((model) => model.id === "glm-4.7").enabled = false;
  writeJson(registryFile, registry);
  for (const model of ["claude-opus-5-5", "claude-haiku-4-5-20251001", "glm-4.7", "not-a-model", "", undefined]) {
    const decision = await route(model);
    assert.match(decision, /^vibeproxy,__vmix_unsupported__/, `${model} -> ${decision}`);
    assert.notEqual(decision, null);
  }
  writeJson(registryFile, multiRegistry());
});

test("a provider prefix cannot smuggle a model past the registry", async () => {
  assert.match(await route("solgate,claude-opus-5-5"), /__vmix_unsupported__claude-opus-5-5$/);
});

test("registry edits apply without restarting the router", async () => {
  const registry = multiRegistry();
  registry.models.find((model) => model.id === "glm-4.7").enabled = false;
  writeJson(registryFile, registry);
  assert.match(await route("glm-4.7"), /__vmix_unsupported__glm-4.7$/);
  writeJson(registryFile, multiRegistry());
  assert.equal(await route("glm-4.7"), "vibeproxy,glm-4.7");
});

test("an unreadable registry blocks every request", async () => {
  fs.writeFileSync(registryFile, "{ not json");
  assert.match(await route("gpt-6-sol"), /__vmix_unsupported__gpt-6-sol$/);
  writeJson(registryFile, multiRegistry());
});
