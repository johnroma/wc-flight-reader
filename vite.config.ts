import { defineConfig } from "vite"
import type { Plugin } from "vite"

/**
 * Stubs Node.js built-ins and esbuild for the browser-targeted code-mode entry.
 *
 * @tanstack/ai-code-mode-skills bundles file-storage.js (node:fs/path) and
 * uses esbuild for TypeScript stripping. Neither works in a browser bundle.
 * The stubs are safe because:
 *  - file-storage is never called (we export a localStorage storage instead)
 *  - esbuild.transform stubs pass code through unchanged; the LLM should emit
 *    plain JS when targeting QuickJS in a browser context
 */
function browserCompatPlugin(): Plugin {
  const NODE_STUBS = new Set([
    "node:fs/promises",
    "node:fs",
    "node:path",
    "fs",
    "path",
    "os",
  ])

  return {
    name: "browser-compat-stubs",
    enforce: "pre",
    resolveId(id) {
      if (NODE_STUBS.has(id)) return "\0node-stub"
      if (id === "esbuild") return "\0esbuild-stub"
    },
    load(id) {
      if (id === "\0node-stub") {
        return [
          "export default {}",
          "export const join = () => ''",
          "export const existsSync = () => false",
          "export const rm = () => Promise.resolve()",
          "export const mkdir = () => Promise.resolve()",
          "export const writeFile = () => Promise.resolve()",
          "export const readFile = () => Promise.resolve(null)",
        ].join("\n")
      }
      if (id === "\0esbuild-stub") {
        // Pass code through unchanged — the LLM targets plain JS for QuickJS
        return "export const transform = async (code) => ({ code, warnings: [] })"
      }
    },
  }
}

export default defineConfig({
  plugins: [browserCompatPlugin()],
  build: {
    minify: false,
    lib: {
      entry: {
        "wc-flight-reader": "src/index.ts",
        "code-mode": "src/code-mode.ts",
      },
      formats: ["es"],
    },
  },
})
