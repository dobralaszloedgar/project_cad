import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { output } from './artifacts.mjs';

const execute = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'project-cad-cross-package-check-'));
async function find(folder, name) {
  for (const file of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, file.name);
    if (file.name === name && file.isFile()) {
      if (name === 'manifest.json' && JSON.parse(await readFile(path, 'utf8')).name !== 'Project CAD Assistant') continue;
      return path;
    }
    if (file.isDirectory()) { const found = await find(path, name); if (found) return found; }
  }
}
function pe(data, architecture) {
  assert.equal(data.subarray(0, 2).toString(), 'MZ');
  const offset = data.readUInt32LE(0x3c);
  assert.equal(data.subarray(offset, offset + 4).toString(), 'PE\0\0');
  assert.equal(data.readUInt16LE(offset + 4), architecture === 'arm64' ? 0xaa64 : 0x8664);
}
function elf(data, architecture) {
  assert.equal(data.subarray(0, 4).toString(), '\x7fELF');
  assert.equal(data.readUInt16LE(18), architecture === 'arm64' ? 183 : 62);
}
try {
  const release = JSON.parse(await readFile(join(output, 'downloads.json'), 'utf8'));
  for (const entry of release.files.filter(file => file.platform !== 'macos')) {
    const path = join(output, entry.filename), data = await readFile(path);
    assert.equal(data.length, entry.bytes); assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
    const extracted = join(directory, entry.filename);
    if (entry.platform === 'windows') await execute('7zz', ['x', '-y', '-o' + extracted, path], { timeout: 60000, maxBuffer: 1000000 });
    else {
      const { mkdir } = await import('node:fs/promises'); await mkdir(extracted);
      let archive = path;
      if (entry.filename.endsWith('.run')) {
        const marker = Buffer.from('\n__PROJECT_CAD_ARCHIVE__\n'), index = data.indexOf(marker);
        assert.ok(index > 0); archive = join(directory, entry.filename + '.tgz'); await writeFile(archive, data.subarray(index + marker.length));
        const shell = join(directory, entry.filename + '.sh'); await writeFile(shell, data.subarray(0, index)); await execute('/bin/sh', ['-n', shell]);
      }
      await execute('/usr/bin/tar', ['-xzf', archive, '-C', extracted]);
    }
    const manifestPath = await find(extracted, 'manifest.json'); assert.ok(manifestPath);
    const folder = dirname(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.architecture, entry.architecture);
    assert.equal(manifest.platform, entry.platform === 'windows' ? 'win32' : 'linux');
    for (const [file, hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(await readFile(join(folder, file))).digest('hex'), hash, file);
    if (entry.platform === 'windows') {
      pe(await readFile(join(folder, 'runtime/node.exe')), entry.architecture);
      pe(await readFile(join(folder, 'Project CAD Assistant.exe')), entry.architecture);
    } else {
      elf(await readFile(join(folder, 'runtime/node')), entry.architecture);
      elf(await readFile(join(folder, 'project-cad-assistant')), entry.architecture);
    }
    console.log(JSON.stringify({ artifact: entry.filename, checksums: 'passed', archiveContents: 'passed', nativeArchitecture: 'passed' }));
  }
} finally { await rm(directory, { recursive: true, force: true }); }
