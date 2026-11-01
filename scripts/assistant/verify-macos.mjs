import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm, appendFile, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'dist', 'assistant');
const app = join(output, 'Project CAD Assistant.app');
const temporary = await mkdtemp(join(tmpdir(), 'project-cad-package-test-'));
const resources = folder => join(folder, 'Contents', 'Resources');
const node = folder => join(resources(folder), 'runtime', process.arch, 'node');
const controller = folder => join(resources(folder), 'app', 'control.mjs');
const env = { ...process.env, PATH: '/usr/bin:/bin', PROJECT_CAD_ASSISTANT_DATA: join(temporary, 'preserved') };
let child;
let serviceEnv, installed;
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
  const source = join(installerScripts, 'Project CAD Assistant.app');
  installed = join(temporary, 'Applications', 'Project CAD Assistant.app');
  await mkdir(env.PROJECT_CAD_ASSISTANT_DATA, { recursive: true });
  const history = join(env.PROJECT_CAD_ASSISTANT_DATA, 'conversations.sqlite');
  await writeFile(history, 'existing-conversation-data');
  const install = async folder => execute(node(folder), [join(resources(folder), 'install.mjs'), '--source', folder, '--destination', installed, '--no-start'], { env, cwd: temporary, timeout: 60000 });
  await install(source);
  await install(source);
  assert.equal(await readFile(history, 'utf8'), 'existing-conversation-data');
  await appendFile(join(resources(source), 'app', 'assistant.mjs'), '\n// Corrupted payload fixture\n');
  await assert.rejects(install(source), /failed verification/);
  await execute(node(installed), [controller(installed), 'doctor'], { env, cwd: temporary });
  assert.equal(await readFile(history, 'utf8'), 'existing-conversation-data');

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
  const registered = await execute('/bin/launchctl', ['print', `gui/${process.getuid()}/com.projectcad.assistant`]).then(() => true, () => false);
  const persistent = await access(join(homedir(), 'Library', 'LaunchAgents', 'com.projectcad.assistant.plist')).then(() => true, () => false);
  let backgroundService = 'skipped: existing user service preserved';
  if (!registered && !persistent) {
    const data = join(temporary, 'service-data');
    await mkdir(data); await writeFile(join(data, 'settings.json'), JSON.stringify({ startAtLogin: false, agents: { providers: ['muse'], preferred: 'muse' } }));
    serviceEnv = { ...env, PROJECT_CAD_ASSISTANT_DATA: data, PROJECT_CAD_ASSISTANT_PORT: String(port) };
    const started = JSON.parse((await execute(node(installed), [controller(installed), 'start'], { env: serviceEnv, cwd: temporary, timeout: 30000 })).stdout);
    assert.equal(started.running, true); assert.equal(started.managed, true);
    const stopped = JSON.parse((await execute(node(installed), [controller(installed), 'stop'], { env: serviceEnv, cwd: temporary, timeout: 30000 })).stdout);
    assert.equal(stopped.running, false); assert.equal(stopped.managed, false);
    serviceEnv = undefined; backgroundService = 'passed: temporary service started and stopped';
  }
  console.log(JSON.stringify({ nativeLauncher: 'passed', universalArchitectures: 'passed', checksums: 'passed', currentUserInstaller: 'passed', installAndUpdate: 'passed', corruptedUpdateRejected: 'passed', historyPreserved: 'passed', standaloneRuntimeAndPairing: 'passed', backgroundService, providers: providers.map(({ id, available, models }) => ({ id, available, models: models.length })) }, null, 2));
} finally {
  if (serviceEnv) await execute(node(installed), [controller(installed), 'stop'], { env: serviceEnv, timeout: 30000 }).catch(() => {});
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  await rm(temporary, { recursive: true, force: true });
}
