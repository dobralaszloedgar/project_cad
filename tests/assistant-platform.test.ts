import { describe, expect, it } from "vitest";
import { detectAssistantPlatform } from "../src/assistant/platform";

describe("assistant installer OS detection", () => {
  it("prefers the browser's explicit Windows platform over a reduced or changed user agent", () => {
    expect(
      detectAssistantPlatform({
        userAgentData: { platform: "Windows", mobile: false },
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      }),
    ).toBe("windows");
  });

  it.each([
    ["Windows", "windows"],
    ["macOS", "macos"],
    ["Linux", "linux"],
  ])(
    "uses %s client hints without needing a detailed user agent",
    (platform, expected) => {
      expect(detectAssistantPlatform({ userAgentData: { platform } })).toBe(
        expected,
      );
    },
  );

  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "macos"],
    ["Mozilla/5.0 (X11; Linux aarch64)", "linux"],
  ])("supports browsers without client hints: %s", (userAgent, expected) => {
    expect(detectAssistantPlatform({ userAgent })).toBe(expected);
  });

  it("uses Win32 when the user agent does not identify the OS", () => {
    expect(
      detectAssistantPlatform({ userAgent: "Mozilla/5.0", platform: "Win32" }),
    ).toBe("windows");
  });

  it.each([
    {},
    { userAgent: "Mozilla/5.0" },
    { userAgent: "Mozilla/5.0 (Linux; Android 16)" },
    { userAgentData: { platform: "Android", mobile: true } },
    { userAgentData: { platform: "Chrome OS" }, userAgent: "Linux" },
    {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    },
  ])(
    "asks for a manual choice for unsupported or unknown devices: %j",
    (browser) => {
      expect(detectAssistantPlatform(browser)).toBeUndefined();
    },
  );
});
