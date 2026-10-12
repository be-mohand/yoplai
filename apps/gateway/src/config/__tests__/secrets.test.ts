import { afterEach, describe, expect, it, vi } from "vitest";
import { isEnvRef, resolveConfigSecrets, resolveEnvRefSync, resolveSecretValue } from "../secrets.js";

describe("secret resolution", () => {
  afterEach(() => {
    delete process.env.TEST_SECRET_ENV;
    vi.unstubAllGlobals();
  });

  it("passes raw strings through", async () => {
    await expect(resolveSecretValue("plain-value")).resolves.toBe("plain-value");
  });

  it("resolves env refs", async () => {
    process.env.TEST_SECRET_ENV = "resolved";
    await expect(resolveSecretValue("$env:TEST_SECRET_ENV")).resolves.toBe(
      "resolved"
    );
  });

  it("errors when env ref missing", async () => {
    await expect(resolveSecretValue("$env:DOES_NOT_EXIST")).rejects.toThrow(
      'Env var "DOES_NOT_EXIST" not set'
    );
  });

  it("errors when secret refs use removed legacy lookup", async () => {
    await expect(resolveSecretValue("$secret:discord_bot")).rejects.toThrow(
      'Secret "discord_bot" uses removed $secret: resolution. Use $env:discord_bot or native top-level onecli proxy config instead.'
    );
  });

  it("walks nested config objects", async () => {
    process.env.TEST_SECRET_ENV = "resolved";

    await expect(
      resolveConfigSecrets({
        extensions: {
          discord: {
            token: "$env:TEST_SECRET_ENV",
          },
        },
      })
    ).resolves.toEqual({
      extensions: {
        discord: {
          token: "resolved",
        },
      },
    });
  });
});

describe("env refs", () => {
  it("recognises refs and resolves them without throwing when unset", () => {
    expect(isEnvRef("$env:FOO")).toBe(true);
    expect(isEnvRef("FOO")).toBe(false);
    expect(isEnvRef(5)).toBe(false);
    expect(resolveEnvRefSync("$env:FOO", { FOO: "bar" })).toBe("bar");
    expect(resolveEnvRefSync("$env:FOO", {})).toBeUndefined();
  });
});
