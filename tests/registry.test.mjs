import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize, validate, resolve, routeString, pickerSlots, availableModels, syncConfig, sameModel,
} from "../bin/vmix-registry.mjs";
import { exampleRegistry, multiRegistry } from "./helpers.mjs";

test("example registry is valid", () => {
  assert.deepEqual(validate(multiRegistry()), []);
});

test("normalize strips provider prefix, context cap, case and spaces", () => {
  assert.equal(normalize("vibeproxy,GPT-6-Sol[330k]"), "gpt-6-sol");
  assert.equal(normalize("gpt6 sol"), "gpt6sol");
});

test("resolve finds ids and aliases, never disabled models", () => {
  const registry = multiRegistry();
  assert.equal(resolve(registry, "").id, "gpt-6-sol");
  assert.equal(resolve(registry, "gemini").id, "gemini-3.8-flash-high");
  assert.equal(resolve(registry, "gpt6 luna").id, "gpt-6-luna");
  assert.equal(resolve(registry, "vibeproxy,gpt-6-astra[240k]").id, "gpt-6-astra");
  assert.equal(resolve(registry, "sol1m").id, "gpt-5.6-sol-1m");
  assert.equal(resolve(registry, "claude-opus-5-5"), null);
});

test("routeString carries provider and context cap", () => {
  assert.equal(routeString(resolve(multiRegistry(), "gemini")), "vibeproxy,gemini-3.8-flash-high[700k]");
});

test("picker slots stay on GPT routes so worker calls do not consume Gemini quota", () => {
  const slots = Object.fromEntries(pickerSlots(multiRegistry()).map((slot) => [slot.slot, slot.route]));
  assert.deepEqual(slots, {
    opus: "solgate,gpt-6-sol[330k]",
    sonnet: "solgate,gpt-5.6-terra[330k]",
    haiku: "solgate,gpt-6-luna[330k]",
    custom: "solgate,gpt-6-astra[240k]",
  });
});

test("allowlist exposes every enabled non-Claude model", () => {
  const registry = multiRegistry();
  const available = availableModels(registry);
  assert.equal(available.length, registry.models.filter((model) => model.enabled).length);
  assert.ok(available.includes("vibeproxy,glm-4.7[100k]"));
  assert.ok(available.includes("vibeproxy,gemini-3.5-flash-lite[700k]"));
  assert.ok(!available.some((model) => model.includes("claude-")));
});

test("validate rejects duplicate aliases, duplicate slots, bad caps and a disabled default", () => {
  const registry = multiRegistry();
  registry.models[1].aliases.push("sol");
  registry.models[2].picker = "opus";
  registry.models[3].contextCap = "big";
  registry.models.find((model) => model.id === "gpt-6-sol-1m").enabled = false;
  registry.defaultModel = "gpt-6-sol-1m";
  const problems = validate(registry).join("\n");
  assert.match(problems, /alias 'sol' already used/);
  assert.match(problems, /picker 'opus' already used/);
  assert.match(problems, /contextCap/);
  assert.match(problems, /defaultModel 'gpt-6-sol-1m' is disabled/);
});

test("syncConfig rewrites only the model lists it owns", () => {
  const registry = multiRegistry();
  const config = {
    CUSTOM_ROUTER_PATH: "/x/custom-router.js",
    Providers: [
      { name: "vibeproxy", api_base_url: "http://proxy:8317/v1/messages", models: ["stale"], transformer: { use: ["Anthropic"] } },
      { name: "solgate", api_base_url: "http://localhost:8321/v1/chat/completions", models: ["stale"] },
      { name: "ollama", api_base_url: "http://localhost:11434", models: ["qwen"] },
    ],
    Router: { default: "vibeproxy,gpt-6-sol" },
  };
  const next = syncConfig(registry, config);
  assert.deepEqual(next.Providers[0].models, registry.models.filter((model) => model.enabled && model.provider === "vibeproxy").map((model) => model.id));
  assert.deepEqual(next.Providers[0].transformer, { use: ["Anthropic"] });
  assert.deepEqual(next.Providers[1].models, registry.models.filter((model) => model.enabled && model.provider === "solgate").map((model) => model.id));
  assert.deepEqual(next.Providers[2], config.Providers[2]);
  assert.equal(next.CUSTOM_ROUTER_PATH, "/x/custom-router.js");
  assert.deepEqual(syncConfig(registry, next), next);
});

test("syncConfig refuses when an enabled model needs a provider the config lacks", () => {
  const registry = multiRegistry();
  registry.models.find((model) => model.id === "gpt-6-sol-1m").enabled = true;
  const config = { Providers: [{ name: "vibeproxy", api_base_url: "http://proxy:8317/v1/messages", models: [] }] };
  assert.throws(() => syncConfig(registry, config), /lacks provider\(s\): solgate/);
});

test("sameModel accepts only the requested model (virtual 1M answers as its base)", () => {
  assert.ok(sameModel("gpt-6-sol", "gpt-6-sol"));
  assert.ok(sameModel("gpt-6-sol-1m", "gpt-6-sol"));
  assert.ok(sameModel("gemini-3.8-flash-high", "gemini-3.8-flash"));
  assert.ok(!sameModel("gpt-6-sol", "gpt-6-luna"));
  assert.ok(!sameModel("gpt-6-sol", "gpt-5.6-sol"));
  assert.ok(!sameModel("gpt-6-sol", null));
});

test("the public example works with VibeProxy alone and keeps every worker slot on GPT", () => {
  const registry = exampleRegistry();
  assert.deepEqual(validate(registry), []);
  const enabled = registry.models.filter((model) => model.enabled);
  assert.deepEqual(enabled.filter((model) => model.provider !== "vibeproxy").map((model) => model.id), []);
  for (const slot of pickerSlots(registry)) assert.match(slot.route, /^vibeproxy,gpt-/, `${slot.slot} -> ${slot.route}`);
  assert.equal(resolve(registry, "gemini").id, "gemini-3.8-flash-high");
  assert.equal(resolve(registry, "sol1m"), null);
});
