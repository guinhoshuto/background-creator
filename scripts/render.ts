import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {freeBytes} from './disk';
import {exportAsset, projectRoot} from './export';
import {runRender} from './render-args';
import {withRenderSlot} from './render-slot';

runRender(process.argv.slice(2), {
  defaultOutDirectory: path.join(projectRoot, 'out'),
  effects: {
    readProps: async (file) => JSON.parse(await readFile(file, 'utf8')) as unknown,
    freeBytes,
    exportAsset,
    // --help and --list never get here; a real export waits for the machine-wide render slot.
    withRenderSlot: (task) => withRenderSlot(task),
    log: (message) => console.log(message),
  },
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
