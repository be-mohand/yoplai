import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteChatProjectReference, fetchChatProjectNotes, fetchChatProjectReferences, updateChatProjectNotes } from "./chat-projects";

afterEach(() => vi.unstubAllGlobals());

describe("chat project memory API", () => {
  it("uses scoped reference and notes routes with bounded authenticated requests", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "Shared notes", items: [] }) });
    vi.stubGlobal("fetch", fetch);
    await fetchChatProjectReferences("project /1");
    await deleteChatProjectReference("project /1", "reference /1");
    await fetchChatProjectNotes("project /1");
    await updateChatProjectNotes("project /1", "Edited notes");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/chat-projects/project%20%2F1/references",
      "/api/chat-projects/project%20%2F1/references/reference%20%2F1",
      "/api/chat-projects/project%20%2F1/notes",
      "/api/chat-projects/project%20%2F1/notes",
    ]);
    expect(fetch.mock.calls[1][1].method).toBe("DELETE");
    expect(fetch.mock.calls[3][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ text: "Edited notes" }), credentials: "include" });
    for (const [, init] of fetch.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports failed memory requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchChatProjectNotes("project-1")).rejects.toThrow("Try again");
  });
});
