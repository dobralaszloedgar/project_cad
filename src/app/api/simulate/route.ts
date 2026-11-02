// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { NextRequest, NextResponse } from "next/server";
import { projectSchema } from "@/domain/schema";
import { simulate } from "@/domain/solver";
import {
  ProjectRequestError,
  readProjectRequest,
} from "@/server/project-request";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      simulate(projectSchema.parse(await readProjectRequest(request))),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid simulation request.",
      },
      { status: error instanceof ProjectRequestError ? error.status : 422 },
    );
  }
}
