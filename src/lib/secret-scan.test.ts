import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* The secret-scan in vite.config.ts fails the production build if any
   server-side secret or secret-shaped value appears in the client bundle.
   This test keeps that guarantee executable in the test suite. */

const distDir = join(__dirname, "..", "..", "dist");
const SECRET_LIKE = /sk-[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_]{16,}/;

describe("client bundle secret hygiene", () => {
  it("dist/ (when built) contains no API secrets", () => {
    let files: string[] = [];
    try {
      files = readdirSync(join(distDir, "assets"));
    } catch {
      return; // dist not built in this environment — the build-time scan covers it
    }
    for (const file of files.filter((f) => f.endsWith(".js"))) {
      const src = readFileSync(join(distDir, "assets", file), "utf8");
      const m = src.match(SECRET_LIKE);
      expect(m, `secret-shaped value in ${file}`).toBeNull();
    }
  });
});
