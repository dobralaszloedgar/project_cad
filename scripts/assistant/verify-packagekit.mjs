import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

// Exercise PackageKit's script-service environment, where socket QoS differs
// from Terminal. Only the test bundle, data, service label, and receipt change.
export async function verifyPackageKit({ app, installed, env, temporary, postinstall, version }) {
  const root = join(temporary, 'packagekit');
  const scripts = join(root, 'scripts'), empty = join(root, 'empty');
  const identifier = `${env.PROJECT_CAD_ASSISTANT_SERVICE_LABEL}.package`;
  await mkdir(scripts, { recursive: true });
  await mkdir(empty);
  await cp(app, join(scripts, 'Project CAD Assistant.app'), { recursive: true });
  const argumentsText = '--source "$project_cad_source"';
  const openText = '/usr/bin/open "$HOME/Applications/Project CAD Assistant.app"';
  assert.ok(postinstall.includes(argumentsText) && postinstall.includes(openText));
  const environment = ['PROJECT_CAD_ASSISTANT_DATA', 'PROJECT_CAD_ASSISTANT_SERVICE_LABEL', 'PROJECT_CAD_ASSISTANT_PORT', 'PROJECT_CAD_NO_DESKTOP_OPEN']
    .map(key => `export ${key}=${quote(env[key])}`).join('\n');
  const script = postinstall
    .replace('set -eu\n', `set -eu\n${environment}\n`)
    .replace(argumentsText, `${argumentsText} --destination ${quote(installed)}`)
    .replace(openText, ': # Verification does not open a window.');
  await writeFile(join(scripts, 'postinstall'), script, { mode: 0o755 });
  await execute('/bin/sh', ['-n', join(scripts, 'postinstall')]);
  await execute('/usr/bin/pkgbuild', ['--root', empty, '--scripts', scripts, '--identifier', identifier, '--version', version, '--install-location', '/', join(root, 'Assistant.pkg')], { timeout: 180000 });
  await rm(scripts, { recursive: true, force: true });
  await writeFile(join(root, 'Distribution'), `<?xml version="1.0" encoding="utf-8"?><installer-gui-script minSpecVersion="2"><title>Project CAD isolated installer verification</title><options customize="never" require-scripts="true"/><domains enable_anywhere="false" enable_currentUserHome="true" enable_localSystem="false"/><choices-outline><line choice="assistant"/></choices-outline><choice id="assistant" visible="false"><pkg-ref id="${identifier}"/></choice><pkg-ref id="${identifier}" version="${version}">Assistant.pkg</pkg-ref></installer-gui-script>`);
  const pkg = join(root, 'Verify.pkg');
  await execute('/usr/bin/productbuild', ['--distribution', join(root, 'Distribution'), '--package-path', root, pkg], { timeout: 180000 });
  await rm(join(root, 'Assistant.pkg'));
  try {
    return await execute('/usr/sbin/installer', ['-pkg', pkg, '-target', 'CurrentUserHomeDirectory', '-dumplog'], { timeout: 180000, maxBuffer: 2_000_000 });
  } finally {
    // Forget only this UUID-labelled test receipt, never the product's receipt.
    await execute('/usr/sbin/pkgutil', ['--volume', homedir(), '--forget', identifier]).catch(() => {});
  }
}
