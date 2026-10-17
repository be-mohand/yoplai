import { describe, expect, it } from "vitest";
import { resolveThreaditConfig } from "./config.js";

describe("resolveThreaditConfig", () => {
  it("merges root defaults and lets the agent override", () => {
    const result = resolveThreaditConfig(
      { baseUrl: "http://root:8000/", pollIntervalMs: 7000, turnTimeoutMinutes: 5 },
      { token: "t", pollIntervalMs: 2000 }
    );
    expect(result).toEqual({
      status: "ok",
      config: {
        baseUrl: "http://root:8000",
        token: "t",
        pollIntervalMs: 2000,
        turnTimeoutMinutes: 5,
        activity: "safe",
      },
    });
  });

  it("applies defaults and strips trailing slashes from the agent baseUrl", () => {
    const result = resolveThreaditConfig(undefined, {
      token: "t",
      baseUrl: "http://a:1//",
    });
    expect(result).toEqual({
      status: "ok",
      config: {
        baseUrl: "http://a:1",
        token: "t",
        pollIntervalMs: 5000,
        turnTimeoutMinutes: 60,
        activity: "safe",
      },
    });
  });

  it("skips agents without config or disabled", () => {
    expect(resolveThreaditConfig({}, undefined)).toEqual({ status: "skipped" });
    expect(resolveThreaditConfig({}, { enabled: false, token: "t" })).toEqual({
      status: "skipped",
    });
  });

  it("accepts a baseUrl without a token", () => {
    expect(resolveThreaditConfig({ baseUrl: "http://x" }, {})).toEqual({
      status: "ok",
      config: {
        baseUrl: "http://x",
        token: undefined,
        pollIntervalMs: 5000,
        turnTimeoutMinutes: 60,
        activity: "safe",
      },
    });
  });

  it("rejects missing baseUrl and a too-short poll interval", () => {
    expect(resolveThreaditConfig({}, { token: "t" })).toEqual({
      status: "invalid",
      reason: "baseUrl",
    });
    expect(
      resolveThreaditConfig({ baseUrl: "http://x" }, { token: "t", pollIntervalMs: 10 })
    ).toEqual({ status: "invalid", reason: "agent config" });
  });

  it("resolves activity: agent wins over root, default safe", () => {
    const ok = (root: unknown, agent: unknown) => {
      const r = resolveThreaditConfig(root, agent);
      return r.status === "ok" ? r.config.activity : r.status;
    };
    expect(ok({ baseUrl: "http://b" }, { token: "t" })).toBe("safe");
    expect(ok({ baseUrl: "http://b", activity: "detailed" }, { token: "t" })).toBe("detailed");
    expect(
      ok({ baseUrl: "http://b", activity: "detailed" }, { token: "t", activity: "safe" })
    ).toBe("safe");
    expect(ok({ baseUrl: "http://b" }, { token: "t", activity: "detailed" })).toBe("detailed");
    expect(ok({ baseUrl: "http://b" }, { token: "t", activity: "loud" })).toBe("invalid");
  });
});
