import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getUserSessionsPath } from "@yoplai/extension-multi-user/isolation";

export type ChatProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export function isSafeChatProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

export class ChatProjectStore {
  private readonly root: string;

  constructor(dataDir: string, userId?: string) {
    if (userId !== undefined && !isSafeChatProjectId(userId)) {
      throw new Error("Invalid user id");
    }
    this.root = path.join(path.dirname(getUserSessionsPath(userId, dataDir)), "chat-projects");
  }

  private file(id: string): string {
    if (!isSafeChatProjectId(id)) throw new Error("Invalid project id");
    return path.join(this.root, id, "project.json");
  }

  async list(): Promise<ChatProject[]> {
    let ids: string[];
    try {
      ids = await fs.readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const projects = await Promise.all(ids.filter(isSafeChatProjectId).map((id) => this.get(id)));
    return projects.filter((project): project is ChatProject => project !== null)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<ChatProject | null> {
    const file = this.file(id);
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as ChatProject;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async write(project: ChatProject): Promise<void> {
    const file = this.file(project.id);
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(project, null, 2), "utf8");
    await fs.rename(tmp, file);
  }

  async create(name: string): Promise<ChatProject> {
    name = this.validateName(name);
    const now = Date.now();
    const project = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(path.dirname(this.file(project.id)));
    await this.write(project);
    return project;
  }

  async update(id: string, name: string): Promise<ChatProject | null> {
    name = this.validateName(name);
    const project = await this.get(id);
    if (!project) return null;
    const updated = { ...project, name, updatedAt: Date.now() };
    await this.write(updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (!await this.get(id)) return false;
    await fs.rm(path.dirname(this.file(id)), { recursive: true });
    return true;
  }

  private validateName(name: string): string {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 200) {
      throw new Error("Project name must be between 1 and 200 characters");
    }
    return name.trim();
  }
}
