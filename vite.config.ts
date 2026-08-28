import { spawn } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/* Local dev only: start the API server (server/devApi.mjs) alongside Vite
 * so the browser hits the same /api/* security model as production. */
function localApi(): Plugin {
  return {
    name: "local-api-server",
    apply: "serve",
    configureServer(server) {
      const child = spawn(process.execPath, ["server/devApi.mjs"], {
        stdio: "inherit",
      });
      child.on("error", () => {
        console.warn("[local-api] failed to start server/devApi.mjs");
      });
      server.httpServer?.once("close", () => child.kill());
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localApi(),
    {
      name: "adsense-client",
      transformIndexHtml(html) {
        return html.replace(
          "%VITE_ADSENSE_CLIENT%",
          process.env.VITE_ADSENSE_CLIENT || "ca-pub-0000000000000000",
        );
      },
    },
  ],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:4179", changeOrigin: true },
    },
  },
});
