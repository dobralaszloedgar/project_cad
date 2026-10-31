import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CatalogError, searchChemicals } from "@/server/catalog";
import { modelIds } from "@/domain/thermo/registry";
import { hashSchema } from "@/domain/thermo/data";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const query = z
      .string()
      .max(100)
      .parse(request.nextUrl.searchParams.get("query") ?? "");
    const model = z
      .enum(modelIds)
      .parse(request.nextUrl.searchParams.get("model") ?? "ideal-gas");
    const hash = hashSchema
      .optional()
      .parse(request.nextUrl.searchParams.get("release") ?? undefined);
    return NextResponse.json(await searchChemicals(query, model, hash), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CatalogError
            ? error.message
            : "Invalid chemical search request.",
      },
      { status: error instanceof CatalogError ? error.status : 400 },
    );
  }
}
