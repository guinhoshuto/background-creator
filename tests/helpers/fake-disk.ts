// Loaded with --import before scripts/pack.ts by tests/pack-wait-disk.test.ts: the real script on a fake disk.
// statfs reads the free bytes from the file FAKE_FREE_FILE names, and the 5 min poll of --wait-disk lasts 20 ms.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {DISK_WAIT_POLL_MS} from '../../scripts/disk';

const freeFile = process.env.FAKE_FREE_FILE;
if (freeFile === undefined) throw new Error('fake-disk needs FAKE_FREE_FILE.');
Object.assign(fs, {statfsSync: () => ({bavail: Number(fs.readFileSync(freeFile, 'utf8')), bsize: 1})});
syncBuiltinESMExports();

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((handler: () => void, ms?: number) =>
  realSetTimeout(handler, ms === DISK_WAIT_POLL_MS ? 20 : ms)) as typeof globalThis.setTimeout;
