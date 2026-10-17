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
