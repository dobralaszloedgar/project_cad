// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { NextRequest, NextResponse } from "next/server";
import { previewRequestSchema } from "@/assistant/capabilities";
import { executeProjectTool, projectRevision } from "@/assistant/tools";
import {
  ProjectRequestError,
  readProjectRequest,
} from "@/server/project-request";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { project, plan, baseRevision } = previewRequestSchema.parse(
      await readProjectRequest(request),
    );
    const revision = await projectRevision(project);
    if (baseRevision !== undefined && baseRevision !== revision)
      throw new ProjectRequestError(
        "The supplied project does not match baseRevision. Read the current project and prepare a fresh plan.",
        409,
      );
    return NextResponse.json(
      await executeProjectTool(
        "preview_actions",
        { baseRevision: revision, plan },
        { projectId: "stateless", project, mode: "read-only" },
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid preview request.",
      },
      { status: error instanceof ProjectRequestError ? error.status : 422 },
    );
  }
}
