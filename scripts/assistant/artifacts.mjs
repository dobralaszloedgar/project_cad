import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const output = fileURLToPath(new URL('../../dist/assistant/', import.meta.url));
export async function registerArtifacts(platform, files) {
  const path = join(output, 'downloads.json');
  const { version } = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
  let manifest;
  try { manifest = JSON.parse(await readFile(path, 'utf8')); }
  catch { manifest = { name: 'Project CAD Assistant', version, files: [] }; }
  // A version bump starts a fresh inventory; older platform builds cannot leak into it.
  if (manifest.version !== version) manifest = { name: 'Project CAD Assistant', version, files: [] };
  const entries = [];
  for (const { filename, architecture, ...extra } of files) {
    const data = await readFile(join(output, filename));
    const sha256 = createHash('sha256').update(data).digest('hex');
    entries.push({ platform, architecture, filename, bytes: data.length, sha256, ...extra });
    await writeFile(join(output, filename + '.sha256'), sha256 + '  ' + filename + '\n');
  }
  manifest.files = [...manifest.files.filter(file => file.platform !== platform), ...entries];
  await writeFile(path, JSON.stringify({ name: manifest.name, version: manifest.version, files: manifest.files }, null, 2) + '\n');
}
export async function finalizeManifest(directory, platform, architecture) {
  const path = join(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const files = {};
  async function walk(folder) {
    for (const name of await readdir(folder)) {
      const file = join(folder, name);
      if (file === path) continue;
      if ((await stat(file)).isDirectory()) await walk(file);
      else files[file.slice(directory.length + 1)] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
  }
  await walk(directory);
  await writeFile(path, JSON.stringify({ ...manifest, platform, architecture, files }, null, 2) + '\n');
}
