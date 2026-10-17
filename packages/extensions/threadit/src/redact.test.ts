import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it.each([
    ["Authorization: Bearer abcdef123", "abcdef123"],
    ["curl -H 'authorization: token xyz789'", "xyz789"],
    ["bearer sometokenvalue", "sometokenvalue"],
    ["GITHUB_TOKEN=gh123 npm publish", "gh123"],
    ["export DB_PASSWORD='p a s s'", "p a s s"],
    ["--api-key s3cr3t", "s3cr3t"],
    ["--token=abc", "abc"],
    ["--password hunter2", "hunter2"],
    ['{"client_secret": "shh"}', "shh"],
    ['{"apiKey":"k1"}', "k1"],
    ["Cookie: session=abc", "session=abc"],
    ["auth=zzz", "zzz"],
    ["credentials: c1", "c1"],
    ["git clone https://user:pass@github.com/x", "user:pass"],
    ["ghs_abcdefghij1234", "ghs_abcdefghij1234"],
    ["ghp_abcdefghij1234", "ghp_"],
    ["gho_abcdefghij1234", "gho_"],
    ["github_pat_11ABCDEFG_xyz", "github_pat_"],
    ["sk-proj-abcdefghijk", "sk-proj"],
    ["sk-ant-api03-abcdefgh", "sk-ant"],
    ["xoxb-1234-5678-abcd", "xoxb"],
    ["xoxp-1234-5678-abcd", "xoxp"],
    ["lin_api_abcdefghijkl", "lin_api_"],
    ["AKIAIOSFODNN7EXAMPLE", "AKIA"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig", "eyJ"],
    ["see 0123456789abcdef0123456789abcdef01 here", "0123456789abcdef"],
    ["blob QWxhZGRpbjpvcGVuIHNlc2FtZQ0aGVsbG8gd29ybGQ=", "QWxhZGRpbj"],
  ])("masks %s", (input, secret) => {
    const out = redact(input);
    expect(out).not.toContain(secret);
    expect(out).toContain("•••");
  });

  it("keeps ordinary text", () => {
    for (const text of [
      "Reading src/labels.ts",
      "git status",
      "Checked the deploy of v1.2.3",
      "pnpm exec vitest run packages/extensions/threadit/src/labels.test.ts",
    ]) {
      expect(redact(text)).toBe(text);
    }
  });
});
