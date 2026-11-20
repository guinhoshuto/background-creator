// Checks that scripts/render-slot.ts, a byte-for-byte copy of ~/obsidian/AI/scripts/render-slot.ts,
// is still the source, or the source the last sync copied (HAR-122, issue #20). The sync
// (~/obsidian/AI/scripts/render_slot_copias.py --write) records the sha256 of the source it copied in
// scripts/render-slot.ts.sha256, one `shasum -a 256` line committed with the copy. When the vault source
// changes and the copy is synced hours later, the copy still matches its record: that is NOT COVERED
// (a skip), not red in every session in between. A copy that matches neither the source nor the record
// was edited by hand and fails. Never edit the copy: edit the source and run the --write command.
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

export const COPY_PATH = 'scripts/render-slot.ts';
export const RECORD_PATH = 'scripts/render-slot.ts.sha256';
export const SOURCE_PATH = '~/obsidian/AI/scripts/render-slot.ts';
export const WRITE_COMMAND = 'python3 ~/obsidian/AI/scripts/render_slot_copias.py --write --repo background-creator';

const RECORD_NAME = 'render-slot.ts';

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** The sha in a `<64 lowercase hex>  render-slot.ts` line (trailing newline optional), or null when malformed. */
export const parseRecord = (text: string): string | null => {
  const match = /^([0-9a-f]{64}) {2}(\S+)\n?$/.exec(text);
  if (!match || match[2] !== RECORD_NAME) return null;
  return match[1];
};

export type CopyVerdict =
  | {state: 'same'; note?: string}
  | {state: 'behind'; message: string}
  | {state: 'differs'; message: string};

const short = (sha: string) => sha.slice(0, 8);

/** `record` is the text of scripts/render-slot.ts.sha256, or null when the file is missing. */
export const copyVerdict = ({copy, source, record}: {copy: Uint8Array; source: Uint8Array; record: string | null}): CopyVerdict => {
  const copySha = sha256(copy);
  const recorded = record === null ? null : parseRecord(record);
  if (Buffer.from(copy).equals(Buffer.from(source))) {
    if (record === null || recorded === copySha) return {state: 'same'};
    const what = recorded === null
      ? `is not one \`<sha256>  ${RECORD_NAME}\` line`
      : `records ${short(recorded)}, not the copy's ${short(copySha)}`;
    return {state: 'same', note: `${RECORD_PATH} ${what}: it does not describe ${COPY_PATH}, so the next change of ${SOURCE_PATH} will fail this test instead of leaving it NOT COVERED; run ${WRITE_COMMAND}`};
  }
  if (record === null) {
    return {state: 'differs', message: `${COPY_PATH} differs from ${SOURCE_PATH} and ${RECORD_PATH} is missing, so a stale copy cannot be told from a hand edit: edit the source, then run ${WRITE_COMMAND}`};
  }
  if (recorded === null) {
    return {state: 'differs', message: `${COPY_PATH} differs from ${SOURCE_PATH} and ${RECORD_PATH} is not one \`<sha256>  ${RECORD_NAME}\` line: run ${WRITE_COMMAND}`};
  }
  if (recorded === copySha) {
    return {state: 'behind', message: `NOT COVERED: ${COPY_PATH} (${short(copySha)}) is the source the last sync copied, and ${SOURCE_PATH} (${short(sha256(source))}) changed since; run ${WRITE_COMMAND}`};
  }
  return {state: 'differs', message: `${COPY_PATH} (${short(copySha)}) matches neither ${SOURCE_PATH} (${short(sha256(source))}) nor the sha in ${RECORD_PATH} (${short(recorded)}): never edit the copy; edit the source, then run ${WRITE_COMMAND}`};
};

/** Reads the copy and its record under `root` and the source in `vault` (~/obsidian/AI/scripts). */
export const checkCopy = ({root, vault}: {root: string; vault: string}): CopyVerdict => {
  const recordFile = path.join(root, RECORD_PATH);
  return copyVerdict({
    copy: readFileSync(path.join(root, COPY_PATH)),
    source: readFileSync(path.join(vault, 'render-slot.ts')),
    record: existsSync(recordFile) ? readFileSync(recordFile, 'utf8') : null,
  });
};
