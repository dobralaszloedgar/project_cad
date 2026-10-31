import { NextResponse } from "next/server";
import { CatalogError, catalogModels } from "@/server/catalog";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await catalogModels(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CatalogError
            ? error.message
            : "Chemical database unavailable.",
      },
      { status: error instanceof CatalogError ? error.status : 503 },
    );
  }
}
