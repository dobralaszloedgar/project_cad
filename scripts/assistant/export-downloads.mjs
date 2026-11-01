import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, stat, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { output } from './artifacts.mjs';

const manifest = JSON.parse(await readFile(join(output, 'downloads.json'), 'utf8'));
const parent = join(homedir(), 'Downloads');
let destination = join(parent, 'Project CAD Assistant');
if (await access(destination).then(() => true, () => false)) destination += ' ' + new Date().toISOString().replace(/[:.]/g, '-');
await mkdir(destination, { recursive: true });
const directories = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
const hashes = [];
for (const file of manifest.files) {
  const directory = directories[file.platform];
  if (!directory || !/^ProjectCAD-Assistant-[a-zA-Z0-9.-]+$/.test(file.filename)) throw new Error('Invalid artifact name.');
  const source = join(output, file.filename), data = await readFile(source);
  if (data.length !== file.bytes || createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error('Release checksum mismatch.');
  await mkdir(join(destination, directory), { recursive: true });
  const target = join(destination, directory, file.filename);
  await cp(source, target, { preserveTimestamps: true });
  await cp(source + '.sha256', target + '.sha256');
  if ((await stat(target)).size !== file.bytes || createHash('sha256').update(await readFile(target)).digest('hex') !== file.sha256) throw new Error('Copied artifact failed verification.');
  hashes.push(file.sha256 + '  ' + directory + '/' + file.filename);
}
const app = join(output, 'Project CAD Assistant.app');
if (await access(app).then(() => true, () => false)) await cp(app, join(destination, 'macOS', 'Project CAD Assistant.app'), { recursive: true, preserveTimestamps: true });
await writeFile(join(destination, 'downloads.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(destination, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
await writeFile(join(destination, 'START HERE.txt'), `Project CAD Assistant ${manifest.version}\n\nChoose the folder for your operating system.\n\nmacOS: open the universal .pkg installer, or use Project CAD Assistant.app. Supports Apple silicon and Intel. This local build is not notarized.\n\nWindows: open the matching x64 or ARM64 Setup.exe. It installs for your user, without administrator access. The ZIP is a portable alternative. These builds are unsigned; they have been cross compiled and inspected, but not run on a Windows machine.\n\nLinux: choose x64 for Intel/AMD PCs, or ARM64 for ARM PCs. Make the .run file executable and run it as your normal user (without sudo). A tar.gz archive with install.sh is also included. Requires desktop Linux with glibc 2.28+; not Alpine.\n\nAll builds include their own Node runtime. Project CAD Assistant provides the local AI connection; the Project CAD website runs separately. Set its URL in assistant Settings. The default website is https://projectcad.vercel.app. Local development at http://127.0.0.1:3000 is also supported.\n\nChoose your agents in the project website, install and open the desktop assistant, then return to the website and connect. Approve the request in the desktop app. Your choices appear there automatically. Complete any agent sign-in or Muse key setup there if needed.\n\nWindows and Linux settings open locally in your browser. Conversations stay in your home folder under .project-cad/assistant. Installation updates preserve this folder. Your project JSON files stay where you selected them.\n\nSHA256SUMS.txt records every installer and archive checksum.\n`);
console.log(JSON.stringify({ downloadsFolder: destination, packages: manifest.files.length, copiedAndVerified: true }, null, 2));
