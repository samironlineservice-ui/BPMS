// Lokal ishlab chiqish: PostgreSQL (embedded) → tsc -b -w → API + worker (node --watch) → Vite (admin :5173, portal :5174)
// To'xtatish: Ctrl+C (barcha jarayonlar birga to'xtaydi; PostgreSQL fonda qoladi — `npm run db:stop`).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* .env bo'lmasligi mumkin */ }
const PORTS = { API: Number(process.env.PORT ?? 3100), 'Xodimlar sayti': 5173, 'Mijoz kabineti': 5174 };
const colors = { db: 36, tsc: 34, api: 32, worker: 35, web: 33, portal: 94 };
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

/** Port band-mi (127.0.0.1 yoki ::1 da kimdir tinglayaptimi). */
const listening = (port) => Promise.all(['127.0.0.1', '::1'].map((host) => new Promise((resolve) => {
  const s = net.connect({ port, host });
  const done = (v) => { s.destroy(); resolve(v); };
  s.once('connect', () => done(true));
  s.once('error', () => done(false));
  s.setTimeout(500, () => done(false));
}))).then((r) => r.some(Boolean));

// 1) Portlar bo'shmi — aks holda yarim ishga tushgan tizim qoladi
const busy = [];
for (const [name, port] of Object.entries(PORTS)) if (await listening(port)) busy.push(`${port} (${name})`);
if (busy.length) {
  console.error(red(`\n✗ Port band: ${busy.join(', ')}`));
  console.error("  Ehtimol `npm run dev` boshqa terminalda allaqachon ishlayapti — o'sha oynada Ctrl+C bosing va qayta urinib ko'ring.");
  console.error("  Kim band qilganini ko'rish: ss -ltnp | grep -E ':(3100|5173|5174)'\n");
  process.exit(1);
}

// 2) PostgreSQL (papka ko'chirilgan bo'lsa, pg.mjs eski jarayonni o'zi qayta ishga tushiradi)
const pg = spawnSync(process.execPath, ['packages/db/scripts/pg.mjs', 'start'], { cwd: root, stdio: 'inherit' });
if (pg.status !== 0) {
  console.error(red('\n✗ PostgreSQL ishga tushmadi.') + ` Log: ${path.join(root, '.data/pg.log')}\n`);
  process.exit(1);
}

// 3) Birinchi build, keyin watch rejimidagi jarayonlar
const first = spawnSync('npx', ['tsc', '-b'], { cwd: root, stdio: 'inherit' });
if (first.status !== 0) console.warn('tsc: xatolar bor — watch rejimida davom etiladi');

const procs = [];
let stopping = false;
const start = (name, cmd, args, cwd = root) => {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '1' } });
  const tag = `\x1b[${colors[name]}m[${name}]\x1b[0m `;
  const pipe = (s) => s.on('data', (d) => process.stdout.write(d.toString().split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(p.stdout); pipe(p.stderr);
  p.on('exit', (code, signal) => {
    // Ctrl+C butun guruhga boradi: bola jarayon o'zimizdan oldin to'xtashi mumkin — bu xato emas
    if (stopping || signal === 'SIGINT' || signal === 'SIGTERM' || code === 130 || code === 143) return stop(0);
    setTimeout(() => {
      if (stopping) return;
      console.error(red(`\n✗ [${name}] to'xtadi (${signal ?? `kod ${code}`}) — hammasi to'xtatilmoqda. Sababini yuqoridagi logdan qarang.\n`));
      stop(1);
    }, 300);
  });
  procs.push(p);
};
start('tsc', 'npx', ['tsc', '-b', '-w', '--preserveWatchOutput']);
start('api', 'node', ['--watch', '--enable-source-maps', 'dist/main.js', 'api'], path.join(root, 'apps/server'));
start('worker', 'node', ['--watch', '--enable-source-maps', 'dist/main.js', 'worker'], path.join(root, 'apps/server'));
start('web', 'npx', ['vite'], path.join(root, 'apps/admin-web'));
start('portal', 'npx', ['vite'], path.join(root, 'apps/portal-web'));

/** Jarayon va uning barcha avlodlari (npx → sh → vite); Linux'da /proc orqali. */
function treeOf(pid) {
  const children = new Map();
  try {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
        const ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]);
        if (!children.has(ppid)) children.set(ppid, []);
        children.get(ppid).push(Number(d));
      } catch { /* jarayon tugagan */ }
    }
  } catch { /* /proc yo'q (Linux emas) */ }
  const out = [pid];
  for (let i = 0; i < out.length; i++) out.push(...(children.get(out[i]) ?? []));
  return out;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const pids = procs.filter((p) => p.pid && p.exitCode === null).flatMap((p) => treeOf(p.pid));
  const kill = (sig) => { for (const pid of pids) { try { process.kill(pid, sig); } catch { /* tugagan */ } } };
  kill('SIGTERM');
  setTimeout(() => { kill('SIGKILL'); process.exit(code); }, 3000);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => stop(0));

// 4) Hammasi tayyor bo'lganda havolalar
(async () => {
  for (let i = 0; i < 180 && !stopping; i++) {
    const api = await fetch(`http://127.0.0.1:${PORTS.API}/api/v1/health/ready`).then((r) => r.ok).catch(() => false);
    if (api && (await listening(5173)) && (await listening(5174))) {
      console.log(green('\n✓ Tayyor:'));
      console.log('    Xodimlar sayti:  http://localhost:5173');
      console.log('    Mijoz kabineti:  http://localhost:5174');
      console.log(`    API:             http://localhost:${PORTS.API}/api/v1`);
      console.log("    To'xtatish:      Ctrl+C\n");
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!stopping) console.warn(red("\n⚠ 3 daqiqada hammasi tayyor bo'lmadi — yuqoridagi logni tekshiring.\n"));
})();
