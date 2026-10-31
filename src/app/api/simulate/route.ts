import { NextRequest, NextResponse } from "next/server";
import { MAX_PROJECT_REQUEST_BYTES, projectSchema } from "@/domain/schema";
import { simulate } from "@/domain/solver";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Project JSON is required.");
    const decoder = new TextDecoder();
    let body = "",
      bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > MAX_PROJECT_REQUEST_BYTES) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Simulation request exceeds 4 MB." },
          { status: 413 },
        );
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return NextResponse.json(simulate(projectSchema.parse(JSON.parse(body))));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid simulation request.",
      },
      { status: 422 },
    );
  }
}
