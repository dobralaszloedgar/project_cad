import { NextResponse } from "next/server";
import { projectCapabilities } from "@/assistant/capabilities";

export function GET() {
  return NextResponse.json(projectCapabilities("stateless"), {
    headers: { "Cache-Control": "no-store" },
  });
}
