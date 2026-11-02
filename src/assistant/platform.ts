export const assistantPlatformNames = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
} as const;

export type AssistantPlatform = keyof typeof assistantPlatformNames;

type BrowserPlatform = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; mobile?: boolean };
};

function desktopPlatform(value: string): AssistantPlatform | undefined {
  if (/windows|win32|win64/i.test(value)) return "windows";
  if (/macos|macintosh|macintel|macppc|mac os x|^mac$/i.test(value))
    return "macos";
  if (/linux/i.test(value)) return "linux";
}

export function detectAssistantPlatform(
  browser: BrowserPlatform,
): AssistantPlatform | undefined {
  const hints = browser.userAgentData;
  if (hints?.mobile || /android|ios|chrome os/i.test(hints?.platform ?? ""))
    return;
  const hinted = desktopPlatform(hints?.platform ?? "");
  if (hinted) return hinted;

  const userAgent = browser.userAgent ?? "";
  // Mobile browsers can advertise Linux or macOS while running a different OS.
  if (
    /android|iphone|ipad|ipod|cros/i.test(userAgent) ||
    (/mac/i.test(browser.platform ?? "") && (browser.maxTouchPoints ?? 0) > 1)
  )
    return;
  return desktopPlatform(userAgent) ?? desktopPlatform(browser.platform ?? "");
}
