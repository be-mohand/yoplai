import { describe, expect, it } from "vitest";
import { toolLabel } from "./labels.js";

describe("toolLabel", () => {
  it("maps fixed names", () => {
    expect(toolLabel("read")).toBe("Reading files");
    expect(toolLabel("Edit")).toBe("Editing files");
    expect(toolLabel("write")).toBe("Editing files");
    expect(toolLabel("bash")).toBe("Running commands");
    expect(toolLabel("web_search")).toBe("Searching the web");
    expect(toolLabel("fetch")).toBe("Searching the web");
    expect(toolLabel("scheduler.create-job")).toBe("Managing scheduled jobs");
    expect(toolLabel("slack.send_message")).toBe("Using send message");
    expect(toolLabel("task.checkpoint")).toBeUndefined();
  });

  it("keeps odd names plain", () => {
    expect(toolLabel("/etc/passwd")).toBe("Using etc passwd");
    expect(toolLabel("!!!")).toBe("Using a tool");
    expect(toolLabel("constructor")).toBe("Using constructor");
  });
});

import { detailedToolLabel, progressLabel, shortPath, trimText } from "./labels.js";

describe("detailedToolLabel", () => {
  it("adds file paths, shortened", () => {
    expect(detailedToolLabel("read", { path: "memory.md" })).toBe("Reading memory.md");
    expect(detailedToolLabel("edit", { path: "src/labels.ts" })).toBe("Editing src/labels.ts");
    expect(detailedToolLabel("write", { file_path: "/a/b/c/d/e.ts" })).toBe("Writing …/c/d/e.ts");
    expect(detailedToolLabel("read", {})).toBe("Reading files");
    expect(shortPath("a/b/c")).toBe("a/b/c");
  });

  it("shows the first bash line, trimmed and redacted", () => {
    expect(detailedToolLabel("bash", { command: "\ngit status\nrm -rf /" })).toBe("Running: git status");
    const long = detailedToolLabel("bash", { command: "echo " + "x".repeat(200) })!;
    expect(Array.from(long)).toHaveLength(80);
    expect(long.endsWith("…")).toBe(true);
    expect(detailedToolLabel("bash", { command: "curl -H 'Authorization: Bearer abc123' x" })).not.toContain("abc123");
    expect(detailedToolLabel("bash", { command: "API_KEY=hunter2 run" })).toBe("Running: API_KEY=••• run");
  });

  it("adds one identifying argument for other tools", () => {
    expect(detailedToolLabel("linear.get_issue", { id: "ALG-1", body: "x" })).toBe("Using get issue: ALG-1");
    expect(detailedToolLabel("web_fetch", { url: "https://u:p@ex.com/a/b?token=1" })).toBe("Searching the web: ex.com/a/b");
    expect(detailedToolLabel("web_search", { query: "pnpm vitest" })).toBe("Searching the web: pnpm vitest");
    expect(detailedToolLabel("scheduler.run", { jobId: 42 })).toBe("Managing scheduled jobs: 42");
    expect(detailedToolLabel("slack.send", { text: "hi" })).toBe("Using send");
    expect(detailedToolLabel("slack.send", "nope")).toBe("Using send");
    expect(detailedToolLabel("task.checkpoint", { id: "x" })).toBeUndefined();
    expect(detailedToolLabel("task_update", {})).toBeUndefined();
  });
});

describe("progressLabel", () => {
  it("redacts, trims and drops empty labels", () => {
    expect(progressLabel("   ")).toBeUndefined();
    expect(progressLabel("Deployed with password=abc")).toBe("Deployed with password=•••");
    expect(Array.from(progressLabel("y".repeat(500))!)).toHaveLength(200);
    expect(trimText("a  b\n c", 10)).toBe("a b c");
  });
});
