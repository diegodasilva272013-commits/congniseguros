// vite.config.js
import { defineConfig } from "file:///C:/Users/diego/OneDrive/Desktop/App%20Cogniseguros/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/diego/OneDrive/Desktop/App%20Cogniseguros/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/diego/OneDrive/Desktop/App%20Cogniseguros/node_modules/@tailwindcss/vite/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Windows: evita líos de IPv6/localhost y ayuda con firewalls
    host: "127.0.0.1",
    port: 3e3,
    strictPort: true,
    // Evita loop infinito de HMR cuando se escriben logs en el root
    watch: {
      ignored: [
        "**/vite.out.txt",
        "**/vite.err.txt",
        "**/dev-both.out.txt",
        "**/dev-both.err.txt",
        "**/*.timestamp-*.mjs"
      ]
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true
      },
      "/send-code": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true
      },
      "/verify-code": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxkaWVnb1xcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXEFwcCBDb2duaXNlZ3Vyb3NcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGRpZWdvXFxcXE9uZURyaXZlXFxcXERlc2t0b3BcXFxcQXBwIENvZ25pc2VndXJvc1xcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvZGllZ28vT25lRHJpdmUvRGVza3RvcC9BcHAlMjBDb2duaXNlZ3Vyb3Mvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xyXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXHJcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tICdAdGFpbHdpbmRjc3Mvdml0ZSdcclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW3JlYWN0KCksIHRhaWx3aW5kY3NzKCldLFxyXG4gIHNlcnZlcjoge1xyXG4gICAgLy8gV2luZG93czogZXZpdGEgbFx1MDBFRG9zIGRlIElQdjYvbG9jYWxob3N0IHkgYXl1ZGEgY29uIGZpcmV3YWxsc1xyXG4gICAgaG9zdDogXCIxMjcuMC4wLjFcIixcclxuICAgIHBvcnQ6IDMwMDAsXHJcbiAgICBzdHJpY3RQb3J0OiB0cnVlLFxyXG4gICAgLy8gRXZpdGEgbG9vcCBpbmZpbml0byBkZSBITVIgY3VhbmRvIHNlIGVzY3JpYmVuIGxvZ3MgZW4gZWwgcm9vdFxyXG4gICAgd2F0Y2g6IHtcclxuICAgICAgaWdub3JlZDogW1xyXG4gICAgICAgIFwiKiovdml0ZS5vdXQudHh0XCIsXHJcbiAgICAgICAgXCIqKi92aXRlLmVyci50eHRcIixcclxuICAgICAgICBcIioqL2Rldi1ib3RoLm91dC50eHRcIixcclxuICAgICAgICBcIioqL2Rldi1ib3RoLmVyci50eHRcIixcclxuICAgICAgICBcIioqLyoudGltZXN0YW1wLSoubWpzXCIsXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gICAgcHJveHk6IHtcclxuICAgICAgXCIvYXBpXCI6IHtcclxuICAgICAgICB0YXJnZXQ6IFwiaHR0cDovLzEyNy4wLjAuMTo1MDAwXCIsXHJcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBcIi9zZW5kLWNvZGVcIjoge1xyXG4gICAgICAgIHRhcmdldDogXCJodHRwOi8vMTI3LjAuMC4xOjUwMDBcIixcclxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIFwiL3ZlcmlmeS1jb2RlXCI6IHtcclxuICAgICAgICB0YXJnZXQ6IFwiaHR0cDovLzEyNy4wLjAuMTo1MDAwXCIsXHJcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9XHJcbn0pIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFnVixTQUFTLG9CQUFvQjtBQUM3VyxPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFHeEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFBQSxFQUNoQyxRQUFRO0FBQUE7QUFBQSxJQUVOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQTtBQUFBLElBRVosT0FBTztBQUFBLE1BQ0wsU0FBUztBQUFBLFFBQ1A7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLE1BQ0EsY0FBYztBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEsTUFDQSxnQkFBZ0I7QUFBQSxRQUNkLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
