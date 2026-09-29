// Child process for the render slot stress test in tests/render-slot.test.ts. Prints "ready", waits
// for <log>/go, then takes the slot in RENDER_SLOT_DIR argv[3] times. While holding it, it checks
// that no other racer is inside (an atomic mkdir of <log>/inside) and that owner.json names this
// process, at entry and before leaving; each breach becomes a file <log>/breach-<pid>-<round>.
// Every round but the last ends in a simulated crash: a takeover mutex older than the 10 s grace is
// left behind and owner.json gets the dead pid argv[4], so each round is a takeover race.
import {appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {acquireRenderSlot, slotDir} from '../../scripts/render-slot';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ownerPid = () => {
  try {
    return (JSON.parse(readFileSync(path.join(slotDir(), 'owner.json'), 'utf8')) as {pid: number}).pid;
  } catch {
    return null;
  }
};

const main = async () => {
  const [log = '', rounds = '1', deadPid = ''] = process.argv.slice(2);
  console.log('ready');
  while (!existsSync(path.join(log, 'go'))) await sleep(2);
  for (let round = 0; round < Number(rounds); round += 1) {
    const slot = await acquireRenderSlot({command: 'render-slot racer', pollMs: 5, waitLimitMs: 15_000, log: () => {}});
    const breach = (why: string) => writeFileSync(path.join(log, `breach-${process.pid}-${round}`), `${why}\n`, {flag: 'a'});
    let inside = false;
    try { mkdirSync(path.join(log, 'inside')); inside = true; } catch { breach('another racer was inside'); }
    if (ownerPid() !== process.pid) breach(`owner.json named ${ownerPid()} at entry`);
    appendFileSync(path.join(log, 'entries'), `${process.pid} ${round}\n`);
    await sleep(15);
    if (ownerPid() !== process.pid) breach(`owner.json named ${ownerPid()} before leaving`);
    if (inside) rmSync(path.join(log, 'inside'), {recursive: true, force: true});
    if (round === Number(rounds) - 1) { slot.release(); continue; }
    // Only a mutex made here is aged: aging a live one would fake a dead taker.
    const mutex = `${slotDir()}.takeover`;
    let made = false;
    try { mkdirSync(mutex); made = true; } catch { /* a late taker holds it now */ }
    const old = new Date(Date.now() - 11_000);
    if (made) utimesSync(mutex, old, old);
    const owner = path.join(slotDir(), 'owner.json');
    writeFileSync(owner, JSON.stringify({...JSON.parse(readFileSync(owner, 'utf8')) as object, pid: Number(deadPid)}));
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
