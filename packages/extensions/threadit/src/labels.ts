/** Safe progress labels from tool names. Arguments and outputs never reach the board. */

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
