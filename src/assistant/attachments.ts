import { z } from "zod";

export const MAX_ATTACHMENT_BYTES = 5_000_000;
export const MAX_ATTACHMENTS = 8;
export const MAX_TOTAL_ATTACHMENT_BYTES = 10_000_000;
export const attachmentSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(240),
    type: z.string().max(120),
    size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
    data: z
      .string()
      .max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
export type ChatAttachment = z.infer<typeof attachmentSchema>;
export type AttachmentInfo = Omit<ChatAttachment, "data">;
export const attachmentsSchema = z
  .array(attachmentSchema)
  .max(MAX_ATTACHMENTS)
  .refine(
    (files) =>
      files.reduce((sum, file) => sum + file.size, 0) <=
      MAX_TOTAL_ATTACHMENT_BYTES,
    "Attachments exceed 10 MB.",
  )
  .refine(
    (files) => new Set(files.map((file) => file.id)).size === files.length,
    "Duplicate attachment identity.",
  );
export const fileSize = (bytes: number) =>
  bytes < 1000
    ? `${bytes} B`
    : bytes < 1_000_000
      ? `${Math.ceil(bytes / 1000)} KB`
      : `${(bytes / 1_000_000).toFixed(1)} MB`;

export async function prepareAttachments(
  files: File[],
  current: ChatAttachment[],
) {
  const next = [...current],
    errors: string[] = [];
  for (const file of files) {
    if (next.some((item) => item.name === file.name && item.size === file.size))
      continue;
    if (!file.size) {
      errors.push(`${file.name} is empty.`);
      continue;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`${file.name} exceeds 5 MB.`);
      continue;
    }
    if (
      next.length >= MAX_ATTACHMENTS ||
      next.reduce((sum, item) => sum + item.size, 0) + file.size >
        MAX_TOTAL_ATTACHMENT_BYTES
    ) {
      errors.push("Attach up to 8 files, 10 MB in total.");
      break;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      next.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        data,
      });
    } catch {
      errors.push(`Could not read ${file.name}.`);
    }
  }
  return { files: next, error: errors.join(" ") };
}
