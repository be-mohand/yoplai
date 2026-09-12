import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOAuthToken } from "../gateway-client.js";

describe("fetchOAuthToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /internal/oauth-token with identity headers and body", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        Response.json(
          { accessToken: "new-token", expiresAt: 1_700_000_000_000 },
          { status: 200 }
        )
      );

    const result = await fetchOAuthToken(
      {
        gatewayUrl: "http://gateway:3000",
        agentToken: "token-1",
        agentId: "agent-1",
        sessionId: "session-1",
        runId: "run-1",
      },
      "openai-codex"
    );

    expect(result).toEqual({
      accessToken: "new-token",
      expiresAt: 1_700_000_000_000,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "http://gateway:3000/internal/oauth-token",
      }),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "X-Agent-Id": "agent-1",
          "X-Agent-Token": "token-1",
        }),
        body: JSON.stringify({
          provider: "openai-codex",
          agentId: "agent-1",
          agentToken: "token-1",
          sessionId: "session-1",
          runId: "run-1",
        }),
      })
    );
  });

  it("throws with the server error field on a non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: "no stored oauth credential" }, { status: 404 })
    );

    await expect(
      fetchOAuthToken(
        {
          gatewayUrl: "http://gateway:3000",
          agentToken: "token-1",
          agentId: "agent-1",
        },
        "openai-codex"
      )
    ).rejects.toThrow(
      "Gateway oauth-token for openai-codex failed with 404: no stored oauth credential"
    );
  });

  it("throws a clean status-only error on a non-JSON error body instead of a JSON parse failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html>Internal Server Error</html>", {
        status: 500,
        headers: { "content-type": "text/html" },
      })
    );

    await expect(
      fetchOAuthToken(
        {
          gatewayUrl: "http://gateway:3000",
          agentToken: "token-1",
          agentId: "agent-1",
        },
        "openai-codex"
      )
    ).rejects.toThrow("Gateway oauth-token for openai-codex failed with 500");
  });
});
