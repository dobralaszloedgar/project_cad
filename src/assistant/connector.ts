import { z } from "zod";

export const connectorPreferencesSchema = z
  .object({
    accessMode: z.enum(["yolo", "sandbox"]),
    projectsDirectory: z.string().trim().min(1).max(4096),
  })
  .strict();

export type ConnectorPreferences = z.infer<typeof connectorPreferencesSchema>;
