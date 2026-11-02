// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

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
