// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, appendFile, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { verifyPackageKit } from './verify-packagekit.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'dist', 'assistant');
const app = join(output, 'Project CAD Assistant.app');
const temporary = await mkdtemp(join(tmpdir(), 'project-cad-package-test-'));
const resources = folder => join(folder, 'Contents', 'Resources');
const node = folder => join(resources(folder), 'runtime', process.arch, 'node');
const controller = folder => join(resources(folder), 'app', 'control.mjs');
const serviceLabel = `com.projectcad.assistant.verify-${randomUUID()}`;
const env = { ...process.env, PATH: '/usr/bin:/bin', PROJECT_CAD_NO_DESKTOP_OPEN: '1', PROJECT_CAD_ASSISTANT_DATA: join(temporary, 'preserved'), PROJECT_CAD_ASSISTANT_SERVICE_LABEL: serviceLabel, PROJECT_CAD_ASSISTANT_PORT: '0' };
let child, delayedSessionPid;
let serviceEnv, installed;
function processExited(pid) {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw error; }
}
async function servicePid() {
  const description = (await execute('/bin/launchctl', ['print', `gui/${process.getuid()}/${serviceLabel}`])).stdout;
  const pid = Number(description.match(/^\s*pid = (\d+)\s*$/m)?.[1]);
  assert.ok(pid > 0, 'The running service must have a PID');
  return pid;
}
try {
  const manifest = JSON.parse(await readFile(join(output, 'downloads.json'), 'utf8'));
  for (const file of manifest.files) {
    const data = await readFile(join(output, file.filename));
    assert.equal(data.length, file.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
  }
  await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const architectures = (await execute('/usr/bin/lipo', ['-archs', join(app, 'Contents', 'MacOS', 'ProjectCADAssistant')])).stdout;
  assert.match(architectures, /arm64/); assert.match(architectures, /x86_64/);
  const native = await execute(join(app, 'Contents', 'MacOS', 'ProjectCADAssistant'), ['--diagnostics'], { env, cwd: temporary, timeout: 20000 });
  assert.match(JSON.parse(native.stdout).node, /^v24\./);

  const expanded = join(temporary, 'expanded');
  await execute('/usr/sbin/pkgutil', ['--expand-full', join(output, 'ProjectCAD-Assistant-macos-universal.pkg'), expanded], { timeout: 60000 });
  const distribution = await readFile(join(expanded, 'Distribution'), 'utf8');
  assert.match(distribution, /enable_currentUserHome="true"/);
  assert.match(distribution, /enable_localSystem="false"/);
  const domains = (await execute('/usr/sbin/installer', ['-pkg', join(output, 'ProjectCAD-Assistant-macos-universal.pkg'), '-dominfo'])).stdout.trim();
  assert.equal(domains, 'CurrentUserHomeDirectory');
  const info = await readFile(join(expanded, 'Assistant.pkg', 'PackageInfo'), 'utf8');
  assert.ok(Number(info.match(/installKBytes="(\d+)"/)?.[1]) > 100000);
  const installerScripts = join(expanded, 'Assistant.pkg', 'Scripts');
  await execute('/bin/sh', ['-n', join(installerScripts, 'postinstall')]);
  const postinstall = await readFile(join(installerScripts, 'postinstall'), 'utf8');
  const source = join(installerScripts, 'Project CAD Assistant.app');
  installed = join(temporary, 'Applications', 'Project CAD Assistant.app');
  await mkdir(env.PROJECT_CAD_ASSISTANT_DATA, { recursive: true });
  const history = join(env.PROJECT_CAD_ASSISTANT_DATA, 'conversations.sqlite');
  await writeFile(history, 'existing-conversation-data');
  const install = async (folder, installEnv = env, noStart = true) => execute(node(folder), [join(resources(folder), 'install.mjs'), '--source', folder, '--destination', installed, ...(noStart ? ['--no-start'] : [])], { env: installEnv, cwd: temporary, timeout: 90000 });
  await install(source);
  await writeFile(join(installed, 'obsolete-file'), 'old version only');
  const staleBackup = `${installed}.previous-${randomUUID()}`;
  await mkdir(staleBackup);
  await writeFile(join(staleBackup, 'old-runtime'), 'partial old version');
  await install(source);
  await assert.rejects(access(join(installed, 'obsolete-file')), { code: 'ENOENT' });
  assert.equal((await readdir(dirname(installed))).some(name => name.includes('.previous-') || name.includes('.install-')), false);
  assert.equal(await readFile(history, 'utf8'), 'existing-conversation-data');
  await appendFile(join(resources(source), 'app', 'assistant.mjs'), '\n// Corrupted payload fixture\n');
  await assert.rejects(install(source), /failed verification/);
  await execute(node(installed), [controller(installed), 'doctor'], { env, cwd: temporary });
  assert.equal(await readFile(history, 'utf8'), 'existing-conversation-data');
  await rm(expanded, { recursive: true, force: true });

  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const address = `http://127.0.0.1:${port}`, origin = 'http://127.0.0.1:3000';
  child = spawn(node(installed), [join(resources(installed), 'app', 'assistant.mjs')], {
    cwd: temporary,
    env: { ...env, PATH: dirname(node(installed)) + ':/usr/bin:/bin', PROJECT_CAD_ASSISTANT_DATA: join(temporary, 'runtime-data'), PROJECT_CAD_ASSISTANT_PORT: String(port), MODEL_API_KEY: '', META_AI_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', value => { logs += value; });
  child.stderr.on('data', value => { logs += value; });
  const until = Date.now() + 15000;
  for (;;) {
    try { const value = await (await fetch(address + '/health')).json(); assert.equal(value.name, 'Project CAD assistant'); break; }
    catch { if (Date.now() > until || child.exitCode !== null) throw new Error('Packaged server did not start: ' + logs); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal((await fetch(address + '/providers')).status, 401);
  const nonce = randomUUID();
  const pendingResponse = await fetch(address + '/connections', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce, agents: { providers: ['muse'], preferred: 'muse' } }) });
  assert.equal(pendingResponse.status, 202);
  const pending = await pendingResponse.json();
  assert.deepEqual(await (await fetch(address + '/connections/' + pending.id, { headers: { Origin: origin } })).json(), { status: 'pending' });
  const consentEnv = { ...env, PROJECT_CAD_ASSISTANT_DATA: join(temporary, 'runtime-data'), PROJECT_CAD_ASSISTANT_PORT: String(port) };
  const before = JSON.parse((await execute(node(installed), [controller(installed), 'status'], { env: consentEnv })).stdout);
  assert.equal(before.connections[0].id, pending.id);
  assert.deepEqual(before.agents, { providers: ['muse'], preferred: 'muse' });
  await execute(node(installed), [controller(installed), 'approve-connection', pending.id], { env: consentEnv });
  const approved = await (await fetch(address + '/connections/' + pending.id, { headers: { Origin: origin } })).json();
  assert.equal(approved.status, 'connected'); assert.equal(approved.nonce, nonce); assert.ok(approved.token);
  const preferenceHeaders = { Origin: origin, Authorization: 'Bearer ' + approved.token, 'x-project-cad-client': randomUUID(), 'Content-Type': 'application/json' };
  const preferences = await (await fetch(address + '/connector/settings', { headers: preferenceHeaders })).json();
  assert.equal(preferences.accessMode, 'yolo');
  assert.deepEqual(Object.keys(preferences).sort(), ['accessMode', 'projectsDirectory']);
  const nextPreferences = { accessMode: 'sandbox', projectsDirectory: join(temporary, 'cad-projects') };
  const savedPreferences = await fetch(address + '/connector/settings', { method: 'POST', headers: preferenceHeaders, body: JSON.stringify(nextPreferences) });
  assert.equal(savedPreferences.status, 200);
  assert.deepEqual(await savedPreferences.json(), nextPreferences);
  assert.deepEqual(await (await fetch(address + '/connector/settings', { headers: preferenceHeaders })).json(), nextPreferences);
  assert.equal(JSON.parse(await readFile(join(temporary, 'runtime-data', 'settings.json'), 'utf8')).accessMode, 'sandbox');
  assert.equal((await fetch(address + '/providers', { headers: { Origin: origin, Authorization: 'Bearer ' + approved.token, 'x-project-cad-client': randomUUID() } })).status, 200);

  const connect = await fetch(address + '/connect?origin=' + encodeURIComponent(origin) + '&providers=muse&preferred=muse&nonce=' + randomUUID());
  const form = await connect.text();
  const csrf = form.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf, 'Pairing form should contain a one-use token');
  const paired = await fetch(address + '/connect', { method: 'POST', headers: { Origin: address, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf }) });
  const html = await paired.text(), token = html.match(/"token":"([^"]+)"/)?.[1];
  assert.ok(token, 'Pairing should return a connection token');
  const response = await fetch(address + '/providers', { headers: { Origin: origin, Authorization: 'Bearer ' + token, 'x-project-cad-client': randomUUID() } });
  assert.equal(response.status, 200);
  const providers = await response.json();
  assert.deepEqual(providers.map(item => item.id).sort(), ['muse']);
  child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve));
  const registered = await execute('/bin/launchctl', ['print', `gui/${process.getuid()}/${serviceLabel}`]).then(() => true, () => false);
  const persistent = await access(join(homedir(), 'Library', 'LaunchAgents', `${serviceLabel}.plist`)).then(() => true, () => false);
  let backgroundService = 'skipped: existing user service preserved';
  let runningUpdates = 'skipped: existing user service preserved';
  let packageKit = 'skipped: existing user service preserved';
  if (!registered && !persistent) {
    const data = join(temporary, 'service-data');
    await mkdir(data); await writeFile(join(data, 'settings.json'), JSON.stringify({ startAtLogin: false, agents: { providers: ['muse'], preferred: 'muse' } }));
    serviceEnv = { ...env, PROJECT_CAD_ASSISTANT_DATA: data, PROJECT_CAD_ASSISTANT_PORT: String(port) };
    const started = JSON.parse((await execute(node(installed), [controller(installed), 'start'], { env: serviceEnv, cwd: temporary, timeout: 30000 })).stdout);
    assert.equal(started.running, true); assert.equal(started.managed, true);
    const originalPid = await servicePid();
    const stopped = JSON.parse((await execute(node(installed), [controller(installed), 'stop'], { env: serviceEnv, cwd: temporary, timeout: 30000 })).stdout);
    assert.equal(stopped.running, false); assert.equal(stopped.managed, false);
    assert.equal(processExited(originalPid), true);

    // A previous version may stop HTTP before its provider/session child exits.
    // The detached child deliberately finishes after the parent; replacement
    // must wait for both, even once launchd no longer lists the old service.
    const oldFile = join(installed, 'old-session-files');
    const sessionResult = join(data, 'session-exited.json');
    const sessionPidFile = join(data, 'session.pid');
    const sessionScript = `
      const fs = require('node:fs');
      process.on('SIGTERM', () => setTimeout(() => {
        fs.writeFileSync(${JSON.stringify(sessionResult)}, JSON.stringify({ oldFilesPresent: fs.existsSync(${JSON.stringify(oldFile)}) }));
        process.exit(0);
      }, 1600));
      setInterval(() => {}, 1000);
      process.send('ready');
    `;
    await writeFile(join(resources(installed), 'app', 'assistant.mjs'), `
      import { createServer } from 'node:http';
      import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      const session = spawn(process.execPath, ['-e', ${JSON.stringify(sessionScript)}], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      writeFileSync(${JSON.stringify(sessionPidFile)}, String(session.pid));
      const server = createServer((request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ name: 'Project CAD assistant', version: 1 })); });
      session.once('message', () => server.listen(Number(process.env.PROJECT_CAD_ASSISTANT_PORT), '127.0.0.1'));
      process.on('SIGTERM', () => { server.closeAllConnections(); server.close(); session.kill('SIGTERM'); setTimeout(() => process.exit(0), 300); });
    `);
    for (const noStart of [true, false]) {
      await writeFile(oldFile, 'keep until the old session fully exits');
      await execute(node(installed), [controller(installed), 'start'], { env: serviceEnv, cwd: temporary, timeout: 30000 });
      const previousPid = await servicePid();
      if (noStart) delayedSessionPid = Number(await readFile(sessionPidFile, 'utf8'));
      const savedSettings = await readFile(join(data, 'settings.json'), 'utf8');
      const result = JSON.parse((await install(app, serviceEnv, noStart)).stdout);
      assert.equal(result.started, !noStart);
      assert.equal(processExited(previousPid), true, 'Old runtime must exit before install returns');
      if (noStart) {
        assert.equal(processExited(delayedSessionPid), true, 'Old session process must fully exit');
        assert.equal(JSON.parse(await readFile(sessionResult, 'utf8')).oldFilesPresent, true, 'Old files must remain until session shutdown finishes');
        delayedSessionPid = undefined;
      }
      assert.equal(await readFile(join(data, 'settings.json'), 'utf8'), savedSettings);
      assert.equal(await readFile(history, 'utf8'), 'existing-conversation-data');
      await assert.rejects(access(oldFile), { code: 'ENOENT' });
      const after = JSON.parse((await execute(node(installed), [controller(installed), 'status'], { env: serviceEnv })).stdout);
      assert.equal(after.running, !noStart); assert.equal(after.managed, !noStart);
      if (!noStart) {
        const nextPid = await servicePid();
        assert.notEqual(nextPid, previousPid);
        await execute(node(installed), [controller(installed), 'stop'], { env: serviceEnv, timeout: 60000 });
        assert.equal(processExited(nextPid), true);
      }
    }
    runningUpdates = 'passed: old runtime and delayed session exited before replacement; restart and no-start upgrades preserved settings/history';
    await execute(node(installed), [controller(installed), 'start'], { env: serviceEnv, cwd: temporary, timeout: 30000 });
    const beforePackageKit = await servicePid();
    const result = await verifyPackageKit({ app, installed, env: serviceEnv, temporary, postinstall, version: manifest.version });
    await writeFile(join(output, 'packagekit-verification.log'), result.stdout + result.stderr);
    assert.equal(processExited(beforePackageKit), true);
    const afterPackageKit = await servicePid();
    assert.notEqual(afterPackageKit, beforePackageKit);
    const packageStatus = JSON.parse((await execute(node(installed), [controller(installed), 'status'], { env: serviceEnv })).stdout);
    assert.equal(packageStatus.running, true); assert.equal(packageStatus.managed, true);
    await execute(node(installed), [controller(installed), 'doctor'], { env: serviceEnv });
    assert.equal(await readFile(history, 'utf8'), 'existing-conversation-data');
    await execute(node(installed), [controller(installed), 'stop'], { env: serviceEnv, timeout: 60000 });
    assert.equal(processExited(afterPackageKit), true);
    packageKit = 'passed: actual macOS package-script service installed a running update and restarted the isolated connector';
    serviceEnv = undefined; backgroundService = 'passed: temporary service started and stopped';
  }
  console.log(JSON.stringify({ nativeLauncher: 'passed', universalArchitectures: 'passed', checksums: 'passed', currentUserInstaller: 'passed', installAndUpdate: 'passed', corruptedUpdateRejected: 'passed', historyPreserved: 'passed', standaloneRuntimeAndPairing: 'passed', nativeInlineConsent: 'passed', connectorPreferences: 'passed: saved without reconnecting', backgroundService, runningUpdates, packageKit, providers: providers.map(({ id, available, models }) => ({ id, available, models: models.length })) }, null, 2));
} finally {
  if (delayedSessionPid && !processExited(delayedSessionPid)) process.kill(delayedSessionPid, 'SIGTERM');
  if (serviceEnv) await execute(node(installed), [controller(installed), 'stop'], { env: serviceEnv, timeout: 60000 }).catch(() => {});
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  await rm(temporary, { recursive: true, force: true });
}
