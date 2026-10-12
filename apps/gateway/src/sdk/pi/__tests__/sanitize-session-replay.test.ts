import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  InMemoryCredentialStore,
  normalizeContext,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import { convertResponsesMessages } from "@earendil-works/pi-ai/api/openai-responses-shared";
import {
  convertToLlm,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { createRuntimeSessionFile } from "@yoplai/shared/node/sanitize-session";

describe("sanitize-session replay", () => {
  it("persists and reloads assistant text signatures for the next Responses turn", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yoplai-replay-"));
    try {
      const runtime = await ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
        allowModelNetwork: false,
      });
      const model = runtime.getModels("openai-codex")[0]!;
      expect(model).toBeDefined();
      const signatures = [
        JSON.stringify({ v: 1, id: "msg_commentary_1", phase: "commentary" }),
        JSON.stringify({ v: 1, id: "msg_final_1", phase: "final_answer" }),
        "msg_legacy_1",
      ];
      const assistant: AssistantMessage = {
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: signatures.map((textSignature) => ({
          type: "text",
          text: "First response",
          textSignature,
        })),
        stopReason: "stop",
        timestamp: 2,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const session = SessionManager.create(dir, path.join(dir, "runtime"));
      session.appendMessage({
        role: "user",
        content: "First turn",
        timestamp: 1,
      });
      session.appendMessage(assistant);
      const originalFile = session.getSessionFile()!;
      const persistentFile = path.join(dir, "durable", "session.jsonl");
      const firstTurn = await createRuntimeSessionFile(persistentFile);
      await fs.copyFile(originalFile, firstTurn.file);
      await firstTurn.persist();

      const secondTurn = await createRuntimeSessionFile(persistentFile);
      try {
        const reloaded = SessionManager.open(secondTurn.file);
        reloaded.appendMessage({
          role: "user",
          content: "Second turn",
          timestamp: 3,
        });
        const messages = reloaded.buildSessionContext().messages;
        expect(messages.map((message) => message.role)).toEqual([
          "user",
          "assistant",
          "user",
        ]);
        expect(messages[1]).toMatchObject({ content: assistant.content });
        const replay = convertResponsesMessages(
          model,
          normalizeContext({ messages: convertToLlm(messages) }),
          new Set([model.provider])
        );
        const replayedAssistant = replay.filter(
          (item) => "role" in item && item.role === "assistant"
        );
        expect(replayedAssistant).toMatchObject([
          { id: "msg_commentary_1", phase: "commentary" },
          { id: "msg_final_1", phase: "final_answer" },
          { id: "msg_legacy_1" },
        ]);
        expect(JSON.stringify(replay)).not.toContain("[REDACTED]");
      } finally {
        await secondTurn.persist();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
