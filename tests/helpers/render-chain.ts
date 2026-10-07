// Child process for tests/render-turn.test.ts: a pack chain in miniature. For each kit it takes the
// render slot in RENDER_SLOT_DIR, starts a render that does not take the slot (a node process whose
// command line carries `remotion render <marker>`), keeps both for argv[3] ms, stops the render, releases
// the slot and goes on to the next kit at once, as render:pack does between kits. It prints
// `<kit> held <ms>` and `<kit> released <ms>` (Date.now()). argv: marker, kits (comma-separated), hold ms.
import {spawn} from 'node:child_process';
import {acquireRenderSlot} from '../../scripts/render-slot';

const main = async () => {
  const [marker = 'chain', kits = 'kit1', hold = '1000'] = process.argv.slice(2);
  for (const kit of kits.split(',')) {
    const slot = await acquireRenderSlot({command: `render chain ${kit}`, pollMs: 50, waitLimitMs: 20_000, log: () => {}});
    // The render ends with its parent: a chain killed mid-kit leaves no orphan behind.
    const render = spawn(process.execPath, ['-e', 'const parent = process.ppid; setInterval(() => { if (process.ppid !== parent) process.exit(0); }, 200);', 'remotion', 'render', marker], {stdio: 'ignore'});
    console.log(`${kit} held ${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, Number(hold)));
    const ended = new Promise((resolve) => render.once('exit', resolve));
    render.kill();
    await ended;
    console.log(`${kit} released ${Date.now()}`);
    slot.release();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
