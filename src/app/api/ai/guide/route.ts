// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { aiGuideText, AI_GUIDE_VERSION } from "@/assistant/guide";

export function GET() {
  return new Response(aiGuideText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AI-Guide-Version": AI_GUIDE_VERSION,
    },
  });
}
