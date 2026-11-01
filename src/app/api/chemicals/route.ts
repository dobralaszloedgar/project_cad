import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CatalogError, searchChemicals } from "@/server/catalog";
import { modelIds } from "@/domain/thermo/registry";
import { hashSchema } from "@/domain/thermo/data";
import {
  chemicalSearchFields,
  chemicalSearchSorts,
} from "@/lib/chemical-search";
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
    const options = z
      .object({
        field: z.enum(chemicalSearchFields),
        sort: z.enum(chemicalSearchSorts),
        page: z.coerce.number().int().min(1).max(5000),
      })
      .parse({
        field: request.nextUrl.searchParams.get("field") ?? "all",
        sort: request.nextUrl.searchParams.get("sort") ?? "relevance",
        page: request.nextUrl.searchParams.get("page") ?? 1,
      });
    return NextResponse.json(
      await searchChemicals(query, model, hash, options),
      {
        headers: {
          "Cache-Control": hash
            ? "public, max-age=3600, s-maxage=3600"
            : "public, max-age=60, s-maxage=60",
        },
      },
    );
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
