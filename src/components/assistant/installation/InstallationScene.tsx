import Image from "next/image";
import { memo } from "react";
import {
  Accessibility,
  AppWindow,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  ContactRound,
  Download,
  Eye,
  File,
  Folder,
  FolderOpen,
  Hand,
  HardDrive,
  House,
  LockKeyhole,
  MapPin,
  Mic,
  Monitor,
  Moon,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import type {
  GuideSceneName,
  MacVersion,
  WindowsArchitecture,
} from "./installationGuideData";
import { MAC_INSTALLER, windowsInstaller } from "./installationGuideData";
import styles from "./InstallationScene.module.css";

const assetRoot = "/assistant/install-guide/";

function NativeImage({ name, size }: { name: string; size: number }) {
  return (
    <Image src={`${assetRoot}${name}.png`} alt="" width={size} height={size} />
  );
}

function TrafficLights() {
  return (
    <span className={styles.trafficLights}>
      <i />
      <i />
      <i />
    </span>
  );
}

const sidebarItems = [
  [Settings, "General", "gray"],
  [Accessibility, "Accessibility", "blue"],
  [Eye, "Appearance", "gray"],
  [AppWindow, "Menu Bar", "gray"],
  [Sparkles, "Apple Intelligence & Siri", "violet"],
  [Monitor, "Desktop & Dock", "gray"],
  [Monitor, "Displays", "blue"],
  [Search, "Spotlight", "blue"],
  [Bell, "Notifications", "red"],
  [Volume2, "Sound", "red"],
  [Moon, "Focus", "violet"],
  [LockKeyhole, "Lock Screen", "gray"],
  [Hand, "Privacy & Security", "blue"],
] as const;

function SettingsWindow({
  scrolled,
  version,
}: {
  scrolled: boolean;
  version: MacVersion;
}) {
  return (
    <div
      className={`${styles.settingsWindow} ${version === "tahoe" ? styles.tahoe : styles.sequoia}`}
    >
      <aside className={styles.settingsSidebar}>
        <TrafficLights />
        <div className={styles.settingsSearch}>
          <Search size={15} /> Search
        </div>
        <div className={styles.sidebarItems}>
          {sidebarItems.map(([Icon, label, color]) => (
            <div
              key={label}
              className={
                label === "Privacy & Security"
                  ? styles.selectedSidebar
                  : undefined
              }
              data-guide-target={
                !scrolled && label === "Privacy & Security" ? "true" : undefined
              }
            >
              <span data-color={color}>
                <Icon size={15} />
              </span>
              {version === "sequoia" && label === "Menu Bar"
                ? "Control Center"
                : label}
            </div>
          ))}
        </div>
      </aside>
      <div className={styles.settingsMain}>
        <div className={styles.settingsToolbar}>
          <span>
            <ChevronLeft size={20} />
            <ChevronRight size={20} />
          </span>
          <strong>Privacy & Security</strong>
        </div>
        <div className={styles.settingsPane}>
          {!scrolled ? (
            <>
              <div className={styles.privacyIntro}>
                <span data-color="blue">
                  <Hand size={21} />
                </span>
                <div>
                  <strong>Privacy</strong>
                  <p>
                    Control which apps can access your data, location, camera,
                    and microphone, and manage safety protections.{" "}
                    <em>Learn more…</em>
                  </p>
                </div>
              </div>
              <div className={styles.preferenceGroup}>
                <div>
                  <span data-color="blue">
                    <MapPin size={17} />
                  </span>
                  Location Services
                  <ChevronRight size={17} />
                </div>
              </div>
              <div className={styles.preferenceGroup}>
                <div>
                  <span data-color="gray">
                    <CalendarDays size={17} />
                  </span>
                  Calendars
                  <ChevronRight size={17} />
                </div>
                <div>
                  <span data-color="gray">
                    <ContactRound size={17} />
                  </span>
                  Contacts
                  <ChevronRight size={17} />
                </div>
                <div>
                  <span data-color="cyan">
                    <Folder size={17} />
                  </span>
                  Files & Folders
                  <ChevronRight size={17} />
                </div>
                <div>
                  <span data-color="gray">
                    <HardDrive size={17} />
                  </span>
                  Full Disk Access
                  <ChevronRight size={17} />
                </div>
                <div>
                  <span data-color="orange">
                    <House size={17} />
                  </span>
                  Home
                  <ChevronRight size={17} />
                </div>
              </div>
              <div className={styles.scrollInstruction}>
                <ChevronDown size={16} /> Scroll down this pane to find Security
              </div>
            </>
          ) : (
            <>
              <div className={styles.preferenceGroup}>
                <div>
                  <span data-color="gray">
                    <Mic size={17} />
                  </span>
                  Speech Recognition
                  <ChevronRight size={17} />
                </div>
              </div>
              <div className={styles.preferenceGroup}>
                <div>
                  <span data-color="blue">
                    <Eye size={17} />
                  </span>
                  Sensitive Content Warning
                  <ChevronRight size={17} />
                </div>
              </div>
              <div className={styles.preferenceGroup}>
                <div>
                  <span data-color="blue">
                    <SlidersHorizontal size={17} />
                  </span>
                  Analytics & Improvements
                  <ChevronRight size={17} />
                </div>
              </div>
              <h3>Security</h3>
              <div className={styles.allowApps}>
                Allow applications from{" "}
                <span>
                  App Store & Known Developers <ChevronsUpDown size={13} />
                </span>
              </div>
              <div className={styles.blockedInstaller}>
                <div>
                  <p>“{MAC_INSTALLER}” was blocked to protect your Mac.</p>
                  <span className={styles.macButton} data-guide-target="true">
                    Open Anyway
                  </span>
                </div>
                <p>
                  Apple could not verify it is free of malware that may harm
                  your Mac or compromise your privacy.
                </p>
              </div>
              <div className={styles.preferenceGroup}>
                <div>
                  <span data-color="gray">
                    <LockKeyhole size={17} />
                  </span>
                  FileVault
                  <ChevronRight size={17} />
                </div>
              </div>
            </>
          )}
          <span className={styles.scrollbar} data-bottom={scrolled} />
        </div>
      </div>
    </div>
  );
}

function MacWarning({ confirm }: { confirm: boolean }) {
  return (
    <div className={styles.macWarning}>
      <span className={styles.warningHelp}>
        <CircleHelp size={17} />
      </span>
      <div className={styles.gatekeeperIcon}>
        <NativeImage name="macos-filevault" size={76} />
        <span>
          <NativeImage name="macos-caution" size={110} />
        </span>
      </div>
      <strong>
        “{MAC_INSTALLER}”{" "}
        {confirm
          ? "is from an unidentified developer. Are you sure you want to open it?"
          : "Not Opened"}
      </strong>
      <p>
        {confirm
          ? "Apple is not able to verify that it is free from malware that could harm your Mac or compromise your privacy. Don’t open this unless you are certain it is from a trustworthy source."
          : `Apple could not verify “${MAC_INSTALLER}” is free of malware that may harm your Mac or compromise your privacy.`}
      </p>
      <div className={styles.warningActions}>
        <span data-guide-target={confirm ? undefined : "true"}>
          {confirm ? "Cancel" : "Done"}
        </span>
        <span
          className={styles.defaultButton}
          data-guide-target={confirm ? "true" : undefined}
        >
          {confirm ? "Open" : "Move to Trash"}
        </span>
      </div>
    </div>
  );
}

function MacMenu() {
  return (
    <>
      <div className={styles.macMenubar}>
        <span className={styles.appleLogo}>
          <NativeImage name="apple-menu" size={15} />
        </span>
        <strong>Finder</strong>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span>Go</span>
        <span>Window</span>
        <span>Help</span>
        <Wifi size={15} />
      </div>
      <div className={styles.appleMenu}>
        <div>About This Mac</div>
        <hr />
        <div className={styles.menuSelected} data-guide-target="true">
          System Settings…
        </div>
        <div>App Store…</div>
        <hr />
        <div>
          Recent Items <ChevronRight size={13} />
        </div>
        <hr />
        <div>Force Quit…</div>
        <hr />
        <div>Sleep</div>
        <div>Restart…</div>
        <div>Shut Down…</div>
        <hr />
        <div>Lock Screen</div>
        <div>Log Out…</div>
      </div>
      <div className={styles.downloadOnDesktop}>
        <NativeImage name="macos-package" size={62} />
        <span>{MAC_INSTALLER}</span>
      </div>
    </>
  );
}

function MacInstaller() {
  return (
    <div className={styles.macInstaller}>
      <div className={styles.installerToolbar}>
        <TrafficLights />
        <NativeImage name="macos-package" size={18} />
        <strong>Install Project CAD Assistant</strong>
      </div>
      <aside>
        {[
          "Introduction",
          "Destination Select",
          "Installation Type",
          "Installation",
          "Summary",
        ].map((label, index) => (
          <div key={label} data-active={index === 0}>
            <i />
            {label}
          </div>
        ))}
      </aside>
      <div className={styles.macInstallerContent}>
        <strong>Welcome to the Project CAD Assistant Installer</strong>
        <div>
          <h3>Project CAD Assistant</h3>
          <p>Install the local companion for Codex, Claude Code, and Muse.</p>
          <p>
            The private runtime is included. Existing settings, conversations,
            and project files are preserved.
          </p>
        </div>
      </div>
      <footer>
        <span className={styles.disabledButton}>Go Back</span>
        <span className={styles.macButton} data-guide-target="true">
          Continue
        </span>
      </footer>
    </div>
  );
}

function Explorer({ filename }: { filename: string }) {
  return (
    <div className={styles.explorer}>
      <div className={styles.explorerTitle}>
        <FolderOpen size={15} />
        <span>Downloads</span>
        <X size={14} />
      </div>
      <div className={styles.explorerToolbar}>
        <ChevronLeft size={17} />
        <ChevronRight size={17} />
        <span>
          <Folder size={15} />
          Downloads
        </span>
        <Search size={15} />
      </div>
      <div className={styles.explorerCommands}>
        New <ChevronDown size={12} />
        <span />
        Sort <ChevronDown size={12} />
        View <ChevronDown size={12} />
      </div>
      <aside>
        <div>
          <House size={16} />
          Home
        </div>
        <div>
          <Monitor size={16} />
          Desktop
        </div>
        <div data-active>
          <Download size={16} />
          Downloads
        </div>
        <div>
          <File size={16} />
          Documents
        </div>
        <div>
          <HardDrive size={16} />
          This PC
        </div>
      </aside>
      <div className={styles.explorerFiles}>
        <header>
          Name <span>Type</span>
        </header>
        <div data-guide-target="true">
          <AppWindow size={20} />
          <span>{filename}</span>
          <small>Application</small>
        </div>
      </div>
      <footer>1 item</footer>
    </div>
  );
}

function SmartScreen({
  filename,
  expanded,
}: {
  filename: string;
  expanded: boolean;
}) {
  return (
    <div className={styles.smartScreen}>
      <span className={styles.windowsClose}>
        <X size={16} />
      </span>
      <strong>Windows protected your PC</strong>
      <p>
        Microsoft Defender SmartScreen prevented an unrecognized app from
        starting. Running this app might put your PC at risk.
      </p>
      {expanded ? (
        <dl>
          <dt>App:</dt>
          <dd>{filename}</dd>
          <dt>Publisher:</dt>
          <dd>Unknown publisher</dd>
        </dl>
      ) : (
        <span className={styles.moreInfo} data-guide-target="true">
          More info
        </span>
      )}
      <footer>
        {expanded ? <span data-guide-target="true">Run anyway</span> : null}
        <span className={styles.dontRun}>Don’t run</span>
      </footer>
    </div>
  );
}

function WindowsInstaller() {
  return (
    <div className={styles.windowsInstaller}>
      <header>
        <AppWindow size={15} />
        Project CAD Assistant Setup
        <span>
          <span>−</span>
          <Square size={11} />
          <X size={14} />
        </span>
      </header>
      <aside>
        <Image
          src={`${assetRoot}windows-setup-wizard.bmp`}
          alt=""
          width={164}
          height={314}
          unoptimized
        />
      </aside>
      <div>
        <h3>Welcome to Project CAD Assistant Setup</h3>
        <p>
          Setup will guide you through the installation of Project CAD
          Assistant.
        </p>
        <p>
          It is recommended that you close all other applications before
          starting Setup. This will make it possible to update relevant system
          files without having to reboot your computer.
        </p>
        <p>Click Next to continue.</p>
      </div>
      <footer>
        <span data-guide-target="true">Next &gt;</span>
        <span>Cancel</span>
      </footer>
    </div>
  );
}

function InstallationScene({
  scene,
  version,
  architecture,
  dark,
}: {
  scene: GuideSceneName;
  version: MacVersion;
  architecture: WindowsArchitecture;
  dark: boolean;
}) {
  const isMac = scene.startsWith("mac");
  const filename = windowsInstaller(architecture);
  return (
    <div
      className={styles.desktop}
      data-os={isMac ? "mac" : "windows"}
      data-dark={dark}
      data-version={version}
    >
      {scene === "mac-warning" && <MacWarning confirm={false} />}
      {scene === "mac-menu" && <MacMenu />}
      {scene === "mac-privacy" && (
        <SettingsWindow scrolled={false} version={version} />
      )}
      {scene === "mac-security" && (
        <SettingsWindow scrolled version={version} />
      )}
      {scene === "mac-confirm" && <MacWarning confirm />}
      {scene === "mac-install" && <MacInstaller />}
      {scene === "win-download" && <Explorer filename={filename} />}
      {scene === "win-warning" && (
        <SmartScreen filename={filename} expanded={false} />
      )}
      {scene === "win-confirm" && <SmartScreen filename={filename} expanded />}
      {scene === "win-install" && <WindowsInstaller />}
    </div>
  );
}

export default memo(InstallationScene);
