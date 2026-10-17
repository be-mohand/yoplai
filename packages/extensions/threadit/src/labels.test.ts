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
    expect(detailedToolLabel("bash", { command: "API_KEY=hunter2 run" })).toBe("Running: run");
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

describe("credential forms never reach a label", () => {
  // [command, bash label, checkpoint label]
  const rows: Array<[string, string, string]> = [
    ["curl -u alice:hunter2 https://example.com", "Running: curl …", "curl -u ••• https://example.com"],
    ["SSHPASS=hunter2 sshpass -e ssh host", "Running: sshpass …", "SSHPASS=••• sshpass -e ••• host"],
    ["MYSQL_PWD=hunter2 mysql -u root", "Running: mysql …", "MYSQL_PWD=••• mysql -u •••"],
    ["PASSWORD=hello\\ world cmd", "Running commands", "PASSWORD=••• cmd"],
    ["PASSWORD='hello''world' cmd", "Running commands", "PASSWORD=••• cmd"],
    [
      'curl -H "Cookie: theme=dark; session=abc123; sid=xyz789" x',
      "Running: curl …",
      'curl -H "Cookie: •••" x',
    ],
    [
      'curl -d "{\\"password\\":\\"hunter2\\"}" x',
      "Running: curl …",
      'curl -d "{\\"password\\":\\"•••\\"}" x',
    ],
    [
      `curl -d '{"password":123456,"token":987654}' x`,
      "Running: curl …",
      `curl -d '{"password":•••,"token":•••}' x`,
    ],
    ['curl "https://example.com?sig=abc123"', "Running: curl …", 'curl "https://example.com?•••"'],
    ['curl -H "Authorization: Bearer abc123" x', "Running: curl …", 'curl -H "Authorization: •••" x'],
    ["git push https://ghp_abcdefghijklmno@github.com", "Running: git push …", "git push https://•••@github.com"],
  ];
  const secrets = ["hunter2", "abc123", "xyz789", "123456", "987654", "world", "ghp_", "alice"];

  it.each(rows)("%s", (command, bash, progress) => {
    const shown = detailedToolLabel("bash", { command })!;
    const thought = progressLabel(command)!;
    expect(shown).toBe(bash);
    expect(thought).toBe(progress);
    expect(progressLabel(thought)).toBe(thought); // idempotent
    for (const secret of secrets) {
      expect(shown).not.toContain(secret);
      expect(thought).not.toContain(secret);
    }
  });

  it("keeps harmless commands readable", () => {
    expect(detailedToolLabel("bash", { command: "git log --author Alice" })).toBe("Running: git log …");
    expect(progressLabel("git log --author Alice")).toBe("git log --author Alice");
    expect(progressLabel("monkey=banana keyboard x")).toBe("monkey=banana keyboard x");
    expect(detailedToolLabel("bash", { command: "ls -la src | grep x" })).toBe(
      "Running: ls …"
    );
    expect(detailedToolLabel("bash", { command: "FOO=bar pnpm test" })).toBe("Running: pnpm test");
  });

  it("skips plain cd prefixes", () => {
    const label = (command: string) => detailedToolLabel("bash", { command });
    expect(label("cd ~/pom && rg -n THREADIT .env")).toBe("Running: rg …");
    expect(label("cd /a; cd b && git log -5")).toBe("Running: git log …");
    expect(label("cd src ; tail -n 20 x.log | grep err")).toBe("Running: tail …");
    expect(label("cd app && curl -u bob:pw host")).toBe("Running: curl …");
    expect(label("cd ~/pom")).toBe("Running: cd ~/pom");
  });

  it("shows only the program and leading plain words", () => {
    const label = (command: string) => detailedToolLabel("bash", { command });
    const rows: Array<[string, string]> = [
      ["curl -sd hunter2 x", "Running: curl …"],
      ["cd /tmp && curl -sd hunter2 x", "Running: curl …"],
      ["mysql -pab db", "Running: mysql …"],
      ["cd /tmp && mysql -pab db", "Running: mysql …"],
      ["mysql -phunter2 db", "Running: mysql …"],
      ["curl -ualice:hunter2 x", "Running: curl …"],
      ['curl -H"X-Custom: hunter2" x', "Running: curl …"],
      ["curl -dopaquevalue x", "Running: curl …"],
      ["yoplai subagents status sar_x --json", "Running: yoplai subagents status sar_x …"],
      ["a b c d e f g h", "Running: a b c d e f …"],
      ["git status", "Running: git status"],
      ['cd "a; hunter2 other" && git status', "Running: cd …"],
      ["cd 'my dir' && git status", "Running: cd …"],
      ["cd a\\;b && git status", "Running: cd …"],
      ['cd x "&&" hunter2', "Running: cd x …"],
    ];
    for (const [command, expected] of rows) {
      const shown = label(command)!;
      expect(shown).toBe(expected);
      for (const secret of ["hunter2", "ab db", "opaque", "alice"]) {
        expect(shown).not.toContain(secret);
      }
    }
  });
});
