import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContainerInput } from "@yoplai/shared";
import { abortActiveAgent, runAgent, sendFollowUpMessage } from "../runner.js";

// Seams approved by Thinh in ALG-492 comment 24f27d0d-40e5-4a3b-a213-982f338db4a9.
// Real Pi sessions exercise delivery/cancellation; only the external model is scripted.
function barrier() {
  let arrive = () => {};
  let release = () => {};
  const entered = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    release,
    wait: async () => {
      arrive();
      await released;
    },
  };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Runner did not settle within 3 seconds")),
          3_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

let tempDir: string | undefined;
const startupHook = "__alg492RunnerBeforeStart";

afterEach(async () => {
  abortActiveAgent();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, startupHook);
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

async function fixture(
  setupBarrier?: ReturnType<typeof barrier>,
  startupBarrier?: ReturnType<typeof barrier>
) {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yoplai-runner-startup-"));
  const workspaceDir = path.join(tempDir, "workspace");
  await fs.mkdir(workspaceDir);
  if (startupBarrier) {
    Object.defineProperty(globalThis, startupHook, {
      configurable: true,
      value: startupBarrier.wait,
    });
    const extensionsDir = path.join(workspaceDir, ".pi", "extensions");
    await fs.mkdir(extensionsDir, { recursive: true });
    await fs.writeFile(
      path.join(extensionsDir, "startup.js"),
      `export default (pi) => { pi.on("before_agent_start", async () => { await globalThis.${startupHook}(); }); };`
    );
  }
  const faux = fauxProvider();
  const received: string[][] = [];
  const respond = (context: TranscriptContext) => {
    const users = context.messages
      .filter((message) => message.role === "user")
      .map((message) =>
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n")
      );
    received.push(users);
    return fauxAssistantMessage(users.join(" | "));
  };
  faux.setResponses([respond, respond, respond, respond]);
  const createRuntime = ModelRuntime.create.bind(ModelRuntime);
  vi.spyOn(ModelRuntime, "create").mockImplementation(async (options) => {
    const runtime = await createRuntime({
      ...options,
      modelsPath: null,
      refreshOnCreate: false,
    });
    runtime.registerNativeProvider(faux.provider);
    await setupBarrier?.wait();
    return runtime;
  });
  const input: ContainerInput = {
    agentId: "startup-agent",
    sessionId: "startup-session",
    message: "first",
    workspaceDir,
    sessionDir: path.join(tempDir, "sessions"),
    ipcDir: path.join(tempDir, "ipc"),
    gatewayUrl: "http://localhost:1",
    agentToken: "test-token",
    retry: { maxAttempts: 1, baseDelaySeconds: 0 },
    sdkConfig: { sdk: "pi", model: { provider: "faux", model: "faux-1" } },
  };
  return { input, received, faux };
}

describe("Container Pi startup", () => {
  it("delivers a follow-up received during session setup after the original exactly once", async () => {
    const setup = barrier();
    const { input, received } = await fixture(setup);
    const run = runAgent(input);
    try {
      await bounded(setup.entered);
      await bounded(sendFollowUpMessage("second"));
    } finally {
      setup.release();
    }
    await expect(bounded(run)).resolves.toMatchObject({
      text: "first | second",
    });
    expect(received.at(-1)).toEqual(["first", "second"]);
    await expect(
      bounded(
        runAgent({ ...input, sessionId: "later-session", message: "later" })
      )
    ).resolves.toMatchObject({ text: "later" });
  });

  it("delivers a follow-up received after publication before the original starts exactly once", async () => {
    const { input, received } = await fixture();
    let followUp: Promise<void> | undefined;
    const run = runAgent(input, (event) => {
      if (event.type === "system_prompt")
        followUp = sendFollowUpMessage("second");
    });
    await expect(bounded(run)).resolves.toMatchObject({
      text: "first | second",
    });
    if (!followUp) throw new Error("Follow-up was not sent");
    await bounded(followUp);
    expect(received.at(-1)).toEqual(["first", "second"]);
    await expect(
      bounded(
        runAgent({ ...input, sessionId: "later-session", message: "later" })
      )
    ).resolves.toMatchObject({ text: "later" });
  });

  it("delivers a follow-up received during Pi startup after the original exactly once", async () => {
    const startup = barrier();
    const { input, received } = await fixture(undefined, startup);
    const run = runAgent(input);
    try {
      await bounded(startup.entered);
      await bounded(sendFollowUpMessage("second"));
    } finally {
      startup.release();
    }
    await expect(bounded(run)).resolves.toMatchObject({
      text: "first | second",
    });
    expect(received.at(-1)).toEqual(["first", "second"]);
    await expect(
      bounded(
        runAgent({ ...input, sessionId: "later-session", message: "later" })
      )
    ).resolves.toMatchObject({ text: "later" });
  });

  it(
    "honors abort received during session setup and permits a later run",
    async () => {
      const setup = barrier();
      const { input, faux } = await fixture(setup);
      const callsBeforeRun = faux.state.callCount;
      const run = runAgent(input);
      try {
        await bounded(setup.entered);
        abortActiveAgent();
      } finally {
        setup.release();
      }
      const output = await bounded(run);
      const modelCalls = faux.state.callCount - callsBeforeRun;
      await expect(
        bounded(
          runAgent({ ...input, message: "later" })
        )
      ).resolves.toMatchObject({ text: "later", aborted: false });
      expect(output).toMatchObject({ text: "", aborted: true });
      expect(modelCalls).toBe(0);
    }
  );

  it(
    "honors abort after publication before the original starts and permits a later run",
    async () => {
      const { input, faux } = await fixture();
      await expect(
        bounded(runAgent({ ...input, message: "earlier" }))
      ).resolves.toMatchObject({ text: "earlier", aborted: false });
      const callsBeforeRun = faux.state.callCount;
      let published = false;
      const output = await bounded(
        runAgent(input, (event) => {
          if (event.type === "system_prompt") {
            published = true;
            abortActiveAgent();
          }
        })
      );
      const modelCalls = faux.state.callCount - callsBeforeRun;
      await expect(
        bounded(
          runAgent({ ...input, message: "later" })
        )
      ).resolves.toMatchObject({ text: "earlier | later", aborted: false });
      expect(published).toBe(true);
      expect(output).toMatchObject({ text: "", aborted: true });
      expect(modelCalls).toBe(0);
    }
  );

  it("honors abort during Pi startup and permits a later run", async () => {
    const startup = barrier();
    const { input } = await fixture(undefined, startup);
    const run = runAgent(input);
    try {
      await bounded(startup.entered);
      abortActiveAgent();
    } finally {
      startup.release();
    }
    const output = await bounded(run);
    await expect(
      bounded(
        runAgent({ ...input, sessionId: "later-session", message: "later" })
      )
    ).resolves.toMatchObject({ text: "later" });
    expect(output).toMatchObject({ text: "", aborted: true });
  });

  it("preserves provider errors resembling cancellation when no abort was requested", async () => {
    const { input, faux } = await fixture();
    faux.setResponses([
      fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: "This operation was aborted",
      }),
      fauxAssistantMessage("later"),
    ]);
    await expect(bounded(runAgent(input))).rejects.toThrow(
      "Agent error: This operation was aborted"
    );
    await expect(
      bounded(runAgent({ ...input, sessionId: "later-session", message: "later" }))
    ).resolves.toMatchObject({ text: "later" });
  });
});
