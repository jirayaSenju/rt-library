import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

const isLinux = process.platform === "linux"

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      usePolling: isLinux || process.env.VITE_USE_POLLING === "true" || process.env.CHOKIDAR_USEPOLLING === "true",
      interval: 1000,
      ignored: [
        "**/dist-desktop/**",
        "**/dist/**",
        "**/build/**",
        "**/node_modules/**",
        "**/.git/**",
        "**/scratch/**",
        "**/.userData/**",
        "**/docs/**",
        "**/tests/**",
        "**/benchmark-results/**",
      ],
    },
  },
})

