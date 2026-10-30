import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'project-cad-provider-install-test-'));
const control = join(root, 'dist', 'assistant', 'payload', 'app', 'control.mjs');
try {
  for (const provider of ['codex', 'claude']) {
    // Simulate missing user tools without changing any actual provider installation.
    const env = { ...process.env, PROJECT_CAD_ASSISTANT_DATA: temporary, PROJECT_CAD_CODEX_BIN: join(temporary, 'missing'), PROJECT_CAD_CLAUDE_BIN: join(temporary, 'missing') };
    const result = JSON.parse((await execute(process.execPath, [control, 'install-provider', provider], { env, timeout: 240000 })).stdout);
    assert.equal(result.installed, true);
    assert.equal(result.path, join(temporary, 'providers', provider, provider));
    const version = (await execute(result.path, ['--version'], { timeout: 30000 })).stdout.trim();
    const help = (await execute(result.path, [provider === 'codex' ? 'login' : 'auth', '--help'], { timeout: 30000 })).stdout;
    assert.match(help, /login/i);
    if (provider === 'codex') {
      const executable = await realpath(result.path);
      await access(join(dirname(executable), 'codex-code-mode-host'));
      await access(join(dirname(executable), '..', 'codex-resources', 'voice', 'NOTICE.md'));
    }
    const reuseEnv = { ...env, PROJECT_CAD_CODEX_BIN: '', PROJECT_CAD_CLAUDE_BIN: '' };
    const reused = JSON.parse((await execute(process.execPath, [control, 'install-provider', provider], { env: reuseEnv, timeout: 10000 })).stdout);
    assert.equal(reused.installed, false); assert.equal(reused.path, result.path);
    console.log(JSON.stringify({ provider, verifiedCleanInstall: true, signInCommand: true, reusedInstallation: true, version }));
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
