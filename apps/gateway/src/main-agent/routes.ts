import { Hono, type Context } from "hono";
import type { MainAgentState } from "@yoplai/shared/main-agent";
import { MainAgentPreferenceStore } from "./store.js";

type MainAgentRouteDeps = {
  dataDir: string;
  getUserId(c: Context): Promise<string | undefined>;
  getEligibleAgents(c: Context): Promise<{ id: string }[]>;
};

export function createMainAgentRoutes(deps: MainAgentRouteDeps): Hono {
  const routes = new Hono();
  const storeFor = async (c: Context) => new MainAgentPreferenceStore(deps.dataDir, await deps.getUserId(c));
  const stateFor = async (c: Context, store: MainAgentPreferenceStore): Promise<MainAgentState> => {
    const preference = await store.get();
    const mainAgentId = preference?.mainAgentId ?? null;
    return { mainAgentId, accessible: mainAgentId !== null && (await deps.getEligibleAgents(c)).some((agent) => agent.id === mainAgentId), pickerDismissedAt: preference?.pickerDismissedAt ?? null };
  };
  routes.get("/me/main-agent", async (c) => c.json(await stateFor(c, await storeFor(c))));
  routes.put("/me/main-agent", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body ||
      (typeof body.mainAgentId !== "string" && typeof body.pickerDismissedAt !== "string") ||
      (body.mainAgentId !== undefined && body.pickerDismissedAt !== undefined)) {
      return c.json({ error: "Provide mainAgentId or pickerDismissedAt" }, 400);
    }
    const store = await storeFor(c);
    if (body.pickerDismissedAt !== undefined) {
      await store.set({ mainAgentId: (await store.get())?.mainAgentId ?? null, pickerDismissedAt: new Date().toISOString() });
    } else {
      if (!(await deps.getEligibleAgents(c)).some((agent) => agent.id === body.mainAgentId)) return c.json({ error: "Agent is not eligible" }, 403);
      await store.set({ mainAgentId: body.mainAgentId, pickerDismissedAt: null });
    }
    return c.json(await stateFor(c, store));
  });
  routes.delete("/me/main-agent", async (c) => {
    const store = await storeFor(c);
    await store.clear();
    return c.json(await stateFor(c, store));
  });
  return routes;
}
