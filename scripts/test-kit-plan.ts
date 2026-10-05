// The plan of npm run test:kit: which harness files of one ornament set run, with which narrowing (BGC-15).
import {ORNAMENT_SET_IDS} from '../src/overlays/shared';

export const TEST_KIT_HELP = `Usage: npm run test:kit -- <set> [--kind chat|block|border] [--radii 0,16] [--sizes 48] [--sparse]

Runs the ornament harness of one set (tests/ornaments-harness-<set>*.test.ts) in seconds while you work on it:
  --kind <kind>    only that kind's tests (chat, block or border)
  --radii <list>   the border radii to check (default 0,16,200)
  --sizes <list>   the ornamentSize values to check (default 48 and the schema's extremes)
  --sparse         only the sample frames, not every frame and half frame
Sets: ${ORNAMENT_SET_IDS.join(', ')}.
A narrowed run is not the suite: before a merge, npm test runs the whole harness.`;

const KINDS = ['chat', 'block', 'border'] as const;
const LIST = /^\d+(\.\d+)?(,\d+(\.\d+)?)*$/;

export type TestKitPlan = {files: string[]; env: Record<string, string>; nodeArgs: string[]; narrowed: string[]};

/** Reads the arguments against the test file names; throws with the way out on a bad argument. */
export const testKitPlan = (args: readonly string[], testFiles: readonly string[]): TestKitPlan => {
  const positional: string[] = [];
  const env: Record<string, string> = {};
  const narrowed: string[] = [];
  let kind: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const value = () => {
      const next = args[++index];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} requires a value.`);
      return next;
    };
    if (arg === '--sparse') {
      env.ORNAMENT_HARNESS_DENSE = 'off';
      narrowed.push('sample frames only');
    } else if (arg === '--kind') {
      kind = value();
      if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`--kind takes ${KINDS.join(', ')}, got "${kind}".`);
      narrowed.push(`kind ${kind}`);
    } else if (arg === '--radii' || arg === '--sizes') {
      const list = value();
      if (!LIST.test(list)) throw new Error(`${arg} takes numbers separated by commas, got "${list}".`);
      env[arg === '--radii' ? 'ORNAMENT_HARNESS_RADII' : 'ORNAMENT_HARNESS_SIZES'] = list;
      narrowed.push(`${arg.slice(2)} ${list}`);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) throw new Error('Name exactly one set.');
  const set = positional[0]!;
  if (!(ORNAMENT_SET_IDS as readonly string[]).includes(set)) throw new Error(`Unknown set "${set}". Sets: ${ORNAMENT_SET_IDS.join(', ')}.`);
  // The set's own files: "cobweb" takes ornaments-harness-cobweb.test.ts and -cobweb-border*.test.ts
  // (no set id is another's followed by "-", so no other set's file matches).
  const files = testFiles
    .filter((file) => file === `ornaments-harness-${set}.test.ts` || (file.startsWith(`ornaments-harness-${set}-`) && file.endsWith('.test.ts')))
    .sort()
    .map((file) => `tests/${file}`);
  if (files.length === 0) throw new Error(`No harness file for "${set}": expected tests/ornaments-harness-${set}.test.ts.`);
  const nodeArgs = ['--import', 'tsx', '--test', ...(kind ? [`--test-name-pattern=\\] ${kind}:`] : []), ...files];
  return {files, env, nodeArgs, narrowed};
};
