import { looksLikeToken, redact, sensitiveName } from "./redact.js";

/**
 * Progress labels. Safe mode uses tool names only. Detailed mode adds a
 * redacted target. Tool outputs never reach the board.
 */

const EXACT_LABELS = new Map<string, string>([
  ["read", "Reading files"],
  ["write", "Editing files"],
  ["edit", "Editing files"],
  ["bash", "Running commands"],
  ["extract_document", "Reading documents"],
  ["describe_image", "Looking at an image"],
]);

const PREFIX_LABELS: Array<[string, string]> = [
  ["web_search", "Searching the web"],
  ["websearch", "Searching the web"],
  ["web_fetch", "Searching the web"],
  ["fetch", "Searching the web"],
  ["scheduler_", "Managing scheduled jobs"],
];

/** Map a tool name to a short label. `undefined` for task bookkeeping tools. */
export function toolLabel(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.startsWith("task.") || lower.startsWith("task_")) return undefined;
  const normalized = lower.replace(/[.-]/g, "_");
  const exact = EXACT_LABELS.get(normalized);
  if (exact !== undefined) return exact;
  for (const [prefix, label] of PREFIX_LABELS) {
    if (normalized.startsWith(prefix)) return label;
  }
  return humanize(name);
}

function humanize(name: string): string {
  const dot = name.indexOf(".");
  const rest = dot >= 0 ? name.slice(dot + 1) : name;
  const words = rest
    .replace(/[^A-Za-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const limited = Array.from(words).slice(0, 40).join("");
  return limited === "" ? "Using a tool" : `Using ${limited}`;
}

// ---- detailed mode ----

/** Trim to `max` characters with an ellipsis, without splitting surrogate pairs. */
export function trimText(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/** Checkpoint label for the board, or `undefined` when empty. */
export function progressLabel(label: string): string | undefined {
  const text = trimText(redact(label), 200);
  return text === "" ? undefined : text;
}

const FILE_VERBS = new Map([
  ["read", "Reading"],
  ["write", "Writing"],
  ["edit", "Editing"],
]);
const PATH_KEYS = ["path", "file_path", "filePath", "file"];
const ID_KEYS = [
  "id",
  "issue",
  "issueId",
  "query",
  "q",
  "title",
  "path",
  "url",
  "name",
  "thread_id",
  "threadId",
  "jobId",
  "job_id",
];

function stringArg(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export function shortPath(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : p;
}

function shortUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return raw;
  }
}

/** Label with a redacted target. `undefined` for task bookkeeping tools. */
export function detailedToolLabel(name: string, rawArgs: unknown): string | undefined {
  const label = toolLabel(name);
  if (label === undefined) return undefined;
  const args =
    rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
  const lower = name.toLowerCase();
  const verb = FILE_VERBS.get(lower);
  if (verb) {
    const p = stringArg(args, PATH_KEYS);
    return p ? trimText(`${verb} ${redact(shortPath(p))}`, 120) : label;
  }
  if (lower === "bash") {
    const command = typeof args.command === "string" ? args.command : "";
    const shown = bashLabel(command);
    return shown ? trimText(`Running: ${redact(shown)}`, 80) : label;
  }
  const key = ID_KEYS.find((k) => stringArg(args, [k]) !== undefined);
  if (!key) return label;
  let value = stringArg(args, [key]) ?? "";
  if (key === "url") value = shortUrl(value);
  else if (key === "path") value = shortPath(value);
  return `${label}: ${trimText(redact(value), 60)}`;
}

const SENSITIVE_FLAG =
  /^(?:-[uHdpbeEP]|--(?:user|header|data[\w-]*|pass|password|passwd|token|key|api-key|apikey|auth|auth-[\w-]+|authorization|cookie[\w-]*|env|proxy-user|oauth2-bearer|form|form-string|secret[\w-]*))$/;
const PLAIN = /^[A-Za-z0-9_.\/,+%~-]+$/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * The visible part of a shell command: the first non-empty line, without
 * leading env assignments, cut at the first word that may carry a secret.
 * Empty when nothing is safe to show.
 */
export function bashLabel(command: string): string {
  const line = command.split("\n").find((l) => l.trim() !== "") ?? "";
  const words = line.trim().split(/\s+/);
  let i = 0;
  for (; i < words.length && ASSIGNMENT.test(words[i]!); i++) {
    // A quoted or escaped value may span words. Show nothing then.
    if (/["'`\\$]/.test(words[i]!)) return "";
  }
  const shown: string[] = [];
  let cut = false;
  for (; i < words.length; i++) {
    const word = words[i]!;
    const flag = word.startsWith("-");
    const harmless =
      PLAIN.test(word) &&
      !looksLikeToken(word) &&
      !(flag && !/^(?:-[A-Za-z]{1,3}|--[A-Za-z][A-Za-z0-9-]*)$/.test(word)) &&
      !(flag && word.startsWith("--") && sensitiveName(word.slice(2)));
    if (!harmless) {
      cut = true;
      break;
    }
    shown.push(word);
    if (SENSITIVE_FLAG.test(word)) {
      cut = i + 1 < words.length;
      break;
    }
  }
  if (shown.length === 0) return "";
  return cut ? `${shown.join(" ")} …` : shown.join(" ");
}
