import { defineConfig } from "vite"

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "wc-flight-reader",
    },
  },
})
