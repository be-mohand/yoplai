import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it.each([
    ["Authorization: Bearer abcdef123", "abcdef123"],
    ["GITHUB_TOKEN=gh123 npm publish", "gh123"],
    ["--password hunter2", "hunter2"],
    ['{"client_secret": "shh"}', "shh"],
    ["git clone https://user:pass@github.com/x", "user:pass"],
    ["ghp_abcdefghij1234", "ghp_"],
    ["sk-ant-api03-abcdefgh", "sk-ant"],
    ["xoxb-1234-5678-abcd", "xoxb"],
    ["lin_api_abcdefghijkl", "lin_api_"],
    ["AKIAIOSFODNN7EXAMPLE", "AKIA"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig", "eyJ"],
  ])("masks %s", (input, secret) => {
    const out = redact(input);
    expect(out).not.toContain(secret);
    expect(out).toContain("•••");
  });

  it("keeps ordinary text", () => {
    for (const text of ["Reading src/labels.ts", "git log --author Alice", "ls -la | grep x"]) {
      expect(redact(text)).toBe(text);
    }
  });
});
