import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const apiPortText = process.env.LIA58_API_PORT ?? "3001"
if (!/^\d+$/.test(apiPortText) || Number(apiPortText) < 1024 || Number(apiPortText) > 65535) {
  throw new Error("LIA58_API_PORT must be a numeric loopback TCP port between 1024 and 65535.")
}
const apiPort = Number(apiPortText)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
