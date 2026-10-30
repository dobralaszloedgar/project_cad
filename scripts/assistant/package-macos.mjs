import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssistant } from './build.mjs';
import { registerArtifacts } from './artifacts.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'dist', 'assistant');
const release = JSON.parse(await readFile(join(root, 'scripts', 'assistant', 'releases.json'), 'utf8'));
const escaped = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
if (process.platform !== 'darwin') throw new Error('Build the macOS installer on a Mac.');
const staging = await mkdtemp(join(tmpdir(), 'project-cad-package-'));
async function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    bytes += entry.isDirectory() ? await directoryBytes(file) : (await stat(file)).size;
  }
  return bytes;
}

async function runtime(arch) {
  const filename = `node-v${release.node.version}-darwin-${arch}.tar.gz`;
  const cache = join(output, 'cache', filename);
  await mkdir(dirname(cache), { recursive: true });
  let archive;
  try { archive = await readFile(cache); } catch { /* Download a pinned runtime. */ }
  if (!archive || createHash('sha256').update(archive).digest('hex') !== release.node.sha256[arch]) {
    console.log(`Downloading the private Node runtime for ${arch}…`);
    const response = await fetch(`https://nodejs.org/dist/v${release.node.version}/${filename}`, { signal: AbortSignal.timeout(180000), redirect: 'error' });
    if (!response.ok) throw new Error(`Node download failed: ${response.status}`);
    archive = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(archive).digest('hex') !== release.node.sha256[arch]) throw new Error('Node runtime checksum mismatch.');
    await writeFile(cache, archive);
  }
  const directory = join(staging, `node-${arch}`); await mkdir(directory);
  await execute('/usr/bin/tar', ['-xzf', cache, '-C', directory], { timeout: 60000 });
  const extracted = join(directory, `node-v${release.node.version}-darwin-${arch}`);
  return { node: join(extracted, 'bin', 'node'), license: join(extracted, 'LICENSE') };
}

try {
  await mkdir(output, { recursive: true });
  const app = join(staging, 'Project CAD Assistant.app');
  const contents = join(app, 'Contents'), resources = join(contents, 'Resources');
  await mkdir(join(contents, 'MacOS'), { recursive: true });
  await buildAssistant(resources);
  const fetched = await Promise.allSettled(['arm64', 'x64'].map(async arch => [arch, await runtime(arch)]));
  for (const result of fetched) if (result.status === 'rejected') throw result.reason;
  const runtimes = Object.fromEntries(fetched.map(result => result.value));
  for (const arch of ['arm64', 'x64']) {
    const directory = join(resources, 'runtime', arch); await mkdir(directory, { recursive: true });
    await copyFile(runtimes[arch].node, join(directory, 'node')); await chmod(join(directory, 'node'), 0o755);
  }
  await copyFile(runtimes.arm64.license, join(resources, 'Node-LICENSE.txt'));
  console.log('Building the native launcher for Apple silicon and Intel…');
  const sdk = (await execute('/usr/bin/xcrun', ['--show-sdk-path'])).stdout.trim();
  const swift = join(root, 'scripts', 'assistant', 'native', 'ProjectCADAssistant.swift');
  for (const arch of ['arm64', 'x86_64']) {
    await execute('/usr/bin/xcrun', ['swiftc', '-O', '-parse-as-library', '-sdk', sdk, '-target', `${arch}-apple-macos13.5`, swift, '-o', join(staging, `launcher-${arch}`)], { timeout: 120000, maxBuffer: 2_000_000 });
  }
  await execute('/usr/bin/lipo', ['-create', join(staging, 'launcher-arm64'), join(staging, 'launcher-x86_64'), '-output', join(contents, 'MacOS', 'ProjectCADAssistant')]);
  await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Project CAD Assistant</string><key>CFBundleDisplayName</key><string>Project CAD Assistant</string><key>CFBundleIdentifier</key><string>com.projectcad.assistant.app</string><key>CFBundleExecutable</key><string>ProjectCADAssistant</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${release.version}</string><key>CFBundleVersion</key><string>${release.version}</string><key>LSMinimumSystemVersion</key><string>13.5</string><key>NSHighResolutionCapable</key><true/><key>NSAppleEventsUsageDescription</key><string>Project CAD opens the provider's sign-in command in Terminal when you choose Sign in.</string></dict></plist>`);
  await execute('/usr/bin/plutil', ['-lint', join(contents, 'Info.plist')]);
  await execute('/usr/bin/codesign', ['--force', '--sign', process.env.PROJECT_CAD_SIGN_IDENTITY || '-', '--deep', app], { timeout: 60000 });
  await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { timeout: 60000 });
  const finalApp = join(output, 'Project CAD Assistant.app');
  await rm(finalApp, { recursive: true, force: true }); await cp(app, finalApp, { recursive: true, preserveTimestamps: true });
  console.log('Building the per-user macOS installer…');
  const scripts = join(staging, 'installer-scripts'); await mkdir(scripts);
  await cp(app, join(scripts, 'Project CAD Assistant.app'), { recursive: true });
  const postinstall = `#!/bin/sh\nset -eu\nif [ "$(/usr/bin/id -u)" -eq 0 ]; then echo "Install Project CAD Assistant for your current user." >&2; exit 1; fi\nproject_cad_scripts="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nif [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = "1" ]; then project_cad_arch=arm64; else project_cad_arch=x64; fi\nproject_cad_source="$project_cad_scripts/Project CAD Assistant.app"\n"$project_cad_source/Contents/Resources/runtime/$project_cad_arch/node" "$project_cad_source/Contents/Resources/install.mjs" --source "$project_cad_source"\n/usr/bin/open "$HOME/Applications/Project CAD Assistant.app"\n`;
  await writeFile(join(scripts, 'postinstall'), postinstall, { mode: 0o755 });
  await execute('/bin/sh', ['-n', join(scripts, 'postinstall')]);
  const empty = join(staging, 'empty'); await mkdir(empty);
  await execute('/usr/bin/pkgbuild', ['--root', empty, '--scripts', scripts, '--identifier', 'com.projectcad.assistant', '--version', release.version, '--install-location', '/', join(staging, 'Assistant.pkg')], { timeout: 180000 });
  // The bootstrap installs the bundle, so the package builder cannot measure it.
  const expanded = join(staging, 'expanded-component');
  await execute('/usr/sbin/pkgutil', ['--expand', join(staging, 'Assistant.pkg'), expanded]);
  const infoPath = join(expanded, 'PackageInfo');
  const info = await readFile(infoPath, 'utf8');
  if (!/<payload\b[^>]*installKBytes="\d+"/.test(info)) throw new Error('Installer size metadata is missing.');
  const installedKilobytes = Math.ceil(await directoryBytes(app) / 1024);
  await writeFile(infoPath, info.replace(/(<payload\b[^>]*installKBytes=")\d+/, (_, prefix) => prefix + installedKilobytes));
  await rm(join(staging, 'Assistant.pkg'));
  await execute('/usr/sbin/pkgutil', ['--flatten', expanded, join(staging, 'Assistant.pkg')]);
  const pages = join(staging, 'pages'); await mkdir(pages);
  for (const [name, title, body] of [
    ['welcome', 'Project CAD Assistant', 'Install the local companion for Codex, Claude Code, and Muse. The private runtime is included. Existing settings, conversations, and project files are preserved.'],
    ['conclusion', 'Ready to connect', 'Open Project CAD Assistant from Applications in your home folder. Sign in to your provider, then open Project CAD in your browser and choose Connect local assistant. Startup at login can be changed in assistant settings.'],
  ]) await writeFile(join(pages, `${name}.html`), `<!doctype html><html><meta charset="utf-8"><style>body{font:13px -apple-system,Helvetica;color:CanvasText;background:Canvas;line-height:1.6;padding:18px}h1{color:#286e5c;font-size:25px}p{max-width:440px}</style><h1>${title}</h1><p>${body}</p></html>`);
  await writeFile(join(staging, 'Distribution'), `<?xml version="1.0" encoding="utf-8"?><installer-gui-script minSpecVersion="2"><title>Project CAD Assistant</title><welcome file="welcome.html" mime-type="text/html"/><conclusion file="conclusion.html" mime-type="text/html"/><options customize="never" require-scripts="true" hostArchitectures="arm64,x86_64"/><domains enable_anywhere="false" enable_currentUserHome="true" enable_localSystem="false"/><allowed-os-versions><os-version min="13.5"/></allowed-os-versions><choices-outline><line choice="assistant"/></choices-outline><choice id="assistant" visible="false"><pkg-ref id="com.projectcad.assistant"/></choice><pkg-ref id="com.projectcad.assistant" version="${escaped(release.version)}">Assistant.pkg</pkg-ref></installer-gui-script>`);
  const packageName = 'ProjectCAD-Assistant-macos-universal.pkg', packagePath = join(output, packageName);
  await rm(packagePath, { force: true });
  const sign = process.env.PROJECT_CAD_INSTALLER_IDENTITY ? ['--sign', process.env.PROJECT_CAD_INSTALLER_IDENTITY, '--timestamp'] : [];
  await execute('/usr/bin/productbuild', ['--distribution', join(staging, 'Distribution'), '--resources', pages, '--package-path', staging, ...sign, packagePath], { timeout: 180000 });
  const zipName = 'ProjectCAD-Assistant-macos-universal.zip', zipPath = join(output, zipName);
  await rm(zipPath, { force: true });
  await execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', finalApp, zipPath], { timeout: 180000 });
  const files = [];
  for (const filename of [packageName, zipName]) {
    const path = join(output, filename), sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
    files.push({ platform: 'macos', architecture: 'universal', filename, bytes: (await stat(path)).size, sha256 });
    await writeFile(`${path}.sha256`, `${sha256}  ${filename}\n`);
  }
  await registerArtifacts('macos', files.map(file => ({ filename: file.filename, architecture: 'universal', minimumMacOS: '13.5', signed: !!process.env.PROJECT_CAD_INSTALLER_IDENTITY, notarized: false })));
  await access(join(finalApp, 'Contents', 'MacOS', 'ProjectCADAssistant'));
  console.log(`Created ${packagePath}\nCreated ${zipPath}\nApplication: ${finalApp}`);
} finally { await rm(staging, { recursive: true, force: true }); }
