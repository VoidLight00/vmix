// vmix custom router for claude-code-router (CCR).
// One job: send each request to the provider the vmix registry declares for it.
//
// Why it never returns null or throws: CCR treats both as "use Router.default",
// which silently answers with a different model than the one picked in /model
// (measured). Unknown models are sent to an existing provider under an invalid id
// instead, so the request fails with a visible 400 from the proxy.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REGISTRY = process.env.VMIX_REGISTRY || path.join(os.homedir(), ".config", "vmix", "models.json");
const BLOCK_PROVIDER = process.env.VMIX_BLOCK_PROVIDER || "vibeproxy";

function clean(model) {
  return String(model || "")
    .replace(/^[A-Za-z0-9_-]+,/, "")
    .replace(/\[[^\]]+\]$/, "");
}

// ponytail: re-reads the registry per request so edits apply without a CCR restart;
// the file is a few KB. Cache on mtime if request volume ever makes this measurable.
function providerFor(model) {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const hit = registry.models.find((entry) => entry.enabled && entry.id === model);
  return hit ? hit.provider : null;
}

module.exports = async function vmixRouter(req) {
  let requested = "";
  try {
    requested = clean(req && req.body && req.body.model);
    const provider = providerFor(requested);
    if (provider) return `${provider},${requested}`;
  } catch (_) {
    requested = requested || "registry-unreadable";
  }
  return `${BLOCK_PROVIDER},__vmix_unsupported__${requested || "empty-model"}`;
};
