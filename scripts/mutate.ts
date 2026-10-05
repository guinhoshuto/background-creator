// npm run mutate -- <file> --from <old> --to <new> --test <test-file>, or -- --plan <mutations.json>: proves a test catches a change.
import {fileURLToPath} from 'node:url';
import {EXIT, MUTATE_HELP, RestoreError, UsageError, mutate, parseArgs, readPlan, restoreNow} from './mutate-run';

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
        process.exit(130);
      });
    }
    const root = fileURLToPath(new URL('../', import.meta.url));
    const {code, results} = await mutate(mutations, {root, allowLiveCheckout: options.allowLiveCheckout, timeoutMs: options.timeoutMs});
    console.log(`${results.filter((result) => result.killed).length} of ${results.length} mutation(s) killed.`);
    process.exitCode = code;
  } catch (error) {
    if (error instanceof RestoreError) {
      console.error(`RESTORE FAILED: ${error.message}`);
      process.exitCode = EXIT.restore;
      return;
    }
    console.error(error instanceof UsageError ? error.message : error instanceof Error ? error.stack : String(error));
    process.exitCode = EXIT.usage;
  }
};

void main();
