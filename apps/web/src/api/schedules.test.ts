import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSchedules, fetchScheduleRuns, fetchScheduleRunTrace } from "./schedules";

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

  it("loads the authenticated schedules list with encoded agent ID", async () => {
    const jobs = [{ id: "job", state: { runningForMs: 0 } }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(jobs)));
    expect(await fetchSchedules("agent/a")).toEqual(jobs);
    expect(fetchMock).toHaveBeenCalledWith("/api/schedules?agent=agent%2Fa", {
      credentials: "include", signal: expect.any(AbortSignal),
    });
  });

  it("times out a hung schedules poll and permits the next request", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const pending = expect(fetchSchedules("scribe")).rejects.toThrow("Loading scheduled jobs timed out. Try again.");
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    fetchMock.mockResolvedValue(new Response("[]"));
    expect(await fetchSchedules("scribe")).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
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

  it("loads an authenticated trace using encoded identifiers", async () => {
    const trace = { run: { id: "run/c" }, messages: [] };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(trace)));
    expect(await fetchScheduleRunTrace("agent/a", "job/b", "run/c")).toEqual(trace);
    expect(fetchMock).toHaveBeenCalledWith("/api/schedules/agent%2Fa/job%2Fb/runs/run%2Fc/trace", {
      credentials: "include", signal: expect.any(AbortSignal),
    });
  });

  it("reports inaccessible traces", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(fetchScheduleRunTrace("scribe", "job", "missing")).rejects.toThrow("Failed to load run trace.");
  });

  it("times out a hung trace and permits retry", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const pending = expect(fetchScheduleRunTrace("scribe", "job", "run")).rejects.toThrow("Loading run trace timed out. Try again.");
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ run: { id: "run" }, messages: [] })));
    await expect(fetchScheduleRunTrace("scribe", "job", "run")).resolves.toHaveProperty("messages", []);
    expect(vi.getTimerCount()).toBe(0);
  });
});
