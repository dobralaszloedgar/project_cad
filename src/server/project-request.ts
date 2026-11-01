import { MAX_PROJECT_REQUEST_BYTES } from "../domain/schema";

export class ProjectRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Bound the actual stream even when Content-Length is missing or incorrect. */
export async function readProjectRequest(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new ProjectRequestError("Project JSON is required.", 422);
  const decoder = new TextDecoder();
  let body = "",
    bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > MAX_PROJECT_REQUEST_BYTES) {
        await reader.cancel();
        throw new ProjectRequestError("Project request exceeds 4 MB.", 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } finally {
    reader.releaseLock();
  }
}
