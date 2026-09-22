import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  console.error('Migration creation requires a disposable local database. For an existing reviewed migration use npm run prisma:migrate:deploy. Never reset a shared database.');
  process.exit(1);
}
const result = spawnSync('prisma', ['migrate', 'dev', '--create-only'], { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
