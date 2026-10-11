import { describe, expect, it } from "vitest";
import { serializeByKey } from "./serialize.js";

describe("serializeByKey", () => {
  it("runs same-key ops in order, even after a failure, and cleans up", async () => {
    const chains = new Map<string, Promise<void>>();
    const log: string[] = [];
    const slow = serializeByKey(chains, "k", async () => {
      await new Promise((r) => setTimeout(r, 20));
      log.push("a");
      throw new Error("boom");
    });
    const next = serializeByKey(chains, "k", async () => {
      log.push("b");
      return 2;
    });
    const other = serializeByKey(chains, "other", async () => {
      log.push("c");
    });
    await expect(slow).rejects.toThrow("boom");
    expect(await next).toBe(2);
    await other;
    expect(log).toEqual(["c", "a", "b"]);
    expect(chains.size).toBe(0);
  });
});
