// npm run mutate -- <file> --from <old> --to <new> --test <test-file>, or -- --plan <mutations.json>: proves a test catches a change.
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {MUTATE_HELP, checkPlan, failure, mutate, parseArgs, readPlan, restoreNow} from './mutate-run';
import {withRenderSlot} from './render-slot';

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(MUTATE_HELP);
      return;
    }
    const mutations = options.planPath ? await readPlan(options.planPath) : options.mutations!;
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.once(signal, () => {
        restoreNow();
        // The file is back; the slot and its queue let go in their 'exit' handlers.
        process.exit(128 + os.constants.signals[signal]);
      });
    }
    const root = fileURLToPath(new URL('../', import.meta.url));
    const run = {root, allowLiveCheckout: options.allowLiveCheckout, timeoutMs: options.timeoutMs};
    // A plan that fails its checks answers at once, without a turn in the queue.
    await checkPlan(mutations, run);
    // mutate checks again and reads the files with the slot in hand: the wait can last hours, and restoring bytes read
    // before it would drop an edit made during it, the loss this tool exists to prevent (BGC-27).
    const {code, results} = await withRenderSlot(() => mutate(mutations, run));
    console.log(`${results.filter((result) => result.killed).length} of ${results.length} mutation(s) killed.`);
    process.exitCode = code;
  } catch (error) {
    const {code, message} = failure(error);
    console.error(message);
    process.exitCode = code;
  }
};

void main();
