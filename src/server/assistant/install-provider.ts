import { providerExecutable } from "./config";
import { installMuse } from "./install-muse";
import type { ProviderId } from "../../assistant/protocol";

export async function installProvider(
  provider: ProviderId,
  _resources: string,
  root: string,
) {
  if (provider !== "muse") throw new Error("Only Muse Code is supported.");
  const existing = providerExecutable("muse");
  return existing ? { path: existing, installed: false } : installMuse(root);
}
