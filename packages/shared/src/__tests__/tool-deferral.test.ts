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
