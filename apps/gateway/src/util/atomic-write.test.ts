import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic, writeJsonAtomic } from "./atomic-write.js";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("atomic write", () => {
  it("creates parent dirs and writes JSON with trailing newline", async () => {
    const file = path.join(dir, "a", "b.json");
    await writeJsonAtomic(file, { x: 1 });
    expect(await fs.readFile(file, "utf8")).toBe('{\n  "x": 1\n}\n');
    expect(await fs.readdir(path.dirname(file))).toEqual(["b.json"]);
  });

  it("failed write leaves the destination directory and no .tmp", async () => {
    const file = path.join(dir, "f.txt");
    await fs.mkdir(file); // rename onto a directory fails
    await expect(writeFileAtomic(file, "new")).rejects.toThrow();
    expect((await fs.readdir(dir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect((await fs.stat(file)).isDirectory()).toBe(true);
  });

  it("failed rename keeps the previous file content", async () => {
    const file = path.join(dir, "keep.txt");
    await fs.writeFile(file, "old");
    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("rename failed"));
    await expect(writeFileAtomic(file, "new")).rejects.toThrow("rename failed");
    expect(await fs.readFile(file, "utf8")).toBe("old");
    expect(await fs.readdir(dir)).toEqual(["keep.txt"]);
  });
});
