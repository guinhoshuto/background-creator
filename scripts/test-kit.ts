// npm run test:kit -- <set> [--kind <kind>] [--radii <list>] [--sizes <list>] [--sparse]: one set's ornament harness, narrowed.
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {TEST_KIT_HELP, testKitPlan} from './test-kit-plan';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(TEST_KIT_HELP);
} else {
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const plan = testKitPlan(args, readdirSync(`${root}tests`));
    console.log(`test:kit: ${plan.files.join(' ')}${plan.narrowed.length > 0 ? ` (narrowed: ${plan.narrowed.join(', ')})` : ''}`);
    const run = spawnSync(process.execPath, plan.nodeArgs, {cwd: root, stdio: 'inherit', env: {...process.env, ...plan.env}});
    process.exitCode = run.status ?? 1;
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${TEST_KIT_HELP}`);
    process.exitCode = 1;
  }
}
