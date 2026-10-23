import { describe, expect, it } from "vitest";
import { isReflectEnabled, selfImprovementPrompt } from "./self-improvement.js";

describe("selfImprovementPrompt", () => {
  it("returns a prompt that names memory.md and skill_save when reflect is on", () => {
    for (const reflect of [true, { enabled: true }] as const) {
      const prompt = selfImprovementPrompt({ reflect });
      expect(prompt).toContain("memory.md");
      expect(prompt).toContain("skill_save");
    }
  });

  it("returns undefined when reflect is absent or disabled", () => {
    expect(selfImprovementPrompt({})).toBeUndefined();
    expect(selfImprovementPrompt({ reflect: { enabled: false } })).toBeUndefined();
    expect(isReflectEnabled({ reflect: { enabled: false } })).toBe(false);
  });
});
