import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CatalogError, loadCatalogSelection } from "@/server/catalog";
import { modelIds } from "@/domain/thermo/registry";
import { hashSchema } from "@/domain/thermo/data";
export const runtime = "nodejs";
const schema = z
  .object({
    release: hashSchema,
    ids: z.tuple([z.string().min(1).max(80), z.string().min(1).max(80)]),
    model: z.enum(modelIds),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    // Bound the stream, not only Content-Length, which clients may omit.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 2048) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Selection request is too large." },
          { status: 413 },
        );
      }
      chunks.push(item.value);
    }
    const input = schema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    return NextResponse.json(
      await loadCatalogSelection(input.release, input.ids, input.model),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CatalogError
            ? error.message
            : "Invalid chemical selection.",
      },
      { status: error instanceof CatalogError ? error.status : 400 },
    );
  }
}
