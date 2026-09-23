#!/usr/bin/env node
// vmix-default-guard — keep proxy sessions from changing your normal Claude Code default.
//
// Picking a model with /model inside a proxy session makes Claude Code save it as the
// global default ("model" in ~/.claude/settings.json). The next plain `claude` then
// starts on "haiku" or on a proxy route it cannot reach. The launcher records the value
// before the session (`get`) and puts it back afterwards (`restore`).
//
//   before="$(vmix-default-guard.mjs get)"
//   claude ...
//   vmix-default-guard.mjs restore "$before"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SETTINGS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json");

// Values a proxy session writes: a picker slot alias, a provider-prefixed route, or a
// non-Claude model id. A native session picking "claude-…" meanwhile is left alone.
// ponytail: a native session that picks the bare "opus"/"sonnet"/"haiku" alias while a
// proxy session is open gets reverted too; track per-session writes if that ever matters.
export function looksLikeProxyPick(value) {
  if (typeof value !== "string") return false;
  const bare = value.replace(/\[[^\]]+\]$/, "");
  if (/^(opus|sonnet|haiku)$/i.test(bare)) return true;
  if (bare.includes(",")) return true;
  return !/^(claude-|fable(?:$|-))/i.test(bare);
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Prints the current default as JSON; "null" means "no model key".
export function get() {
  const settings = read();
  return JSON.stringify(settings && Object.hasOwn(settings, "model") ? settings.model : null);
}

export function restore(beforeJson) {
  const before = JSON.parse(beforeJson);
  const settings = read();
  if (!settings) return "no settings file";
  const now = Object.hasOwn(settings, "model") ? settings.model : null;
  if (JSON.stringify(now) === JSON.stringify(before)) return "unchanged";
  if (!looksLikeProxyPick(now)) return `kept ${JSON.stringify(now)} (not a proxy pick)`;
  const next = { ...settings };
  if (before === null) delete next.model;
  else next.model = before;
  const temp = `${SETTINGS}.vmix-tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  JSON.parse(fs.readFileSync(temp, "utf8"));
  fs.renameSync(temp, SETTINGS);
  return `restored default model ${JSON.stringify(now)} -> ${JSON.stringify(before)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [command, value] = process.argv.slice(2);
  try {
    if (command === "get") console.log(get());
    else if (command === "restore" && value !== undefined) {
      const result = restore(value);
      if (result.startsWith("restored")) console.error(`vmix: ${result}`);
    } else {
      console.error("usage: vmix-default-guard.mjs get | restore <json>");
      process.exitCode = 64;
    }
  } catch (error) {
    console.error(`vmix: could not guard the default model: ${error.message}`);
    process.exitCode = 1;
  }
}
