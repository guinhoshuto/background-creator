// Loaded with --import before scripts/pack.ts and scripts/validate-exports.ts by tests/pack-wait-disk.test.ts and
// tests/validate-wait-disk.test.ts: the real script on a fake disk. statfs reads the free bytes from the file
// FAKE_FREE_FILE names, and the 5 min poll of --wait-disk lasts 20 ms. With FAKE_POLL_MOVES_CLOCK, each poll also moves
// Date.now by the 5 min it stands for, so a run reaches the 6 h ceiling of a wait in seconds.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {DISK_WAIT_POLL_MS} from '../../scripts/disk';

const freeFile = process.env.FAKE_FREE_FILE;
if (freeFile === undefined) throw new Error('fake-disk needs FAKE_FREE_FILE.');
Object.assign(fs, {statfsSync: () => ({bavail: Number(fs.readFileSync(freeFile, 'utf8')), bsize: 1})});
syncBuiltinESMExports();

let moved = 0;
if (process.env.FAKE_POLL_MOVES_CLOCK !== undefined) {
  const realNow = Date.now;
  Date.now = () => realNow() + moved;
}

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((handler: () => void, ms?: number) => {
  if (ms === DISK_WAIT_POLL_MS) moved += DISK_WAIT_POLL_MS;
  return realSetTimeout(handler, ms === DISK_WAIT_POLL_MS ? 20 : ms);
}) as typeof globalThis.setTimeout;
