import { cp, mkdir, rename, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const execute = promisify(execFile);
const args = process.argv.slice(2);
const option = key => args[args.indexOf(key) + 1];
if (!args.includes('--source')) throw new Error('Choose the packaged application to install.');
if (process.getuid?.() === 0) throw new Error('Install Project CAD Assistant for your current macOS user.');
const source = resolve(option('--source'));
const destination = args.includes('--destination') ? resolve(option('--destination')) : join(homedir(), 'Applications', 'Project CAD Assistant.app');
const staging = `${destination}.install-${randomUUID()}`;
const previous = `${destination}.previous-${randomUUID()}`;
const runtime = app => join(app, 'Contents', 'Resources', 'runtime', process.arch, 'node');
const controller = app => join(app, 'Contents', 'Resources', 'app', 'control.mjs');
const exists = async file => { try { await access(file); return true; } catch { return false; } };
let backedUp = false, promoted = false;
try {
  await access(controller(source)); await access(runtime(source));
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, staging, { recursive: true, preserveTimestamps: true });
  await execute(runtime(staging), [controller(staging), 'doctor'], { timeout: 10000 });
  if (await exists(destination)) {
    if (!args.includes('--no-start')) await execute(runtime(destination), [controller(destination), 'stop'], { timeout: 25000 });
    await rename(destination, previous); backedUp = true;
  }
  await rename(staging, destination); promoted = true;
  if (!args.includes('--no-start')) await execute(runtime(destination), [controller(destination), 'start'], { timeout: 30000 });
  console.log(JSON.stringify({ installed: destination, started: !args.includes('--no-start'), historyPreserved: true }));
} catch (error) {
  if (promoted) await rm(destination, { recursive: true, force: true });
  if (backedUp) {
    await rename(previous, destination);
    if (!args.includes('--no-start')) await execute(runtime(destination), [controller(destination), 'start'], { timeout: 30000 }).catch(() => {});
  }
  throw error;
} finally { await rm(staging, { recursive: true, force: true }); }
// Cleanup cannot roll back an application that has already started successfully.
if (backedUp) await rm(previous, { recursive: true, force: true }).catch(() => {});
