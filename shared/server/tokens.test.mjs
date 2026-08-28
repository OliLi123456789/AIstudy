import { describe, it, expect } from "vitest";
import { signToken, verifyToken, secureEqual, maskKey } from "./tokens.mjs";

const SECRET = "test-secret";

describe("server tokens", () => {
  it("round-trips a signed token", () => {
    const token = signToken({ t: "anon", id: "abc" }, SECRET, 3600);
    const payload = verifyToken(token, SECRET);
    expect(payload).toMatchObject({ t: "anon", id: "abc" });
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it("rejects tampered payloads and signatures", () => {
    const token = signToken({ t: "anon", id: "abc" }, SECRET, 3600);
    const [body] = token.split(".");
    expect(verifyToken(`${body}.AAAA`, SECRET)).toBeNull();
    const forged = signToken({ t: "admin", id: "abc" }, "other-secret", 3600);
    expect(verifyToken(forged, SECRET)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signToken({ t: "anon", id: "abc" }, SECRET, -10);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it("rejects wrong-kind tokens", () => {
    const token = signToken({ t: "admin" }, SECRET, 3600);
    const payload = verifyToken(token, SECRET);
    expect(payload.t).toBe("admin");
  });

  it("compares strings in constant time", () => {
    expect(secureEqual("hunter2", "hunter2")).toBe(true);
    expect(secureEqual("hunter2", "hunter3")).toBe(false);
    expect(secureEqual(undefined, "")).toBe(true);
  });

  it("masks keys", () => {
    expect(maskKey("")).toBe("");
    expect(maskKey("sk-abc1234")).toBe("sk-…1234");
    expect(maskKey("short")).toBe("••••••••");
  });
});
