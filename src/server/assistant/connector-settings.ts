import {
  connectorPreferencesSchema,
  type ConnectorPreferences,
} from "../../assistant/connector";
import { loadAssistantSettings, saveAssistantSettings } from "./config";
import { isAbsolute } from "node:path";

export interface ConnectorSettingsService {
  read(): ConnectorPreferences;
  save(value: unknown): ConnectorPreferences;
}

/** The paired website can manage these preferences, never credentials or origins. */
export function connectorSettings(root: string): ConnectorSettingsService {
  const read = () => {
    const { accessMode, projectsDirectory } = loadAssistantSettings(root);
    return { accessMode, projectsDirectory };
  };
  return {
    read,
    save(value) {
      const next = connectorPreferencesSchema.parse(value);
      if (!isAbsolute(next.projectsDirectory))
        throw new Error("Enter the full folder path on this computer.");
      saveAssistantSettings(root, { ...loadAssistantSettings(root), ...next });
      return read();
    },
  };
}
