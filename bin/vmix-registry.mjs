#!/usr/bin/env node
// vmix-registry — the only place that knows which models exist.
// Every other piece (launcher, CCR router, CCR provider lists) reads this file,
// so adding or retiring a model is one JSON edit plus `vmix sync`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HOME = os.homedir();
const REGISTRY_PATH = process.env.VMIX_REGISTRY || path.join(HOME, ".config", "vmix", "models.json");
const CCR_CONFIG_PATH = process.env.VMIX_CCR_CONFIG || path.join(HOME, ".claude-code-router", "config.json");
const CCR_URL = process.env.VMIX_CCR_URL || "http://127.0.0.1:3456";
const TIMEOUT_MS = Number(process.env.VMIX_TIMEOUT_MS || 4000);
const SLOTS = ["opus", "sonnet", "haiku", "custom"];

class UsageError extends Error {}

export function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^[a-z0-9_-]+,/, "")
    .replace(/\[[^\]]+\]$/, "")
    .replace(/\s+/g, "");
}

export function loadRegistry(file = REGISTRY_PATH) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    throw new UsageError(`registry not found: ${file} (run ./install.sh first)`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`registry is not valid JSON: ${file}: ${error.message}`);
  }
}

export function validate(registry) {
  const problems = [];
  if (registry.version !== 1) problems.push("version must be 1");
  if (!Array.isArray(registry.models) || registry.models.length === 0) problems.push("models must be a non-empty array");
  const ids = new Set();
  const keys = new Map();
  const slotOwners = new Map();
  for (const model of registry.models || []) {
    const where = model && model.id ? model.id : "<missing id>";
    if (!model.id || typeof model.id !== "string" || /[\s,[\]]/.test(model.id)) problems.push(`${where}: id must be a plain string`);
    if (ids.has(model.id)) problems.push(`${where}: duplicate id`);
    ids.add(model.id);
    if (!/^[a-z0-9_-]+$/.test(model.provider || "")) problems.push(`${where}: provider must match [a-z0-9_-]+`);
    if (!/^\d+(k|m)$/i.test(model.contextCap || "")) problems.push(`${where}: contextCap must look like 330k or 1m`);
    if (typeof model.enabled !== "boolean") problems.push(`${where}: enabled must be true or false`);
    if (model.aliases !== undefined && !Array.isArray(model.aliases)) problems.push(`${where}: aliases must be an array`);
    for (const key of [model.id, ...(model.aliases || [])].map(normalize)) {
      if (keys.has(key) && keys.get(key) !== model.id) problems.push(`${where}: alias '${key}' already used by ${keys.get(key)}`);
      keys.set(key, model.id);
    }
    if (model.picker !== undefined) {
      if (!SLOTS.includes(model.picker)) problems.push(`${where}: picker must be one of ${SLOTS.join(", ")}`);
      if (model.enabled && slotOwners.has(model.picker)) problems.push(`${where}: picker '${model.picker}' already used by ${slotOwners.get(model.picker)}`);
      if (model.enabled) slotOwners.set(model.picker, model.id);
    }
  }
  if (registry.claudeArgs !== undefined && !isStringArray(registry.claudeArgs)) problems.push("claudeArgs must be an array of strings");
  const enabledIds = new Set((registry.models || []).filter((model) => model.enabled).map((model) => model.id));
  for (const [name, profile] of Object.entries(registry.profiles || {})) {
    const where = `profile '${name}'`;
    if (!/^[a-z0-9_-]+$/.test(name)) problems.push(`${where}: name must match [a-z0-9_-]+`);
    if (profile.default !== undefined && !enabledIds.has(profile.default)) problems.push(`${where}: default '${profile.default}' is not an enabled model id`);
    if (profile.claudeArgs !== undefined && !isStringArray(profile.claudeArgs)) problems.push(`${where}: claudeArgs must be an array of strings`);
    for (const [slot, target] of Object.entries(profile.slots || {})) {
      if (!SLOTS.includes(slot)) problems.push(`${where}: unknown slot '${slot}'`);
      if (target !== "@main" && !enabledIds.has(target)) problems.push(`${where}: slot ${slot} -> '${target}' is not an enabled model id`);
    }
  }
  for (const model of registry.models || []) {
    if (model.autocompact !== undefined && !/^\d+(k|m)$/i.test(model.autocompact)) problems.push(`${model.id}: autocompact must look like 220k`);
  }
  const fallback = (registry.models || []).find((model) => model.id === registry.defaultModel);
  if (!fallback) problems.push(`defaultModel '${registry.defaultModel}' is not in models`);
  else if (!fallback.enabled) problems.push(`defaultModel '${registry.defaultModel}' is disabled`);
  return problems;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function mustValidate(registry) {
  const problems = validate(registry);
  if (problems.length) throw new UsageError(`registry invalid:\n  - ${problems.join("\n  - ")}`);
  return registry;
}

export function enabledModels(registry) {
  return registry.models.filter((model) => model.enabled);
}

export function resolve(registry, query) {
  const key = normalize(query || registry.defaultModel);
  return enabledModels(registry).find((model) => [model.id, ...(model.aliases || [])].some((alias) => normalize(alias) === key)) || null;
}

export function routeString(model) {
  return `${model.provider},${model.id}[${model.contextCap.toLowerCase()}]`;
}

export function pickerSlots(registry) {
  return enabledModels(registry)
    .filter((model) => model.picker)
    .map((model) => ({ slot: model.picker, route: routeString(model), label: model.label || model.id }));
}

// Applies a profile's variant ("1m": gpt-6-sol -> gpt-6-sol-1m) to a resolved model.
function withVariant(registry, model, variant) {
  if (!model || !variant || model.id.endsWith(`-${variant}`)) return model;
  return enabledModels(registry).find((item) => item.id === `${model.id}-${variant}`) || null;
}

// Decides one launch: which model, which /model slots, which extra Claude Code
// arguments, and how many leading words were model words. Profiles (vgpt, vgemini…)
// are data in the registry, so compatibility commands carry no model knowledge.
export function plan(registry, words, profileName = "") {
  const profile = profileName ? (registry.profiles || {})[profileName] : null;
  if (profileName && !profile) return { error: `unknown profile '${profileName}'` };
  const variant = profile && profile.variant;
  const pick = (query) => withVariant(registry, resolve(registry, query), variant);
  const isWord = (word) => typeof word === "string" && word !== "" && !word.startsWith("-");

  let query = "";
  let consumed = 0;
  if (isWord(words[0])) {
    if (isWord(words[1]) && pick(`${words[0]} ${words[1]}`)) [query, consumed] = [`${words[0]} ${words[1]}`, 2];
    else [query, consumed] = [words[0], 1];
  }
  const wanted = query || (profile && profile.default) || registry.defaultModel;
  const base = resolve(registry, wanted);
  const model = withVariant(registry, base, variant);
  if (!base) return { error: `unknown or disabled model '${wanted}'. Run: vmix models` };
  if (!model) return { error: `'${base.id}' has no enabled ${variant} variant in the registry` };
  if (profile && profile.family && model.family !== profile.family) {
    return { error: `profile '${profileName}' only runs ${profile.family} models; '${model.id}' is ${model.family}` };
  }

  const byId = (id) => enabledModels(registry).find((item) => item.id === id);
  let slots;
  if (profile && profile.slots) {
    slots = Object.entries(profile.slots).map(([slot, target]) => {
      const chosen = target === "@main" ? model : byId(target);
      return { slot, route: routeString(chosen), label: chosen.label || chosen.id };
    });
  } else {
    slots = pickerSlots(registry);
  }
  const args = [
    ...(registry.claudeArgs || []),
    ...((profile && profile.claudeArgs) || []),
    ...(model.autocompact ? ["--autocompact", model.autocompact] : []),
  ];
  return { model, route: routeString(model), consumed, slots, args };
}

export function availableModels(registry) {
  return enabledModels(registry).map(routeString);
}

// Rewrites only the `models` array of providers the registry uses; every other
// key and provider in the CCR config is left exactly as the user wrote it.
export function syncConfig(registry, config) {
  const providers = config.Providers || config.providers;
  if (!Array.isArray(providers)) throw new UsageError("CCR config has no Providers array");
  const wanted = new Map();
  for (const model of enabledModels(registry)) {
    if (!wanted.has(model.provider)) wanted.set(model.provider, []);
    wanted.get(model.provider).push(model.id);
  }
  const missing = [...wanted.keys()].filter((name) => !providers.some((provider) => provider.name === name));
  if (missing.length) {
    throw new UsageError(`CCR config lacks provider(s): ${missing.join(", ")} — add them (see ccr/config.example.json) or disable those models`);
  }
  const nextProviders = providers.map((provider) => (
    wanted.has(provider.name) ? { ...provider, models: wanted.get(provider.name) } : provider
  ));
  const key = config.Providers ? "Providers" : "providers";
  return { ...config, [key]: nextProviders };
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new UsageError(`${label} unreadable: ${file}: ${error.message}`);
  }
}

function writeAtomic(file, text) {
  const temp = `${file}.vmix-tmp-${process.pid}`;
  fs.writeFileSync(temp, text, { mode: 0o600 });
  JSON.parse(fs.readFileSync(temp, "utf8"));
  fs.renameSync(temp, file);
}

function cmdSync() {
  const registry = mustValidate(loadRegistry());
  const current = fs.existsSync(CCR_CONFIG_PATH) ? fs.readFileSync(CCR_CONFIG_PATH, "utf8") : null;
  if (current === null) throw new UsageError(`CCR config not found: ${CCR_CONFIG_PATH} (run ./install.sh)`);
  const next = `${JSON.stringify(syncConfig(registry, readJson(CCR_CONFIG_PATH, "CCR config")), null, 2)}\n`;
  if (next === current) {
    console.log("vmix sync: CCR config already matches the registry");
    return;
  }
  fs.copyFileSync(CCR_CONFIG_PATH, `${CCR_CONFIG_PATH}.bak`);
  writeAtomic(CCR_CONFIG_PATH, next);
  console.log(`vmix sync: updated ${CCR_CONFIG_PATH} (previous copy: config.json.bak)`);
  console.log("vmix sync: restart the router so it reloads the provider list: ccr restart");
}

async function reachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

async function catalog(baseUrl) {
  const url = `${new URL(baseUrl).origin}/v1/models`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const body = await response.json();
  return new Set((body.data || []).map((item) => (typeof item === "string" ? item : item && item.id)).filter(Boolean));
}

async function cmdDoctor() {
  let failed = 0;
  const pass = (message) => console.log(`PASS  ${message}`);
  const fail = (message) => {
    failed += 1;
    console.log(`FAIL  ${message}`);
  };

  let registry;
  try {
    registry = mustValidate(loadRegistry());
    pass(`registry valid (${enabledModels(registry).length} enabled models)`);
  } catch (error) {
    fail(error.message);
    process.exitCode = 1;
    return;
  }

  let config = null;
  try {
    config = readJson(CCR_CONFIG_PATH, "CCR config");
    pass(`CCR config found (${CCR_CONFIG_PATH})`);
  } catch (error) {
    fail(error.message);
  }

  if (config) {
    const routerPath = config.CUSTOM_ROUTER_PATH;
    const routerText = routerPath && fs.existsSync(routerPath) ? fs.readFileSync(routerPath, "utf8") : "";
    if (routerText.includes("__vmix_unsupported__")) pass("CCR uses the vmix fail-closed router");
    else fail("CUSTOM_ROUTER_PATH does not point to ccr/custom-router.js from this repo — unknown models could silently fall back");

    try {
      const synced = JSON.stringify(syncConfig(registry, config));
      if (synced === JSON.stringify(config)) pass("CCR provider model lists match the registry");
      else fail("CCR provider model lists drifted from the registry — run: vmix sync && ccr restart");
    } catch (error) {
      fail(error.message);
    }

    const providers = config.Providers || config.providers || [];
    const byProvider = new Map();
    for (const model of enabledModels(registry)) {
      if (!byProvider.has(model.provider)) byProvider.set(model.provider, []);
      byProvider.get(model.provider).push(model.id);
    }
    for (const [name, ids] of byProvider) {
      const provider = providers.find((item) => item.name === name);
      if (!provider) continue;
      try {
        const listed = await catalog(provider.api_base_url);
        const absent = ids.filter((id) => !listed.has(id));
        if (absent.length) fail(`${name}: not offered upstream: ${absent.join(", ")} — disable them in the registry or fix the proxy login`);
        else pass(`${name}: all ${ids.length} registry models are offered upstream`);
      } catch (error) {
        fail(`${name}: cannot read model list from ${new URL(provider.api_base_url).origin} (${error.message}) — is the proxy running and is the network/VPN up?`);
      }
    }
  }

  if (await reachable(`${CCR_URL}/`)) pass(`claude-code-router answers at ${CCR_URL}`);
  else fail(`claude-code-router is not answering at ${CCR_URL} — start it: ccr start`);

  console.log(failed ? `vmix doctor: ${failed} problem(s)` : "vmix doctor: all checks passed");
  if (failed) process.exitCode = 1;
}

// The answering model must be the one that was asked for (virtual "-1m" profiles
// answer as their physical base). A different model answering is a failure even
// if the reply looks fine: that is exactly the silent fallback vmix exists to stop.
export function sameModel(requested, answered) {
  const want = String(requested).replace(/-1m$/, "");
  const got = String(answered || "");
  return got === want || got.startsWith(`${want}-`) || want.startsWith(`${got}-`);
}

async function ask(model) {
  const response = await fetch(`${CCR_URL}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": "vmix-local" },
    body: JSON.stringify({ model, max_tokens: 32, messages: [{ role: "user", content: "Reply with exactly: ok" }] }),
    signal: AbortSignal.timeout(Number(process.env.VMIX_SMOKE_TIMEOUT_MS || 90000)),
  });
  const body = await response.json().catch(() => ({}));
  const error = body.error ? String(body.error.message || body.error.type || "").replace(/\s+/g, " ").slice(0, 160) : "";
  return { status: response.status, model: body.model || null, error };
}

async function cmdSmoke(ids) {
  const registry = mustValidate(loadRegistry());
  const targets = ids.length ? ids.map((id) => resolve(registry, id)) : enabledModels(registry);
  let failed = 0;
  for (const [index, model] of targets.entries()) {
    if (!model) {
      failed += 1;
      console.log(`FAIL  ${ids[index]}: not an enabled registry model`);
      continue;
    }
    try {
      const reply = await ask(routeString(model));
      if (reply.status === 200 && sameModel(model.id, reply.model)) console.log(`PASS  ${model.id} answered as ${reply.model}`);
      else {
        failed += 1;
        console.log(`FAIL  ${model.id}: HTTP ${reply.status}, answered as ${reply.model || "nothing"}${reply.error ? ` — ${reply.error}` : ""}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`FAIL  ${model.id}: ${error.message}`);
    }
  }
  const probe = process.env.VMIX_SMOKE_BLOCKED || "claude-opus-5-5";
  try {
    const reply = await ask(probe);
    if (reply.status >= 400) console.log(`PASS  unregistered ${probe} is refused (HTTP ${reply.status})`);
    else {
      failed += 1;
      console.log(`FAIL  unregistered ${probe} was answered by ${reply.model} — the router is falling back`);
    }
  } catch (error) {
    failed += 1;
    console.log(`FAIL  blocked-model probe: ${error.message}`);
  }
  console.log(failed ? `vmix smoke: ${failed} problem(s)` : "vmix smoke: every model answered as itself");
  if (failed) process.exitCode = 1;
}

function cmdList() {
  const registry = mustValidate(loadRegistry());
  for (const model of registry.models) {
    const flags = [
      model.id === registry.defaultModel ? "default" : "",
      model.picker ? `/model slot: ${model.picker}` : "",
      model.enabled ? "" : "disabled",
    ].filter(Boolean).join(", ");
    const aliases = (model.aliases || []).join(" ");
    console.log(`${routeString(model).padEnd(40)} ${aliases.padEnd(28)} ${flags}`);
  }
  for (const [name, profile] of Object.entries(registry.profiles || {})) {
    const parts = [`default ${profile.default || registry.defaultModel}`, profile.family ? `${profile.family} only` : "", profile.variant ? `${profile.variant} variant` : ""].filter(Boolean);
    console.log(`profile ${name.padEnd(12)} vmix --profile ${name}   (${parts.join(", ")})`);
  }
}

async function main(argv) {
  const [command = "help", ...rest] = argv;
  if (command === "validate") {
    mustValidate(loadRegistry());
    console.log("vmix registry: valid");
  } else if (command === "resolve") {
    const registry = mustValidate(loadRegistry());
    const model = resolve(registry, rest.join(" "));
    if (!model) {
      process.exitCode = 2;
      return;
    }
    console.log([model.id, model.contextCap.toLowerCase(), model.provider, routeString(model)].join("\t"));
  } else if (command === "slots") {
    for (const slot of pickerSlots(mustValidate(loadRegistry()))) console.log([slot.slot, slot.route, slot.label].join("\t"));
  } else if (command === "list") {
    cmdList();
  } else if (command === "plan") {
    const registry = mustValidate(loadRegistry());
    let profileName = "";
    let words = rest;
    if (words[0] === "--profile") [profileName, words] = [words[1] || "", words.slice(2)];
    if (words[0] === "--") words = words.slice(1);
    const result = plan(registry, words, profileName);
    if (result.error) {
      console.error(`vmix: ${result.error}`);
      process.exitCode = 2;
      return;
    }
    const out = [
      ["MODEL", result.model.id], ["FAMILY", result.model.family || ""], ["ROUTE", result.route], ["CONSUMED", String(result.consumed)],
      ...result.slots.map((slot) => ["SLOT", slot.slot, slot.route, slot.label]),
      ...result.args.map((arg) => ["ARG", arg]),
    ];
    console.log(out.map((row) => row.join("\t")).join("\n"));
  } else if (command === "allowlist") {
    const registry = mustValidate(loadRegistry());
    console.log(JSON.stringify({ availableModels: availableModels(registry) }));
  } else if (command === "sync") {
    cmdSync();
  } else if (command === "doctor") {
    await cmdDoctor();
  } else if (command === "smoke") {
    await cmdSmoke(rest);
  } else {
    console.log("usage: vmix-registry.mjs validate|resolve <model>|plan [--profile P] -- <words...>|slots|list|allowlist|sync|doctor|smoke [model...]");
    if (command !== "help") process.exitCode = 64;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`vmix: ${error.message}`);
    process.exitCode = error instanceof UsageError ? 1 : 70;
  });
}
