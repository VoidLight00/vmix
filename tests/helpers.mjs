// Shared test fixtures: temp dirs, the example registry, fake binaries and a mock HTTP server.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EXAMPLE_REGISTRY = path.join(ROOT, "config", "models.example.json");

export function tempDir(prefix = "vmix-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function exampleRegistry() {
  return readJson(EXAMPLE_REGISTRY);
}

// A fuller, multi-provider registry (solgate for GPT, VibeProxy for Gemini/GLM) so the
// tests cover more than the minimal public example that ships in config/.
export const MULTI_REGISTRY = path.join(ROOT, "tests", "fixtures", "models.multi.json");

export function multiRegistry() {
  return readJson(MULTI_REGISTRY);
}

export function writeExecutable(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o755 });
}

// Runs a command without blocking the event loop, so in-process mock servers keep answering.
export function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { ...options, encoding: "utf8" }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

// Minimal stand-in for an upstream proxy and for claude-code-router.
export async function mockServer(handler) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const reply = handler(req, body) || { status: 404, json: {} };
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.json));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise((resolve) => server.close(resolve)) };
}

export async function unusedPortUrl() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  await new Promise((resolve) => server.close(resolve));
  return url;
}
