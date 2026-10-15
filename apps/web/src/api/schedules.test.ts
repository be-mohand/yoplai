import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchScheduleRuns } from "./schedules";

describe("fetchScheduleRuns", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the agent/job route, authenticates, and unwraps runs", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ runs: [{ id: "run-1" }] })));
    expect(await fetchScheduleRuns("agent/a", "job/b")).toEqual([{ id: "run-1" }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/schedules/agent%2Fa/job%2Fb/runs", {
      credentials: "include", signal: expect.any(AbortSignal),
    });
  });

  it("reports failed or inaccessible history", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    await expect(fetchScheduleRuns("scribe", "missing")).rejects.toThrow("Failed to load run history.");
  });

  it("aborts hung requests after 15 seconds and allows the next request", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const pending = expect(fetchScheduleRuns("scribe", "once-job")).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    const signal = fetchMock.mock.calls[0]![1]!.signal!;
    expect(signal.aborted).toBe(true);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ runs: [] })));
    expect(await fetchScheduleRuns("scribe", "once-job")).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
