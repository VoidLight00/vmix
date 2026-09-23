import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize, validate, resolve, routeString, pickerSlots, syncConfig, sameModel,
} from "../bin/vmix-registry.mjs";
import { exampleRegistry } from "./helpers.mjs";

test("example registry is valid", () => {
  assert.deepEqual(validate(exampleRegistry()), []);
});

test("normalize strips provider prefix, context cap, case and spaces", () => {
  assert.equal(normalize("vibeproxy,GPT-6-Sol[330k]"), "gpt-6-sol");
  assert.equal(normalize("gpt6 sol"), "gpt6sol");
});

test("resolve finds ids and aliases, never disabled models", () => {
  const registry = exampleRegistry();
  assert.equal(resolve(registry, "").id, "gpt-6-sol");
  assert.equal(resolve(registry, "gemini").id, "gemini-3.8-flash-high");
  assert.equal(resolve(registry, "gpt6 luna").id, "gpt-6-luna");
  assert.equal(resolve(registry, "vibeproxy,gpt-6-astra[240k]").id, "gpt-6-astra");
  assert.equal(resolve(registry, "sol1m"), null);
  assert.equal(resolve(registry, "claude-opus-5-5"), null);
});

test("routeString carries provider and context cap", () => {
  assert.equal(routeString(resolve(exampleRegistry(), "gemini")), "vibeproxy,gemini-3.8-flash-high[700k]");
});

test("picker slots come from the registry", () => {
  const slots = Object.fromEntries(pickerSlots(exampleRegistry()).map((slot) => [slot.slot, slot.route]));
  assert.deepEqual(slots, {
    opus: "vibeproxy,gpt-6-sol[330k]",
    sonnet: "vibeproxy,gemini-3.8-flash-high[700k]",
    haiku: "vibeproxy,gpt-6-luna[330k]",
    custom: "vibeproxy,gpt-6-astra[240k]",
  });
});

test("validate rejects duplicate aliases, duplicate slots, bad caps and a disabled default", () => {
  const registry = exampleRegistry();
  registry.models[1].aliases.push("sol");
  registry.models[2].picker = "opus";
  registry.models[3].contextCap = "big";
  registry.defaultModel = "gpt-6-sol-1m";
  const problems = validate(registry).join("\n");
  assert.match(problems, /alias 'sol' already used/);
  assert.match(problems, /picker 'opus' already used/);
  assert.match(problems, /contextCap/);
  assert.match(problems, /defaultModel 'gpt-6-sol-1m' is disabled/);
});

test("syncConfig rewrites only the model lists it owns", () => {
  const config = {
    CUSTOM_ROUTER_PATH: "/x/custom-router.js",
    Providers: [
      { name: "vibeproxy", api_base_url: "http://proxy:8317/v1/messages", models: ["stale"], transformer: { use: ["Anthropic"] } },
      { name: "ollama", api_base_url: "http://localhost:11434", models: ["qwen"] },
    ],
    Router: { default: "vibeproxy,gpt-6-sol" },
  };
  const next = syncConfig(exampleRegistry(), config);
  assert.deepEqual(next.Providers[0].models, ["gpt-6-sol", "gemini-3.8-flash-high", "gpt-6-luna", "gpt-6-astra"]);
  assert.deepEqual(next.Providers[0].transformer, { use: ["Anthropic"] });
  assert.deepEqual(next.Providers[1], config.Providers[1]);
  assert.equal(next.CUSTOM_ROUTER_PATH, "/x/custom-router.js");
  assert.deepEqual(syncConfig(exampleRegistry(), next), next);
});

test("syncConfig refuses when an enabled model needs a provider the config lacks", () => {
  const registry = exampleRegistry();
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
