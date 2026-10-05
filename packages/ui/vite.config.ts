import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", target: "es2022", sourcemap: false },
  server: {
    port: 5199,
    proxy: { "/api": "http://127.0.0.1:4517" },
  },
})
