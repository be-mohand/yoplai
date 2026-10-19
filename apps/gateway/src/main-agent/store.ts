import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getUserSessionsPath } from "@yoplai/extension-multi-user/isolation";
import type { MainAgentPreference } from "@yoplai/shared/main-agent";

export class MainAgentPreferenceStore {
  private readonly file: string;

  constructor(dataDir: string, userId?: string) {
    if (userId !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(userId)) throw new Error("Invalid user id");
    this.file = path.join(path.dirname(getUserSessionsPath(userId, dataDir)), "main-agent.json");
  }

  async get(): Promise<MainAgentPreference | null> {
    try { return JSON.parse(await fs.readFile(this.file, "utf8")) as MainAgentPreference; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async clear(): Promise<void> {
    await fs.rm(this.file, { force: true });
  }

  async set(value: Omit<MainAgentPreference, "updatedAt">): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ ...value, updatedAt: new Date().toISOString() }, null, 2), "utf8");
    await fs.rename(temporary, this.file);
  }
}
