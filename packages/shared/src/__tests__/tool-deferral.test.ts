import { describe, expect, it } from "vitest";
import { createToolDeferralCatalog } from "../tool-deferral.js";

const catalog = createToolDeferralCatalog([], undefined, { codemode: true });
const rejected = (name: string) => ({
  id: name,
  name,
  status: "error",
  error: `Validation failed for tool "${name}":\n  - id: required`,
});
const codemodeResult = (calls: unknown) => ({
  role: "toolResult",
  toolName: "codemode",
  content: [{ type: "text", text: "script output" }],
  details: { calls },
});
const signatureOf = (name: string) =>
  name === "unknown_tool" ? undefined : `${name}(args: { id: number }): Promise<unknown>;`;

describe("hintCodemodeSignatures", () => {
  it("returns undefined for a result that is not from codemode", () => {
    const message = { ...codemodeResult([rejected("a")]), toolName: "other" };
    expect(catalog.hintCodemodeSignatures(message, signatureOf)).toBeUndefined();
  });

  it("returns undefined when no call failed validation", () => {
    const calls = [
      { name: "a", status: "ok" },
      { name: "b", status: "error", error: "Fixture unavailable" },
    ];
    expect(catalog.hintCodemodeSignatures(codemodeResult(calls), signatureOf)).toBeUndefined();
  });

  it("returns undefined when no signature is known", () => {
    const message = codemodeResult([rejected("unknown_tool")]);
    expect(catalog.hintCodemodeSignatures(message, signatureOf)).toBeUndefined();
  });

  it("appends one block with each signature once and keeps the input unchanged", () => {
    const message = codemodeResult([rejected("tool_a"), rejected("tool_b"), rejected("tool_a")]);
    const hinted = catalog.hintCodemodeSignatures(message, signatureOf);
    expect(hinted?.content).toHaveLength(2);
    const text = (hinted?.content as { text: string }[])[1].text;
    expect(text.match(/tool_a\(/g)).toHaveLength(1);
    expect(text.match(/tool_b\(/g)).toHaveLength(1);
    expect(message.content).toHaveLength(1);
  });
});

describe("MCP namespace instructions", () => {
  const mcpTool = (namespace: Record<string, string>) => ({
    name: "mcp__recordings__get_transcript",
    extensionId: "mcp",
    namespace: { name: "recordings", ...namespace },
  });
  const build = (namespace: Record<string, string>) =>
    createToolDeferralCatalog([mcpTool(namespace)], undefined, {
      codemode: false,
    });

  it("passes trimmed instructions through to the deferred namespace", () => {
    const { tools } = build({ instructions: "  Call search first.\nThen read.  " });
    expect(tools.get("mcp__recordings__get_transcript")).toMatchObject({
      namespace: { instructions: "Call search first.\nThen read." },
    });
  });

  it("omits blank instructions", () => {
    const { tools } = build({ instructions: "  \n " });
    expect(tools.get("mcp__recordings__get_transcript")?.namespace).not.toHaveProperty("instructions");
  });

  it("uses the first instructions line, capped at 200 characters, when the description is missing", () => {
    const first = "x".repeat(300);
    const { summary } = build({ instructions: `\n${first}\nSecond line` });
    expect(summary.split("\n")[0]).toBe(
      `${`recordings: ${first}`.slice(0, 200)} (1 tool: get_transcript)`
    );
  });

  it("prefers the description over instructions in the summary", () => {
    const { summary } = build({
      description: "Search meetings",
      instructions: "Call search first.",
    });
    expect(summary.split("\n")[0]).toBe(
      "recordings: Search meetings (1 tool: get_transcript)"
    );
  });
});

describe("direct MCP tools", () => {
  it("preserves namespace instructions for alwaysOnTools", () => {
    const { tools } = createToolDeferralCatalog(
      [
        {
          name: "mcp__recordings__get_transcript",
          extensionId: "mcp",
          namespace: { name: "recordings", instructions: "Use this for transcripts." },
        },
      ],
      { alwaysOnTools: ["mcp__recordings__get_transcript"], alwaysOnExtensions: [] },
      { codemode: false }
    );
    const entry = tools.get("mcp__recordings__get_transcript");
    expect(entry?.exposure).toBe("direct");
    expect(entry?.namespace?.instructions).toBe("Use this for transcripts.");
  });
});
