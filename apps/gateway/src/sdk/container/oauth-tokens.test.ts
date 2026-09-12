import { describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "@yoplai/shared";
import {
  resolveOAuthToken,
  resolveOAuthTokens,
  type OAuthTokensDeps,
  type ResolveOAuthTokenDeps,
} from "./oauth-tokens.js";

const TEN_MINUTES_MS = 10 * 60 * 1000;

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "agent-1",
    name: "Agent One",
    workspace: "/tmp/agent-1",
    queueMode: "queue",
    model: { provider: "anthropic", model: "claude" },
    ...overrides,
  } as AgentConfig;
}

type StoredCred =
  | { type: "oauth"; access: string; expires: number }
  | { type: "api_key" };

/** Simulate the SDK persisting a refreshed credential in place. */
function markRefreshed(
  credentials: Record<string, StoredCred>,
  provider: string,
  access: string
): void {
  const cred = credentials[provider];
  if (cred?.type === "oauth") credentials[provider] = { ...cred, access };
}

function makeDeps(
  credentials: Record<string, StoredCred>,
  options: {
    authPath?: string;
    getAuthImpl?: (provider: string) => Promise<unknown>;
  } = {}
): OAuthTokensDeps & { getAuth: ReturnType<typeof vi.fn> } {
  const getAuth = vi.fn(
    options.getAuthImpl ??
      (async (provider: string) => {
        const cred = credentials[provider];
        if (cred?.type !== "oauth") return undefined;
        // Simulate a real refresh: the store gets a fresh access token,
        // independent of whatever shape getAuth itself returns.
        markRefreshed(credentials, provider, `${provider}-fresh-token`);
        return { auth: { apiKey: `${provider}-fresh-token` } };
      })
  );
  return {
    authPath: options.authPath ?? "/fake/auth.json",
    createRuntime: async () => ({ getAuth }),
    readCredential: async (provider) => credentials[provider],
    getAuth,
  };
}

function unreachableDeps(): OAuthTokensDeps {
  return {
    authPath: "/fake/auth.json",
    createRuntime: async () => {
      throw new Error("createRuntime must not be called for a non-oauth agent");
    },
    readCredential: async () => {
      throw new Error("readCredential must not be called for a non-oauth agent");
    },
  };
}

describe("resolveOAuthTokens", () => {
  it("returns undefined when the agent is not in oauth auth mode", async () => {
    const deps = makeDeps({
      anthropic: { type: "oauth", access: "initial", expires: 123 },
    });
    const result = await resolveOAuthTokens(
      agent({ auth: { mode: "api_key" } }),
      deps
    );
    expect(result).toBeUndefined();
  });

  it("never touches auth storage for a non-oauth agent, so a missing auth.json doesn't block launch", async () => {
    const result = await resolveOAuthTokens(
      agent({ auth: undefined }),
      unreachableDeps()
    );
    expect(result).toBeUndefined();
  });

  it("resolves tokens for both primary and fallback providers, requesting the 10-minute minimum validity", async () => {
    const deps = makeDeps({
      anthropic: { type: "oauth", access: "initial", expires: 1000 },
      openai: { type: "oauth", access: "initial", expires: 2000 },
    });
    const result = await resolveOAuthTokens(
      agent({
        auth: { mode: "oauth" },
        fallback_model: { provider: "openai", model: "gpt-5" },
      }),
      deps
    );
    expect(result).toEqual({
      anthropic: { accessToken: "anthropic-fresh-token", expiresAt: 1000 },
      openai: { accessToken: "openai-fresh-token", expiresAt: 2000 },
    });
    expect(deps.getAuth).toHaveBeenCalledWith("anthropic", {
      minOAuthValidityMs: TEN_MINUTES_MS,
    });
    expect(deps.getAuth).toHaveBeenCalledWith("openai", {
      minOAuthValidityMs: TEN_MINUTES_MS,
    });
  });

  it("skips a provider whose stored credential is not oauth", async () => {
    const deps = makeDeps({ anthropic: { type: "api_key" } });
    const result = await resolveOAuthTokens(
      agent({ auth: { mode: "oauth" } }),
      deps
    );
    expect(result).toBeUndefined();
  });

  it("skips a provider whose refresh throws and still resolves a healthy one", async () => {
    const credentials: Record<string, StoredCred> = {
      anthropic: { type: "oauth", access: "initial", expires: 1000 },
      openai: { type: "oauth", access: "initial", expires: 2000 },
    };
    const deps = makeDeps(credentials, {
      authPath: "/fake/partial-failure.json",
      getAuthImpl: async (provider) => {
        if (provider === "anthropic") throw new Error("IdP unreachable");
        markRefreshed(credentials, provider, `${provider}-fresh-token`);
        return { auth: {} };
      },
    });
    const result = await resolveOAuthTokens(
      agent({
        auth: { mode: "oauth" },
        fallback_model: { provider: "openai", model: "gpt-5" },
      }),
      deps
    );
    expect(result).toEqual({
      openai: { accessToken: "openai-fresh-token", expiresAt: 2000 },
    });
  });

  it("returns undefined without throwing when every provider's refresh fails", async () => {
    const deps = makeDeps(
      { anthropic: { type: "oauth", access: "initial", expires: 1000 } },
      {
        authPath: "/fake/total-failure.json",
        getAuthImpl: async () => {
          throw new Error("IdP unreachable");
        },
      }
    );
    const result = await resolveOAuthTokens(
      agent({ auth: { mode: "oauth" } }),
      deps
    );
    expect(result).toBeUndefined();
  });

  it("takes both accessToken and expiresAt from the single post-refresh credential read, not from getAuth's return value", async () => {
    const credentials: Record<string, StoredCred> = {
      anthropic: { type: "oauth", access: "stale-token", expires: 1000 },
    };
    const getAuth = vi.fn(async () => {
      // A concurrent refresh (e.g. a host run) lands between our getAuth
      // call and the re-read: the store ends up with a token/expiry pair
      // that getAuth's own return value never reflects.
      credentials.anthropic = {
        type: "oauth",
        access: "rotated-token",
        expires: 9999,
      };
      return { auth: { apiKey: "stale-token" } };
    });
    const deps: OAuthTokensDeps = {
      authPath: "/fake/atomic-pair.json",
      createRuntime: async () => ({ getAuth }),
      readCredential: async (provider) => credentials[provider],
    };

    const result = await resolveOAuthTokens(
      agent({ auth: { mode: "oauth" } }),
      deps
    );

    expect(result).toEqual({
      anthropic: { accessToken: "rotated-token", expiresAt: 9999 },
    });
  });
});

describe("resolveOAuthToken", () => {
  function makeResolveDeps(
    credentials: Record<string, StoredCred>,
    agentConfig: AgentConfig | undefined,
    options: Parameters<typeof makeDeps>[1] = {}
  ): ResolveOAuthTokenDeps & { getAuth: ReturnType<typeof vi.fn> } {
    return {
      ...makeDeps(credentials, options),
      getAgent: () => agentConfig,
    };
  }

  it("returns forbidden when the agent is not in oauth mode", async () => {
    const deps = makeResolveDeps(
      { anthropic: { type: "oauth", access: "initial", expires: 1000 } },
      agent({ auth: { mode: "api_key" } })
    );
    const result = await resolveOAuthToken("agent-1", "anthropic", deps);
    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns forbidden when the provider is not one of the agent's providers", async () => {
    const deps = makeResolveDeps(
      { anthropic: { type: "oauth", access: "initial", expires: 1000 } },
      agent({ auth: { mode: "oauth" } })
    );
    const result = await resolveOAuthToken("agent-1", "openai", deps);
    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns not_found when there is no stored oauth credential", async () => {
    const deps = makeResolveDeps(
      { anthropic: { type: "api_key" } },
      agent({ auth: { mode: "oauth" } })
    );
    const result = await resolveOAuthToken("agent-1", "anthropic", deps);
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns a fresh token on success, requesting the 10-minute minimum validity", async () => {
    const deps = makeResolveDeps(
      { anthropic: { type: "oauth", access: "initial", expires: 5000 } },
      agent({ auth: { mode: "oauth" } }),
      { authPath: "/fake/renewal-success.json" }
    );
    const result = await resolveOAuthToken("agent-1", "anthropic", deps);
    expect(result).toEqual({
      status: "ok",
      accessToken: "anthropic-fresh-token",
      expiresAt: 5000,
    });
    expect(deps.getAuth).toHaveBeenCalledWith("anthropic", {
      minOAuthValidityMs: TEN_MINUTES_MS,
    });
  });

  it("takes both accessToken and expiresAt from the single post-refresh credential read, not from getAuth's return value", async () => {
    const credentials: Record<string, StoredCred> = {
      anthropic: { type: "oauth", access: "stale-token", expires: 1000 },
    };
    const getAuth = vi.fn(async () => {
      credentials.anthropic = {
        type: "oauth",
        access: "rotated-token",
        expires: 9999,
      };
      return { auth: { apiKey: "stale-token" } };
    });
    const deps: ResolveOAuthTokenDeps = {
      authPath: "/fake/renewal-atomic-pair.json",
      createRuntime: async () => ({ getAuth }),
      readCredential: async (provider) => credentials[provider],
      getAgent: () => agent({ auth: { mode: "oauth" } }),
    };

    const result = await resolveOAuthToken("agent-1", "anthropic", deps);

    expect(result).toEqual({
      status: "ok",
      accessToken: "rotated-token",
      expiresAt: 9999,
    });
  });

  it("propagates a refresh failure instead of masking it as not_found", async () => {
    const deps = makeResolveDeps(
      { anthropic: { type: "oauth", access: "initial", expires: 5000 } },
      agent({ auth: { mode: "oauth" } }),
      {
        authPath: "/fake/renewal-failure.json",
        getAuthImpl: async () => {
          throw new Error("IdP unreachable");
        },
      }
    );
    await expect(resolveOAuthToken("agent-1", "anthropic", deps)).rejects.toThrow(
      "IdP unreachable"
    );
  });

  it("coalesces concurrent renewals of the same provider into a single refresh", async () => {
    let releaseGetAuth: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGetAuth = resolve;
    });
    const credentials: Record<string, StoredCred> = {
      anthropic: { type: "oauth", access: "initial", expires: 5000 },
    };
    const deps = makeResolveDeps(
      credentials,
      agent({ auth: { mode: "oauth" } }),
      {
        authPath: "/fake/renewal-dedupe.json",
        getAuthImpl: async (provider) => {
          await gate;
          markRefreshed(credentials, provider, `${provider}-fresh-token`);
          return { auth: { apiKey: `${provider}-fresh-token` } };
        },
      }
    );

    // Fire both requests before either's getAuth call resolves, so the
    // second must observe the first's in-flight refresh instead of starting
    // its own.
    const firstPromise = resolveOAuthToken("agent-1", "anthropic", deps);
    const secondPromise = resolveOAuthToken("agent-1", "anthropic", deps);
    await Promise.resolve();
    await Promise.resolve();
    releaseGetAuth();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first).toEqual({
      status: "ok",
      accessToken: "anthropic-fresh-token",
      expiresAt: 5000,
    });
    expect(second).toEqual(first);
    expect(deps.getAuth).toHaveBeenCalledTimes(1);
  });
});
