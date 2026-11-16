// Lokal PostgreSQL 18 (embedded-postgres binary'lari) boshqaruvi: start | stop | status | reset | reset-test
// Docker shart emas. Ma'lumotlar: <repo>/.data/pg, log: <repo>/.data/pg.log
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '../../..');
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* .env bo'lmasligi mumkin (CI) */ }
const pkgDir = [path.join(root, 'node_modules/@embedded-postgres/linux-x64'), path.join(import.meta.dirname, '../node_modules/@embedded-postgres/linux-x64')]
  .find((d) => fs.existsSync(path.join(d, 'native', 'bin', 'postgres')));
if (!pkgDir) throw new Error('@embedded-postgres/linux-x64 topilmadi — npm install qiling');
const binDir = path.join(pkgDir, 'native', 'bin');
const dataDir = path.join(root, '.data', 'pg');
const logFile = path.join(root, '.data', 'pg.log');
const port = Number(process.env.PG_PORT ?? 5544);
const superPw = process.env.PG_SUPERUSER_PASSWORD ?? 'postgres_dev_pw';
const roles = {
  app_migrator: process.env.APP_MIGRATOR_PASSWORD ?? 'migrator_dev_pw',
  app_rw: process.env.APP_RW_PASSWORD ?? 'rw_dev_pw',
  app_portal: process.env.APP_PORTAL_PASSWORD ?? 'portal_dev_pw',
  app_readonly: process.env.APP_READONLY_PASSWORD ?? 'readonly_dev_pw',
};
const databases = ['ads_erp', process.env.TEST_DATABASE_NAME ?? 'ads_erp_test'];
const run = (bin, args, opts = {}) => {
  const r = spawnSync(path.join(binDir, bin), args, { encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${bin} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r;
};
const isRunning = () => run('pg_ctl', ['-D', dataDir, 'status'], { allowFail: true }).status === 0;

async function admin(fn, database = 'postgres') {
  const c = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: superPw, database });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function bootstrap(dbs = databases) {
  await admin(async (c) => {
    for (const [role, pw] of Object.entries(roles)) {
      const exists = (await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount;
      await c.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} LOGIN PASSWORD '${pw.replace(/'/g, "''")}'`);
    }
    for (const db of dbs) {
      const exists = (await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [db])).rowCount;
      if (!exists) await c.query(`CREATE DATABASE ${db} OWNER app_migrator ENCODING 'UTF8' TEMPLATE template0`);
    }
  });
  for (const db of dbs) {
    await admin(async (c) => {
      await c.query('ALTER SCHEMA public OWNER TO app_migrator');
      await c.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await c.query('GRANT USAGE ON SCHEMA public TO app_rw, app_portal, app_readonly');
      await c.query("ALTER DATABASE " + db + " SET timezone TO 'UTC'");
    }, db);
  }
}

/**
 * Papka ko'chirilgan/nomi o'zgargan bo'lsa, postmaster eski (endi mavjud bo'lmagan) yo'ldan ishlayotgan bo'ladi:
 * u tez orada qulaydi (pg_control, timezone fayllari topilmaydi). Bunday jarayonni xavfsiz to'xtatamiz.
 */
async function stopIfRunningFromOldPath() {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return;
  const [pidLine, dirLine] = fs.readFileSync(pidFile, 'utf8').split('\n');
  const pid = Number(pidLine);
  if (!pid || path.resolve(dirLine ?? '') === path.resolve(dataDir)) return;
  let cmd = '';
  try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { return; } // jarayon yo'q — eskirgan fayl
  if (!cmd.includes('postgres')) return; // PID boshqa jarayonga o'tgan — tegmaymiz
  console.log(`PostgreSQL eski yo'ldan ishlayapti (${dirLine}) — papka ko'chirilgan. Qayta ishga tushirilmoqda…`);
  try { process.kill(pid, 'SIGINT'); } catch { /* allaqachon to'xtagan */ }
  for (let i = 0; i < 60; i++) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Eski PostgreSQL jarayoni (PID ${pid}) 30 s ichida to'xtamadi`);
}

async function start() {
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  await stopIfRunningFromOldPath();
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    const pwFile = path.join(os.tmpdir(), `ads-pgpw-${process.pid}`);
    fs.writeFileSync(pwFile, superPw, { mode: 0o600 });
    try {
      run('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=scram-sha-256', `--pwfile=${pwFile}`, '-E', 'UTF8', '--no-locale']);
    } finally { fs.rmSync(pwFile, { force: true }); }
    console.log('initdb: klaster yaratildi', dataDir);
  }
  if (!isRunning()) {
    run('pg_ctl', ['-D', dataDir, '-l', logFile, '-w', '-t', '60', '-o',
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c max_connections=200`, 'start']);
  }
  await bootstrap();
  console.log(`PostgreSQL ishlayapti: 127.0.0.1:${port} (bazalar: ${databases.join(', ')})`);
}

async function reset() {
  if (!isRunning()) await start();
  await admin(async (c) => {
    for (const db of databases) {
      await c.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    }
  });
  await bootstrap();
  console.log('Bazalar qayta yaratildi. Endi: npm run db:migrate && npm run db:seed');
}

/** Faqat test bazasi (smoke/integration testlar uchun) — asosiy bazaga tegmaydi. */
async function resetTest() {
  if (!isRunning()) await start();
  const db = databases[1];
  await admin((c) => c.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`));
  await bootstrap([db]);
  console.log(`Test bazasi qayta yaratildi: ${db}`);
}

const cmd = process.argv[2];
if (cmd === 'start') await start();
else if (cmd === 'stop') { if (isRunning()) run('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop']); console.log('to\'xtatildi'); }
else if (cmd === 'status') console.log(isRunning() ? `ishlayapti (port ${port})` : 'to\'xtagan');
else if (cmd === 'reset') await reset();
else if (cmd === 'reset-test') await resetTest();
else { console.log('foydalanish: node scripts/pg.mjs start|stop|status|reset|reset-test'); process.exit(1); }
