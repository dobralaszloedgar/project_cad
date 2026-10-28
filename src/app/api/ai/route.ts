import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { projectSchema } from "@/domain/schema";
import { generatePlan, metaStatus } from "@/server/meta";
export const runtime = "nodejs";
const requestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(3000),
    project: projectSchema,
  })
  .strict();
let windowStart = 0,
  calls = 0;
export async function GET() {
  return NextResponse.json(metaStatus());
}
export async function POST(request: NextRequest) {
  const rawOrigin = request.headers.get("origin");
  let origin: URL;
  try {
    origin = new URL(rawOrigin ?? "");
  } catch {
    return NextResponse.json(
      { error: "A valid same-origin request is required." },
      { status: 403 },
    );
  }
  if (
    origin.host !== request.headers.get("host") ||
    origin.protocol !== request.nextUrl.protocol
  )
    return NextResponse.json(
      { error: "Same-origin requests are required." },
      { status: 403 },
    );
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
    return NextResponse.json(
      {
        error:
          "Live AI is restricted to a trusted local server in this release.",
      },
      { status: 403 },
    );
  if (!metaStatus().enabled)
    return NextResponse.json(
      {
        error:
          "Meta AI is not configured. Use a labeled deterministic example.",
      },
      { status: 503 },
    );
  if (Date.now() - windowStart > 60000) {
    windowStart = Date.now();
    calls = 0;
  }
  if (++calls > 10)
    return NextResponse.json(
      { error: "Limit reached. Try again in one minute." },
      { status: 429 },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Request body required.");
    let text = "",
      bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 100000) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Request too large." },
          { status: 413 },
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const body = requestSchema.parse(JSON.parse(text));
    return NextResponse.json(await generatePlan(body.prompt, body.project));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: "The request or Meta proposal failed schema validation." },
        { status: 422 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          error.message.startsWith("Meta API request failed")
            ? error.message
            : "Meta could not produce a valid action plan. No changes were applied.",
      },
      { status: 502 },
    );
  }
}
