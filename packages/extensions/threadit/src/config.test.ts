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
});
