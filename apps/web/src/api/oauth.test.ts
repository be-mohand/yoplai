import { afterEach, describe, expect, it, vi } from "vitest";
import { disconnectOAuth, fetchOAuthStatus, oauthAuthorizeUrl } from "./oauth";
import { fetchOAuthScopeState } from "./extensions";

afterEach(() => vi.unstubAllGlobals());

describe("host OAuth api", () => {
  it("loads full status for a scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true, provider: "google", account: "a@b.c", scopes: ["x"] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const status = await fetchOAuthStatus("my agent", "google", "team");
    expect(fetchMock).toHaveBeenCalledWith("/api/oauth/google/status?agent=my%20agent&scope=team", { credentials: "include" });
    expect(status.account).toBe("a@b.c");
  });

  it("reads a failed status as disconnected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchOAuthStatus("a", "google", "personal")).toEqual({ connected: false, provider: "google" });
    expect(await fetchOAuthScopeState("a", "google", "personal")).toBe("disconnected");
  });

  it("derives scope state from state or connected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: true, provider: "g" }) }));
    expect(await fetchOAuthScopeState("a", "g", "team")).toBe("connected");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: "needs_reconnect", connected: false, provider: "g" }) }));
    expect(await fetchOAuthScopeState("a", "g", "team")).toBe("needs_reconnect");
  });

  it("posts disconnect without checking status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    await expect(disconnectOAuth("a", "google", "personal")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/oauth/google/disconnect?agent=a&scope=personal", { method: "POST", credentials: "include" });
  });

  it("builds authorize urls, omitting empty scopes", () => {
    expect(oauthAuthorizeUrl("a", "google", "personal", ["s1", "s2"])).toBe(
      "/api/oauth/google/authorize?agent=a&scopes=s1%2Cs2&scope=personal"
    );
    expect(oauthAuthorizeUrl("a", "google", "team", [])).toBe("/api/oauth/google/authorize?agent=a&scope=team");
  });
});
