import path from "node:path";
import { describe, expect, it } from "vitest";
import { isInsideRoot } from "./paths.js";

describe("isInsideRoot", () => {
  const root = path.resolve("/tmp/root");
  it("accepts root itself and descendants", () => {
    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(root, path.join(root, "a", "b"))).toBe(true);
  });
  it("accepts siblings that merely start with dots", () => {
    expect(isInsideRoot(root, path.join(root, "..cache"))).toBe(true);
  });
  it("rejects parent, traversal and outside paths", () => {
    expect(isInsideRoot(root, path.dirname(root))).toBe(false);
    expect(isInsideRoot(root, path.join(root, "..", "x"))).toBe(false);
    expect(isInsideRoot(root, path.resolve("/etc/passwd"))).toBe(false);
  });
});
