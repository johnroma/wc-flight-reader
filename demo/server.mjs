#!/usr/bin/env node
/**
 * Minimal demo server for wc-flight-reader.
 * Reads GEMINI_API_KEY (and optionally OPENAI_API_KEY) from .env in the repo root,
 * injects them into demo/index.html, and serves the built dist/ output.
 *
 * Usage:
 *   pnpm build && node demo/server.mjs
 *   # or: PORT=4000 node demo/server.mjs
 */

import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dir, "..")

// --- .env parser (no dotenv dependency needed) ---
function loadEnv(envPath) {
  try {
    const lines = fs.readFileSync(envPath, "utf8").split("\n")
    const env = {}
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      // Strip optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
    return env
  } catch {
    return {}
  }
}

const env = loadEnv(path.join(root, ".env"))

const GEMINI_KEY = env.GEMINI_API_KEY || ""
const OPENAI_KEY = env.OPENAI_API_KEY || ""
const GEMINI_MODEL = env.GEMINI_MODEL || ""
const OPENAI_MODEL = env.OPENAI_MODEL || ""
const SUBSCRIPTION_LLM_URL = env.SUBSCRIPTION_LLM_URL || ""
const SUBSCRIPTION_LLM_TOKEN = env.SUBSCRIPTION_LLM_TOKEN || ""
const PORT = parseInt(process.env.PORT || "3456", 10)

// --- MIME types ---
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".wasm": "application/wasm",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
}

function mime(ext) {
  return MIME[ext] || "application/octet-stream"
}

// Inject server-side config into demo/index.html
function serveIndex(res) {
  const template = fs.readFileSync(path.join(__dir, "index.html"), "utf8")
  const config = `<script>
    window.__DEMO_KEY__ = ${JSON.stringify(GEMINI_KEY)};
    window.__DEMO_OPENAI_KEY__ = ${JSON.stringify(OPENAI_KEY)};
    window.__DEMO_GEMINI_MODEL__ = ${JSON.stringify(GEMINI_MODEL)};
    window.__DEMO_OPENAI_MODEL__ = ${JSON.stringify(OPENAI_MODEL)};
    window.__DEMO_SUBSCRIPTION_LLM_URL__ = ${JSON.stringify(SUBSCRIPTION_LLM_URL)};
    window.__DEMO_SUBSCRIPTION_LLM_TOKEN__ = ${JSON.stringify(SUBSCRIPTION_LLM_TOKEN)};
  </script>`
  const html = template.replace("</head>", `${config}\n  </head>`)
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(html)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname

  // Demo page
  if (pathname === "/" || pathname === "/index.html") {
    return serveIndex(res)
  }

  // Static files under /dist/ (served from root/dist/)
  if (pathname.startsWith("/dist/")) {
    const filePath = path.join(root, pathname)
    try {
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath)
      res.writeHead(200, { "Content-Type": mime(ext) })
      return res.end(data)
    } catch {
      res.writeHead(404)
      return res.end("Not found")
    }
  }

  res.writeHead(404)
  res.end("Not found")
})

server.listen(PORT, () => {
  const keyStatus = GEMINI_KEY
    ? `✓ GEMINI_API_KEY loaded (${GEMINI_KEY.slice(0, 8)}…)`
    : "⚠  GEMINI_API_KEY not set — add it to .env"
  console.log(`\n  wc-flight-reader demo`)
  console.log(`  ${keyStatus}`)
  console.log(`  → http://localhost:${PORT}\n`)
})
