// Dedicated Node test runner; not part of the frontend browser/Vitest suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = readFileSync(fileURLToPath(new URL('./deploy-production.sh', import.meta.url)), 'utf8');
const sha = 'a'.repeat(40), hash = 'b'.repeat(64);
const mockDocker = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$MOCK_LOG"
if [[ "$1 $2" == "network inspect" ]]; then exit 0; fi
if [[ "$1" == inspect ]]; then
  case "$3" in
    *com.docker.compose.service*) echo "$MOCK_SERVICE" ;;
    *com.docker.compose.project*) echo buyback ;;
    *Health*) echo healthy ;;
    *) echo sha256:localimage ;;
  esac
  exit 0
fi
if [[ "$1 $2" == "image inspect" ]]; then echo sha256:localimage; exit 0; fi
if [[ "$1" == pull ]]; then exit 0; fi
if [[ "$1" == compose ]]; then
  case " $* " in
    *" config -q "*) exit 0 ;;
    *" migrate deploy "*) exit "\${MOCK_MIGRATION_EXIT:-0}" ;;
    *" up -d "*) exit "\${MOCK_HEALTH_EXIT:-0}" ;;
  esac
fi
exit 0
`;
function run(service, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'buyback-deploy-test-'));
  try {
    mkdirSync(join(dir,'bin')); mkdirSync(join(dir,'backend'));
    writeFileSync(join(dir,'docker-compose.yml'), 'name: buyback\n');
    writeFileSync(join(dir,'backend','.env.prod'), 'DO_NOT_PRINT=secret\n');
    writeFileSync(join(dir,'bin','docker'), mockDocker, {mode:0o700});
    writeFileSync(join(dir,'bin','flock'), '#!/bin/sh\nexit 0\n', {mode:0o700});
    const log = join(dir,'commands.log');
    if (options.lastRun) {
      mkdirSync(join(dir,'.deploy-state'));
      writeFileSync(join(dir,'.deploy-state', service+'.last-attempt'), options.lastRun+'\n');
    }
    const code = script.replace('deploy_dir=/home/deploy/buyback', 'deploy_dir="'+dir+'"');
    const image = 'ghcr.io/nexora-vn/buyback-nexoravn-'+service+'@sha256:'+hash;
    const result = spawnSync('bash', ['-c',code,'test',service,image,sha,'2'], {
      encoding:'utf8', env:{...process.env, PATH:join(dir,'bin')+':'+process.env.PATH,
        MOCK_LOG:log, MOCK_SERVICE:service, MOCK_MIGRATION_EXIT:options.migrationExit ?? '0', MOCK_HEALTH_EXIT: options.healthExit ?? '0'},
    });
    let commands=''; try { commands=readFileSync(log,'utf8'); } catch {}
    return { ...result, commands };
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
test('backend migration fails before replacing any container', () => {
  const r=run('backend',{migrationExit:'1'});
  assert.equal(r.status,1); assert.match(r.commands,/migrate deploy/);
  assert.doesNotMatch(r.commands,/ up -d /); assert.doesNotMatch(r.stdout,/DO_NOT_PRINT|secret/);
});
test('backend deploys only after migration and waits for health', () => {
  const r=run('backend'); assert.equal(r.status,0,r.stderr);
  assert.ok(r.commands.indexOf('migrate deploy') < r.commands.indexOf(' up -d '));
  assert.match(r.commands,/--no-deps --no-build --pull never --wait/);
  assert.doesNotMatch(r.commands,/ down|prune|buyback-tunnel/);
});
test('frontend never migrates or starts backend dependencies', () => {
  const r=run('frontend'); assert.equal(r.status,0,r.stderr);
  assert.doesNotMatch(r.commands,/migrate| down|prune/);
  assert.match(r.commands,/--wait-timeout 180 frontend/);
});
test('health failure exits without automatic rollback', () => {
  const r=run('backend',{healthExit:'1'}); assert.equal(r.status,1);
  assert.equal((r.commands.match(/ up -d /g) ?? []).length,1);
});
test('superseded run never pulls or migrates', () => {
  const r=run('backend',{lastRun:'3'}); assert.equal(r.status,0);
  assert.equal(r.commands,'');
});
