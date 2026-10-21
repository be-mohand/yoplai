import fs from "node:fs";
import path from "node:path";
import type { ActiveWorkItem } from "@yoplai/shared";
import { CONFIG_DIR } from "../config/index.js";

export type ActiveTurnEntry = {
  kind: "turn" | "subagent" | "worker";
  agentId?: string;
  sessionId?: string;
  id?: string;
  label?: string;
  startedAt: string;
};

export type ActiveTurnsFile = {
  pid: number;
  updatedAt: string;
  turns: ActiveTurnEntry[];
};

export function activeTurnsPath(): string {
  return path.join(CONFIG_DIR, "run", "active-turns.json");
}

let sessionTurns: ActiveTurnEntry[] = [];
const extensionWork = new Map<string, ActiveWorkItem[]>();

function write(): void {
  const file = activeTurnsPath();
  const body: ActiveTurnsFile = {
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    turns: [
      ...sessionTurns,
      ...[...extensionWork.values()].flat(),
    ],
  };
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(body, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // The warning below covers it; a failed state write must not break a turn.
    }
    console.warn("[active-turns] failed to write state file:", err);
  }
}

/** Replace the streaming-session part of the state file. */
export function reportSessionTurns(turns: ActiveTurnEntry[]): void {
  sessionTurns = turns;
  write();
}

/** Replace the work one extension reports. */
export function reportExtensionWork(
  extensionId: string,
  items: ActiveWorkItem[]
): void {
  if (items.length === 0) extensionWork.delete(extensionId);
  else extensionWork.set(extensionId, items);
  write();
}

/** Called at gateway startup: nothing is running yet. */
export function resetActiveTurns(): void {
  sessionTurns = [];
  extensionWork.clear();
  write();
}
