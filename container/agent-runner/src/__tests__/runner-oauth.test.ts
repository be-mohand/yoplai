import { InMemoryCredentialStore, ModelsError } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureFreshOAuthToken,
  isOAuthRefreshError,
  renewOAuthToken,
  seedOAuthCredentials,
  type OAuthRenewalContext,
} from "../runner.js";

const baseInput = {
  gatewayUrl: "http://gateway:3000",
  agentToken: "token-1",
  agentId: "agent-1",
  sessionId: "session-1",
  runId: "run-1",
};

function makeContext(
  overrides: Partial<OAuthRenewalContext> = {}
): OAuthRenewalContext {
  return {
    store: new InMemoryCredentialStore(),
    oauthExpiryByProvider: new Map<string, number>(),
    input: baseInput,
    renewalLocks: new Map<string, Promise<boolean>>(),
    ...overrides,
  };
}

describe("seedOAuthCredentials", () => {
  it("writes an oauth credential per provider and tracks its expiry", async () => {
    const store = new InMemoryCredentialStore();

    const expiryByProvider = await seedOAuthCredentials(store, {
      "openai-codex": { accessToken: "access-1", expiresAt: 1_000 },
      anthropic: { accessToken: "access-2", expiresAt: 2_000 },
    });

    expect(expiryByProvider).toEqual(
      new Map([
        ["openai-codex", 1_000],
        ["anthropic", 2_000],
      ])
    );
    await expect(store.read("openai-codex")).resolves.toEqual({
      type: "oauth",
      access: "access-1",
      refresh: "",
      expires: 1_000,
    });
    await expect(store.read("anthropic")).resolves.toEqual({
      type: "oauth",
      access: "access-2",
      refresh: "",
      expires: 2_000,
    });
  });

  it("returns an empty map and writes nothing when oauthTokens is absent", async () => {
    const store = new InMemoryCredentialStore();
    const modifySpy = vi.spyOn(store, "modify");

    const expiryByProvider = await seedOAuthCredentials(store, undefined);

    expect(expiryByProvider.size).toBe(0);
    expect(modifySpy).not.toHaveBeenCalled();
  });
});

describe("ensureFreshOAuthToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a no-op for a provider not tracked from oauthTokens", async () => {
    const fetchToken = vi.fn();
    const ctx = makeContext({ fetchToken });

    await ensureFreshOAuthToken("anthropic", ctx);

    expect(fetchToken).not.toHaveBeenCalled();
  });

  it("does not renew when the tracked credential has more than 10 minutes left", async () => {
    const now = 1_700_000_000_000;
    const fetchToken = vi.fn();
    const ctx = makeContext({
      oauthExpiryByProvider: new Map([["openai-codex", now + 11 * 60 * 1000]]),
      fetchToken,
      now: () => now,
    });

    await ensureFreshOAuthToken("openai-codex", ctx);

    expect(fetchToken).not.toHaveBeenCalled();
    expect(ctx.oauthExpiryByProvider.get("openai-codex")).toBe(
      now + 11 * 60 * 1000
    );
  });

  it("renews and updates the store and tracked expiry when under 10 minutes remain", async () => {
    const now = 1_700_000_000_000;
    const fetchToken = vi.fn(async () => ({
      accessToken: "renewed-access",
      expiresAt: now + 60 * 60 * 1000,
    }));
    const ctx = makeContext({
      oauthExpiryByProvider: new Map([["openai-codex", now + 9 * 60 * 1000]]),
      fetchToken,
      now: () => now,
    });

    await ensureFreshOAuthToken("openai-codex", ctx);

    expect(fetchToken).toHaveBeenCalledWith(baseInput, "openai-codex");
    expect(ctx.oauthExpiryByProvider.get("openai-codex")).toBe(
      now + 60 * 60 * 1000
    );
    await expect(ctx.store.read("openai-codex")).resolves.toEqual({
      type: "oauth",
      access: "renewed-access",
      refresh: "",
      expires: now + 60 * 60 * 1000,
    });
  });

  it("logs and swallows a renewal failure instead of throwing", async () => {
    const now = 1_700_000_000_000;
    const fetchToken = vi.fn(async () => {
      throw new Error("gateway unreachable");
    });
    const ctx = makeContext({
      oauthExpiryByProvider: new Map([["openai-codex", now + 1 * 60 * 1000]]),
      fetchToken,
      now: () => now,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      ensureFreshOAuthToken("openai-codex", ctx)
    ).resolves.toBeUndefined();

    expect(ctx.oauthExpiryByProvider.get("openai-codex")).toBe(
      now + 1 * 60 * 1000
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to renew OAuth token for provider openai-codex"
      )
    );
  });
});

describe("renewOAuthToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dedupes concurrent renewals for the same provider into a single fetch", async () => {
    let resolveFetch: (value: {
      accessToken: string;
      expiresAt: number;
    }) => void = () => {};
    const fetchToken = vi.fn(
      () =>
        new Promise<{ accessToken: string; expiresAt: number }>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const ctx = makeContext({
      oauthExpiryByProvider: new Map([["openai-codex", 0]]),
      fetchToken,
    });

    const first = renewOAuthToken("openai-codex", ctx);
    const second = renewOAuthToken("openai-codex", ctx);
    resolveFetch({ accessToken: "renewed", expiresAt: 999 });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(ctx.oauthExpiryByProvider.get("openai-codex")).toBe(999);
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
  });

  it("releases the lock after renewal so a later call fetches again", async () => {
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: "first", expiresAt: 1 })
      .mockResolvedValueOnce({ accessToken: "second", expiresAt: 2 });
    const ctx = makeContext({ fetchToken });

    await renewOAuthToken("openai-codex", ctx);
    await renewOAuthToken("openai-codex", ctx);

    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(ctx.oauthExpiryByProvider.get("openai-codex")).toBe(2);
  });

  it("returns false and leaves the tracked expiry unchanged when the fetch fails", async () => {
    const fetchToken = vi.fn(async () => {
      throw new Error("gateway unreachable");
    });
    const ctx = makeContext({
      oauthExpiryByProvider: new Map([["openai-codex", 123]]),
      fetchToken,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(renewOAuthToken("openai-codex", ctx)).resolves.toBe(false);

    expect(ctx.oauthExpiryByProvider.get("openai-codex")).toBe(123);
  });
});

describe("isOAuthRefreshError", () => {
  it("is true only for the SDK's own oauth-code ModelsError", () => {
    expect(isOAuthRefreshError(new ModelsError("oauth", "boom"))).toBe(true);
    expect(isOAuthRefreshError(new ModelsError("auth", "boom"))).toBe(false);
    expect(isOAuthRefreshError(new Error("HTTP 503"))).toBe(false);
    expect(isOAuthRefreshError("boom")).toBe(false);
  });
});
