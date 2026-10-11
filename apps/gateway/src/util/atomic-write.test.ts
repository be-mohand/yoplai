import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic, writeJsonAtomic } from "./atomic-write.js";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-"));
});
afterEach(() => fs.rm(dir, { recursive: true, force: true }));

describe("atomic write", () => {
  it("creates parent dirs and writes JSON with trailing newline", async () => {
    const file = path.join(dir, "a", "b.json");
    await writeJsonAtomic(file, { x: 1 });
    expect(await fs.readFile(file, "utf8")).toBe('{\n  "x": 1\n}\n');
    expect(await fs.readdir(path.dirname(file))).toEqual(["b.json"]);
  });

  it("failed write keeps the previous file and leaves no .tmp", async () => {
    const file = path.join(dir, "f.txt");
    await fs.writeFile(file, "old");
    await fs.rm(file);
    await fs.mkdir(file); // rename onto a directory fails
    await expect(writeFileAtomic(file, "new")).rejects.toThrow();
    expect((await fs.readdir(dir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect((await fs.stat(file)).isDirectory()).toBe(true);
  });
});
