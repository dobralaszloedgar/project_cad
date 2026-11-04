// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
    "dist/**",
    "public/downloads/assistant/**",
    "rust/thermo/target/**",
    "supabase/.temp/**",
    // Keep local scratch files and agent worktrees out of source checks.
    ".tmp/**",
    "tmp/**",
    ".playwright-mcp/**",
    ".vercel/**",
    ".agents/**",
    ".agent/**",
    ".codex/**",
    ".claude/**",
    ".cursor/**",
    ".impeccable/**",
    "agent-artifacts/**",
    "agents/**",
  ]),
]);
