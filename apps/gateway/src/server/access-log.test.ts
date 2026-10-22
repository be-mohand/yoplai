import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessLogger, stripAnsi } from "./access-log.js";

const quietPaths = [
  "/api/chat-projects",
  "/api/chat-projects/project-1",
  "/api/skills",
  "/api/skills/skill-1",
  "/d-assets/kit/v1/app.js",
  "/d-assets/styles.css",
  "/api/theme.css",
  "/api/branding/logo",
  "/api/branding/icon",
  "/api/manifest.webmanifest",
];

describe("accessLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("suppresses successful polling and health requests", async () => {
    const app = new Hono();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    app.use("*", accessLogger());
    app.get("/api/agents/sessions", (c) => c.json([]));
    app.get("/api/auth/get-session", (c) => c.json({}));
    app.get("/api/agents/alpha/history", (c) => c.json({}));
    app.get("/health", (c) => c.json({ ok: true }));

    await app.request("/api/agents/sessions");
    await app.request("/api/auth/get-session");
    await app.request("/api/agents/alpha/history");
    await app.request("/health");

    expect(log).not.toHaveBeenCalled();
  });

  it("logs unsuccessful polling requests", async () => {
    const app = new Hono();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    app.use("*", accessLogger());
    app.get("/api/agents/sessions", (c) => c.json({ error: "nope" }, 401));

    await app.request("/api/agents/sessions");

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^--> GET \/api\/agents\/sessions 401 \d+ms$/)
    );
  });

  it.each(quietPaths)(
    "suppresses fast successful GET %s with a query",
    async (path) => {
      const app = new Hono();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      vi.spyOn(Date, "now").mockReturnValue(0);
      app.use("*", accessLogger());
      app.get("*", (c) => c.text("ok"));

      const response = await app.request(`${path}?v=1`);

      expect(response.status).toBe(200);
      expect(log).not.toHaveBeenCalled();
    }
  );

  describe.each(quietPaths)("quiet GET %s", (path) => {
    it.each([302, 404, 500] as const)(
      "logs one completion for status %i",
      async (status) => {
        const app = new Hono();
        const log = vi
          .spyOn(console, "log")
          .mockImplementation(() => undefined);
        vi.spyOn(Date, "now").mockReturnValue(0);
        app.use("*", accessLogger());
        app.get("*", (c) => c.body(null, status));

        const response = await app.request(`${path}?v=1`);

        expect(response.status).toBe(status);
        expect(log.mock.calls).toEqual([[`--> GET ${path} ${status} 0ms`]]);
      }
    );

    it.each([
      [500, false],
      [501, true],
    ] as const)("at %i ms logs: %s", async (elapsed, logs) => {
      const app = new Hono();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      app.use("*", accessLogger());
      app.get("*", (c) => {
        now = elapsed;
        return c.text("ok");
      });

      const response = await app.request(`${path}?v=1`);

      expect(response.status).toBe(200);
      expect(log.mock.calls).toEqual(
        logs ? [[`--> GET ${path} 200 501ms`]] : []
      );
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])(
      "logs one completion for %s",
      async (method) => {
        const app = new Hono();
        const log = vi
          .spyOn(console, "log")
          .mockImplementation(() => undefined);
        vi.spyOn(Date, "now").mockReturnValue(0);
        app.use("*", accessLogger());
        app.all("*", (c) => c.text("ok"));

        const response = await app.request(path, { method });

        expect(response.status).toBe(200);
        expect(log.mock.calls).toEqual([[`--> ${method} ${path} 200 0ms`]]);
      }
    );
  });

  it.each([
    "/api/agents/sessions/search?q=hello",
    "/api/skills/import-token?v=1",
    "/api/skills/recipients",
    "/api/chat-projects/project-1/files",
    "/api/chat-projects/",
    "/api/chat-projects-extra",
    "/api/skills/skill-1/versions",
    "/api/skills/",
    "/api/skills-extra",
    "/d-assets",
    "/d-assets-extra/app.js",
    "/api/theme.css/extra",
    "/api/branding/logo/extra",
    "/api/branding/icon-extra",
    "/api/manifest.webmanifest/extra",
    "/api/agents/alpha",
    "/api/agents/alpha/extensions",
    "/api/agents/alpha/history/extra",
    "/api/mcp/servers",
    "/api/capabilities",
    "/api/tool-labels",
  ])("keeps GET %s logged", async (path) => {
    const app = new Hono();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(0);
    app.use("*", accessLogger());
    app.get("*", (c) => c.text("ok"));

    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(log.mock.calls).toEqual([[`--> GET ${path} 200 0ms`]]);
  });

  it("logs slow polling requests", async () => {
    const app = new Hono();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(501);
    app.use("*", accessLogger());
    app.get("/api/agents/sessions", (c) => c.json([]));

    await app.request("/api/agents/sessions");

    expect(log).toHaveBeenCalledWith("--> GET /api/agents/sessions 200 501ms");
  });

  it("prints one completion line free of ANSI escapes per normal request", async () => {
    const app = new Hono();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    app.use("*", accessLogger());
    app.post("/hooks/test", (c) => c.json({ ok: true }));

    await app.request("/hooks/test", { method: "POST" });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^--> POST \/hooks\/test 200 \d+ms$/)
    );
    expect(log.mock.calls.flat().join("")).not.toContain(
      String.fromCharCode(27)
    );
  });

  it("removes ANSI escape codes", () => {
    expect(stripAnsi("--> GET /hooks/test \u001B[32m200\u001B[0m 5ms")).toBe(
      "--> GET /hooks/test 200 5ms"
    );
  });

  it("redacts dashboard preview tokens in the completion line", async () => {
    const app = new Hono();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    app.use("*", accessLogger());
    app.get("/internal/dashboards/:slug/html", (c) => c.html("preview"));

    await app.request(
      "/internal/dashboards/clients.html/html?%74oken=secret-value&token=second-secret&theme=dark&id=7"
    );

    expect(log).toHaveBeenCalledTimes(1);
    for (const [message] of log.mock.calls) {
      expect(message).not.toContain("secret");
      expect(message).toContain("token=%5Bredacted%5D&theme=dark&id=7");
    }
  });
});
