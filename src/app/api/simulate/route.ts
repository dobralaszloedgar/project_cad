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
