/* Run a minimal static server for the built SPA: `node server/standalone.mjs`.
 * Useful for local production testing. For deployment, use Vercel or Netlify. */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./httpServer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4180;

const { url } = await startServer({
  distDir: path.join(__dirname, "..", "dist"),
  port,
});

console.log(`AIstudy server running at ${url}`);
