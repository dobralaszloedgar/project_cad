export type GuidePlatform = "mac" | "windows";
export type MacVersion = "tahoe" | "sequoia";
export type WindowsArchitecture = "universal" | "x64" | "arm64";
export type GuideSceneName =
  | "mac-warning"
  | "mac-menu"
  | "mac-privacy"
  | "mac-security"
  | "mac-confirm"
  | "mac-install"
  | "win-download"
  | "win-warning"
  | "win-confirm"
  | "win-install";

export type GuideStep = {
  title: string;
  description: string;
  location: string;
  action: string;
  scene: GuideSceneName;
};

export const STEP_MS = 5000;
export const MAC_INSTALLER = "ProjectCAD-Assistant-macos-universal.pkg";
export const MAC_VERSIONS: Record<MacVersion, string> = {
  tahoe: "macOS Tahoe 26",
  sequoia: "macOS Sequoia 15",
};

export function windowsInstaller(architecture: WindowsArchitecture) {
  return `ProjectCAD-Assistant-windows-${architecture}-Setup.exe`;
}

export function installationSteps(
  platform: GuidePlatform,
  architecture: WindowsArchitecture,
): GuideStep[] {
  if (platform === "mac") {
    return [
      {
        title: "Open the download, then choose Done",
        description: `In Finder → Downloads, double-click ${MAC_INSTALLER}. If the “Not Opened” warning appears, click Done on the left.`,
        location: "Finder → Downloads → Open installer",
        action: "Click Done. Keep the installer in Downloads.",
        scene: "mac-warning",
      },
      {
        title: "Open System Settings",
        description:
          "Click the Apple menu at the top-left of your screen, then choose System Settings…",
        location: "Apple menu → System Settings…",
        action: "Choose System Settings… from the Apple menu.",
        scene: "mac-menu",
      },
      {
        title: "Select Privacy & Security",
        description:
          "Scroll down the left sidebar and click Privacy & Security. The right side shows the privacy permissions list.",
        location: "System Settings → Privacy & Security",
        action: "Click Privacy & Security in the left sidebar.",
        scene: "mac-privacy",
      },
      {
        title: "Scroll to Security → Open Anyway",
        description:
          "Scroll down the right pane to Security. Find the message for the Project CAD .pkg and click Open Anyway. This appears after the first blocked opening attempt.",
        location: "Privacy & Security → scroll down → Security",
        action: "Click Open Anyway beside the blocked installer.",
        scene: "mac-security",
      },
      {
        title: "Confirm this installer",
        description:
          "In the confirmation, choose Open if you trust this download. Use Touch ID or your Mac login password if macOS asks.",
        location: "macOS confirmation",
        action: "Confirm Open. Authentication may also be requested.",
        scene: "mac-confirm",
      },
      {
        title: "Finish setup and open the assistant",
        description:
          "In Installer, choose Continue and follow the installation steps. At the end choose Close. In Finder, use Go → Home → Applications, then open Project CAD Assistant.",
        location: "Installer → Continue → finish installation",
        action:
          "Continue through Installer, then open the app in ~/Applications.",
        scene: "mac-install",
      },
    ];
  }
  return [
    {
      title:
        architecture === "universal"
          ? "Open the universal Setup.exe"
          : "Open the matching Setup.exe",
      description: `In File Explorer → Downloads, double-click ${windowsInstaller(architecture)}. ${architecture === "universal" ? "It automatically installs the correct version for your PC." : "The x64 and ARM64 files are different installers."}`,
      location: "File Explorer → Downloads",
      action: "Double-click the Project CAD Setup.exe you downloaded.",
      scene: "win-download",
    },
    {
      title: "Choose More info",
      description:
        "If the blue “Windows protected your PC” window appears, click the underlined More info link beneath the warning.",
      location: "Microsoft Defender SmartScreen",
      action: "Click More info beneath the warning text.",
      scene: "win-warning",
    },
    {
      title: "Check the filename → Run anyway",
      description:
        "Check App matches the installer you downloaded. Unsigned installers show Unknown publisher. If you trust the download, choose Run anyway at the bottom.",
      location: "SmartScreen → app details",
      action: "Check App, then click Run anyway.",
      scene: "win-confirm",
    },
    {
      title: "Choose Next, then Finish",
      description:
        "Choose Next in Project CAD Assistant Setup. When installation finishes, keep Run Project CAD Assistant selected and choose Finish. You can also open it from Start → Project CAD.",
      location: "Project CAD Assistant Setup",
      action: "Choose Next to install, then Finish to open the assistant.",
      scene: "win-install",
    },
  ];
}
