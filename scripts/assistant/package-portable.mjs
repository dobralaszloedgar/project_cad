import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildAssistant } from './build.mjs';
import { finalizeManifest, output, registerArtifacts } from './artifacts.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const release = JSON.parse(await readFile(join(root, 'scripts/assistant/releases.json'), 'utf8'));
const platform = process.argv[2];
if (!['win32', 'linux'].includes(platform)) throw new Error('Choose win32 or linux.');
const targetName = platform === 'win32' ? 'windows' : 'linux';
const temporary = await mkdtemp(join(tmpdir(), 'project-cad-' + targetName + '-'));
const nsisQuote = value => String(value).replaceAll('$', '$$').replaceAll('"', '$\\"');

async function runtime(arch) {
  const entry = release.node.targets[platform + '-' + arch];
  const archive = join(output, 'cache', entry.filename);
  await mkdir(dirname(archive), { recursive: true });
  let data;
  try { data = await readFile(archive); } catch { /* Download the pinned runtime. */ }
  if (!data || createHash('sha256').update(data).digest('hex') !== entry.sha256) {
    console.log(`Downloading ${targetName} ${arch} runtime…`);
    const response = await fetch(`https://nodejs.org/dist/v${release.node.version}/${entry.filename}`, { signal: AbortSignal.timeout(180000), redirect: 'error' });
    if (!response.ok) throw new Error('Runtime download failed: ' + response.status);
    data = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error('Runtime checksum mismatch.');
    await writeFile(archive, data);
  }
  const directory = join(temporary, 'runtime-' + arch); await mkdir(directory);
  await execute('/usr/bin/tar', ['-xf', archive, '-C', directory], { timeout: 60000 });
  const extracted = join(directory, entry.filename.replace(/\.zip$|\.tar\.gz$/g, ''));
  return { binary: join(extracted, platform === 'win32' ? 'node.exe' : 'bin/node'), license: join(extracted, 'LICENSE') };
}

try {
  await mkdir(output, { recursive: true });
  const downloads = await Promise.allSettled(['x64', 'arm64'].map(async arch => [arch, await runtime(arch)]));
  for (const result of downloads) if (result.status === 'rejected') throw result.reason;
  const runtimes = Object.fromEntries(downloads.map(result => result.value));
  const files = [];
  for (const arch of ['x64', 'arm64']) {
    console.log(`Building ${targetName} ${arch}…`);
    const name = `ProjectCAD-Assistant-${targetName}-${arch}`;
    const bundle = join(temporary, name);
    await buildAssistant(bundle);
    await mkdir(join(bundle, 'runtime'));
    await copyFile(runtimes[arch].binary, join(bundle, 'runtime', platform === 'win32' ? 'node.exe' : 'node'));
    await chmod(join(bundle, 'runtime', platform === 'win32' ? 'node.exe' : 'node'), 0o755);
    await copyFile(runtimes[arch].license, join(bundle, 'Node-LICENSE.txt'));
    const launcher = platform === 'win32' ? 'Project CAD Assistant.exe' : 'project-cad-assistant';
    await execute('go', ['build', '-trimpath', '-ldflags', '-s -w' + (platform === 'win32' ? ' -H=windowsgui' : ''), '-o', join(bundle, launcher), '.'], { cwd: join(root, 'scripts/assistant/native/launcher'), env: { ...process.env, GOOS: platform === 'win32' ? 'windows' : 'linux', GOARCH: arch === 'x64' ? 'amd64' : 'arm64', CGO_ENABLED: '0', GO111MODULE: 'off' }, timeout: 180000 });
    const start = platform === 'win32' ? 'Run Install.cmd, or use the Setup.exe installer. After installation, open Project CAD Assistant from Start. The portable launcher can also run directly from an extracted folder.' : 'Run ./install.sh, or use the .run installer. Then open Project CAD Assistant from your application menu. For a portable session, run ./project-cad-assistant from the extracted folder.';
    await writeFile(join(bundle, 'README.txt'), `Project CAD Assistant ${release.version}\n${targetName} ${arch}\n\n${start}\n\nThe Node runtime is included. Settings open in your browser on this computer, at 127.0.0.1:43119. The project connection uses 127.0.0.1:43118.\n\nSet the Project CAD website in assistant Settings. For local development, start the website at http://127.0.0.1:3000. In the project website, choose your agents and connect the assistant. Approve the request in the assistant app. Your choices appear there automatically. Complete any agent sign-in or Muse key setup here if needed, then return to your project.\n\nYour project files remain in the folder you selected. Conversations and settings are kept in your home folder under .project-cad/assistant. Updating or uninstalling the application preserves them.\n\nStartup at login can be changed in Settings. Close the settings browser tab freely; the assistant keeps running.\n\n${platform === 'win32' ? 'Requires 64-bit Windows 11 or Windows Server 2022 or newer. This local build is not code-signed. To uninstall, use Windows Settings > Apps (when installed with Setup.exe).' : 'Requires desktop Linux with glibc 2.28 or newer (for example Ubuntu 22.04+ or Debian 12+), tar, xdg-open, and a terminal emulator for provider sign-in. Alpine/musl is not supported by this package. Installation is per user; do not run with sudo. To remove the application, run project-cad-assistant uninstall first, then delete ~/.local/share/project-cad-assistant. Your .project-cad history folder remains.'}\n`);
    if (platform === 'win32') {
      await writeFile(join(bundle, 'Install.cmd'), '@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0app\\desktop.mjs" install "%~dp0."\r\nif errorlevel 1 pause\r\n');
    } else {
      await writeFile(join(bundle, 'install.sh'), '#!/bin/sh\nset -eu\nproject_cad_source="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$project_cad_source/runtime/node" "$project_cad_source/app/desktop.mjs" install "$project_cad_source" "$@"\n', { mode: 0o755 });
    }
    await finalizeManifest(bundle, platform, arch);
    if (platform === 'win32') {
      const filename = name + '-Setup.exe';
      const script = join(temporary, arch + '.nsi');
      const archGuard = arch === 'arm64' ? '${IsNativeARM64}' : '${IsNativeAMD64}';
      await writeFile(script, `Unicode True\n!include "MUI2.nsh"\n!include "x64.nsh"\nName "Project CAD Assistant"\nOutFile "${nsisQuote(join(output, filename))}"\nRequestExecutionLevel user\nSetCompressor /SOLID lzma\nSetCompressorDictSize 32\nInstallDir "$LOCALAPPDATA\\ProjectCAD\\Assistant"\n!define MUI_ABORTWARNING\n!insertmacro MUI_PAGE_WELCOME\n!insertmacro MUI_PAGE_INSTFILES\n!define MUI_FINISHPAGE_RUN "$INSTDIR\\Project CAD Assistant.exe"\n!insertmacro MUI_PAGE_FINISH\n!insertmacro MUI_UNPAGE_CONFIRM\n!insertmacro MUI_UNPAGE_INSTFILES\n!insertmacro MUI_LANGUAGE "English"\nFunction .onInit\n  SetShellVarContext current\n  StrCpy $INSTDIR "$LOCALAPPDATA\\ProjectCAD\\Assistant"\n  \${IfNot} ${archGuard}\n    MessageBox MB_ICONSTOP "This installer requires ${arch === 'arm64' ? 'ARM64' : 'x64'} Windows. Download the matching version for this PC."\n    Abort\n  \${EndIf}\nFunctionEnd\nSection "Assistant"\n  InitPluginsDir\n  SetOutPath "$PLUGINSDIR\\payload"\n  File /r "${nsisQuote(bundle)}/*"\n  ExecWait '\"$PLUGINSDIR\\payload\\runtime\\node.exe\" \"$PLUGINSDIR\\payload\\app\\desktop.mjs\" install \"$PLUGINSDIR\\payload\" \"$INSTDIR\" --no-start' $0\n  \${If} $0 != 0\n    MessageBox MB_ICONSTOP "Project CAD Assistant could not be installed. Existing settings and history were preserved."\n    Abort\n  \${EndIf}\n  CreateDirectory "$SMPROGRAMS\\Project CAD"\n  CreateShortcut "$SMPROGRAMS\\Project CAD\\Project CAD Assistant.lnk" "$INSTDIR\\Project CAD Assistant.exe"\n  WriteUninstaller "$INSTDIR\\Uninstall.exe"\n  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "DisplayName" "Project CAD Assistant"\n  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "DisplayVersion" "${release.version}"\n  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "UninstallString" '$\\"$INSTDIR\\Uninstall.exe$\\"'\n  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "NoModify" 1\n  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant" "NoRepair" 1\nSectionEnd\nSection "Uninstall"\n  SetShellVarContext current\n  ExecWait '\"$INSTDIR\\runtime\\node.exe\" \"$INSTDIR\\app\\desktop.mjs\" uninstall' $0\n  \${If} $0 != 0\n    MessageBox MB_ICONSTOP "Close the assistant and try uninstalling again."\n    Abort\n  \${EndIf}\n  Delete "$SMPROGRAMS\\Project CAD\\Project CAD Assistant.lnk"\n  RMDir "$SMPROGRAMS\\Project CAD"\n  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProjectCADAssistant"\n  RMDir /r "$INSTDIR"\nSectionEnd\n`);
      await execute('makensis', ['-V2', script], { timeout: 180000, maxBuffer: 1000000 });
      files.push({ filename, architecture: arch, signed: false });
      const zip = name + '.zip';
      await execute('/usr/bin/ditto', ['-c', '-k', '--keepParent', bundle, join(output, zip)], { timeout: 180000 });
      files.push({ filename: zip, architecture: arch });
    } else {
      const archive = name + '.tar.gz';
      await execute('/usr/bin/tar', ['--no-xattrs', '--no-acls', '--no-fflags', '-czf', join(output, archive), '-C', temporary, name], { env: { ...process.env, COPYFILE_DISABLE: '1' }, timeout: 180000 });
      files.push({ filename: archive, architecture: arch });
      const payload = join(temporary, arch + '-payload.tar.gz');
      await execute('/usr/bin/tar', ['--no-xattrs', '--no-acls', '--no-fflags', '-czf', payload, '-C', bundle, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' }, timeout: 180000 });
      const header = `#!/bin/sh\nset -eu\nif [ "$(id -u)" = 0 ]; then echo "Install Project CAD Assistant as your normal user, without sudo." >&2; exit 1; fi\ncase "$(uname -m)" in ${arch === 'x64' ? 'x86_64|amd64' : 'aarch64|arm64'}) ;; *) echo "This installer requires ${arch} Linux." >&2; exit 1 ;; esac\nproject_cad_stage="$(mktemp -d)"\ntrap 'rm -rf "$project_cad_stage"' EXIT HUP INT TERM\nproject_cad_line="$(awk '/^__PROJECT_CAD_ARCHIVE__$/ {print NR + 1; exit}' "$0")"\ntail -n +"$project_cad_line" "$0" | tar -xz -C "$project_cad_stage"\n"$project_cad_stage/runtime/node" "$project_cad_stage/app/desktop.mjs" install "$project_cad_stage" "$@"\nexit 0\n__PROJECT_CAD_ARCHIVE__\n`;
      const filename = name + '.run';
      await writeFile(join(output, filename), Buffer.concat([Buffer.from(header), await readFile(payload)]), { mode: 0o755 });
      await chmod(join(output, filename), 0o755);
      files.push({ filename, architecture: arch });
    }
  }
  await registerArtifacts(targetName, files);
  console.log('Created ' + files.map(file => file.filename).join(', '));
} finally { await rm(temporary, { recursive: true, force: true }); }
