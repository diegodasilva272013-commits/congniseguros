import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const VITE_PORT = Number(process.env.VITE_PORT) || 3000;
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 5000;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Windows: evita líos de IPv6/localhost y ayuda con firewalls
    host: "127.0.0.1",
    port: VITE_PORT,
    strictPort: true,
    // Evita loop infinito de HMR cuando se escriben logs en el root
    watch: {
      ignored: [
        "**/logs/**",
        "**/backups/**",
        "**/vite.out.txt",
        "**/vite.err.txt",
        "**/dev-both.out.txt",
        "**/dev-both.err.txt",
        "**/dev-now.out.txt",
        "**/dev-now.err.txt",
        "**/server*.out.txt",
        "**/server*.err.txt",
        "**/*.timestamp-*.mjs",
      ],
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      "/send-code": {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      "/verify-code": {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  }
})