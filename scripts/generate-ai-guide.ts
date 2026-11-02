// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { readFileSync, writeFileSync } from "node:fs";
import { aiGuideText } from "../src/assistant/guide";

const target = new URL("../docs/AI_GUIDE.txt", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== aiGuideText)
    throw new Error("AI_GUIDE is stale. Run npm run docs:ai-guide.");
} else {
  writeFileSync(target, aiGuideText, "utf8");
}
