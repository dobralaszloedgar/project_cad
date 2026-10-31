import { readFileSync, writeFileSync } from "node:fs";
import { aiGuideText } from "../src/assistant/guide";

const target = new URL("../docs/AI_GUIDE.txt", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== aiGuideText)
    throw new Error("AI_GUIDE is stale. Run npm run docs:ai-guide.");
} else {
  writeFileSync(target, aiGuideText, "utf8");
}
