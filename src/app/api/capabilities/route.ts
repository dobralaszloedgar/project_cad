// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { NextResponse } from "next/server";
import { projectCapabilities } from "@/assistant/capabilities";

export function GET() {
  return NextResponse.json(projectCapabilities("stateless"), {
    headers: { "Cache-Control": "no-store" },
  });
}
