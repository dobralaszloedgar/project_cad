const nsisQuote = (value) =>
  String(value).replaceAll("$", "$$").replaceAll('"', '$\\"');

// NSIS runs on both supported Windows architectures, then extracts only the native payload.
export function windowsUniversalScript({ destination, version, x64, arm64 }) {
  return `Unicode True
!include "MUI2.nsh"
!include "x64.nsh"
Name "Project CAD Assistant"
OutFile "${nsisQuote(destination)}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
InstallDir "$LOCALAPPDATA\\ProjectCAD\\Assistant"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\Project CAD Assistant.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  SetShellVarContext current
  StrCpy $INSTDIR "$LOCALAPPDATA\\ProjectCAD\\Assistant"
  \${IfNot} \${IsNativeARM64}
  \${AndIfNot} \${IsNativeAMD64}
    MessageBox MB_ICONSTOP "Project CAD Assistant requires x64 or ARM64 Windows."
    Abort
  \${EndIf}
FunctionEnd
Section "Assistant"
  InitPluginsDir
  \${If} \${IsNativeARM64}
    SetOutPath "$PLUGINSDIR\\payload\\arm64"
    File /r "${nsisQuote(arm64)}/*"
    StrCpy $1 "$PLUGINSDIR\\payload\\arm64"
  \${ElseIf} \${IsNativeAMD64}
    SetOutPath "$PLUGINSDIR\\payload\\x64"
    File /r "${nsisQuote(x64)}/*"
    StrCpy $1 "$PLUGINSDIR\\payload\\x64"
  \${Else}
    Abort
  \${EndIf}
  ExecWait '\"$1\\runtime\\node.exe\" \"$1\\app\\desktop.mjs\" install \"$1\" \"$INSTDIR\" --no-start' $0
  \${If} $0 != 0
    MessageBox MB_ICONSTOP "Project CAD Assistant could not be installed. Existing settings and history were preserved."
    Abort
  \${EndIf}
  CreateDirectory "$SMPROGRAMS\\Project CAD"
  CreateShortcut "$SMPROGRAMS\\Project CAD\\Project CAD Assistant.lnk" "$INSTDIR\\Project CAD Assistant.exe"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "DisplayName" "Project CAD Assistant"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "DisplayVersion" "${nsisQuote(version)}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "UninstallString" '$\\"$INSTDIR\\Uninstall.exe$\\"'
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "NoModify" 1
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  ExecWait '\"$INSTDIR\\runtime\\node.exe\" \"$INSTDIR\\app\\desktop.mjs\" uninstall' $0
  \${If} $0 != 0
    MessageBox MB_ICONSTOP "Close the assistant and try uninstalling again."
    Abort
  \${EndIf}
  Delete "$SMPROGRAMS\\Project CAD\\Project CAD Assistant.lnk"
  RMDir "$SMPROGRAMS\\Project CAD"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant"
  RMDir /r "$INSTDIR"
SectionEnd
`;
}

export function linuxUniversalHeader() {
  return `#!/bin/sh
set -eu
if [ "$(id -u)" = 0 ]; then echo "Install Project CAD Assistant as your normal user, without sudo." >&2; exit 1; fi
if [ "$(uname -s)" != Linux ]; then echo "This installer requires Linux." >&2; exit 1; fi
case "$(uname -m)" in
  x86_64|amd64) project_cad_arch=x64 ;;
  aarch64|arm64) project_cad_arch=arm64 ;;
  *) echo "Project CAD Assistant requires x64 or ARM64 Linux." >&2; exit 1 ;;
esac
project_cad_stage="$(mktemp -d)"
trap 'rm -rf "$project_cad_stage"' EXIT HUP INT TERM
project_cad_line="$(awk '/^__PROJECT_CAD_ARCHIVE__$/ {print NR + 1; exit}' "$0")"
tail -n +"$project_cad_line" "$0" | tar -xz -C "$project_cad_stage" "$project_cad_arch"
project_cad_source="$project_cad_stage/$project_cad_arch"
"$project_cad_source/runtime/node" "$project_cad_source/app/desktop.mjs" install "$project_cad_source" "$@"
exit 0
__PROJECT_CAD_ARCHIVE__
`;
}
