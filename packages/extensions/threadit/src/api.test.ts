import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_CHARS, ThreaditApi, splitAnswer } from "./api.js";

function api(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => respond(url, init));
  return { client: new ThreaditApi("http://b:8000/", "tok-123", fetchFn), fetchFn };
}

describe("ThreaditApi", () => {
  it("sends a bearer token and strips the trailing slash", async () => {
    const { client, fetchFn } = api(() =>
      Response.json({ id: 5, username: "bot", account_type: "agent" })
    );
    const result = await client.me();
    expect(result).toEqual({
      ok: true,
      data: { id: 5, username: "bot", account_type: "agent" },
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("http://b:8000/api/me");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("detects a closed thread", async () => {
    const { client } = api(() =>
      Response.json({ error: { code: "thread_closed" } }, { status: 409 })
    );
    expect(await client.activity(1, "thought", "x", false)).toEqual({
      ok: false,
      kind: "closed",
    });
  });

  it("keeps only allowlisted server codes", async () => {
    const leaky = api(() =>
      Response.json({ error: { code: "leak /secret tok-123" } }, { status: 400 })
    );
    expect(await leaky.client.me()).toEqual({
      ok: false,
      kind: "http",
      status: 400,
      code: "other",
    });
    const known = api(() => Response.json({ error: { code: "not_found" } }, { status: 404 }));
    expect(await known.client.me()).toMatchObject({ status: 404, code: "not_found" });
  });

  it("maps fetch errors to network failures", async () => {
    const { client } = api(() => {
      throw new Error("boom tok-123");
    });
    expect(await client.me()).toEqual({ ok: false, kind: "network" });
  });
});

describe("splitAnswer", () => {
  it("respects the limit", () => {
    const text = "a".repeat(45_000);
    const parts = splitAnswer(text, MAX_BODY_CHARS);
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.length <= MAX_BODY_CHARS)).toBe(true);
    expect(parts.join("")).toBe(text);
    expect(splitAnswer("short", 10)).toEqual(["short"]);
  });

  it("prefers line breaks", () => {
    expect(splitAnswer("aaaaaa\nbbbbbb", 8)).toEqual(["aaaaaa", "bbbbbb"]);
  });
});
