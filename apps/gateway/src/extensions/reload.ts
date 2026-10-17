import type { GatewayConfig } from "@yoplai/shared";
import { reloadConfig, setLoadedConfig } from "../config/index.js";
import { resolveStartupConfig } from "../config/validate.js";
import { reloadExtensions } from "./registry.js";

/**
 * Reload the gateway config after an `agent.yaml` write.
 *
 * This clears the config cache, so the next run and the next catalog read see
 * the change. It also brings a newly enabled extension online without a
 * gateway restart (ALG-349). It only adds extensions that are not loaded. It
 * never restarts running ones.
 */
export async function reloadAfterExtensionWrite(): Promise<GatewayConfig> {
  const rawReloaded = reloadConfig();
  const reloaded = await resolveStartupConfig(rawReloaded);
  setLoadedConfig(reloaded);
  try {
    await reloadExtensions(reloaded);
  } catch (error) {
    console.warn(
      `[extensions] runtime reconcile after enable failed: ${(error as Error).message}`
    );
  }
  return reloaded;
}
