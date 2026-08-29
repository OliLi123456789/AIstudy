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

/* Safety: any process.env value containing an API secret must never appear
   in the client bundle. Fails the build if one does (e.g. someone puts a
   real key in a VITE_ variable). */
function secretScan(): Plugin {
  const SECRET_ENV = /(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|TOKEN_SECRET|ADMIN_PASSWORD)/;
  const secrets = Object.entries(process.env)
    .filter(([k, v]) => SECRET_ENV.test(k) && v)
    .map(([, v]) => v as string);
  const SECRET_LIKE = /sk-[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_]{16,}/;
  return {
    name: "secret-scan",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        const src =
          file.type === "chunk"
            ? file.code
            : typeof file.source === "string"
              ? file.source
              : "";
        if (!src) continue;
        for (const s of secrets) {
          if (src.includes(s)) {
            throw new Error(`secret-scan: an env secret leaked into the client bundle (${file.fileName})`);
          }
        }
        const m = src.match(SECRET_LIKE);
        if (m) {
          throw new Error(`secret-scan: a secret-shaped value (${m[0].slice(0, 8)}...) appears in ${file.fileName}`);
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localApi(),
    secretScan(),
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
