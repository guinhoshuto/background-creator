// Child process for tests/render-slot.test.ts. Takes the render slot in RENDER_SLOT_DIR, prints
// "held" (or "inherited" under a parent's slot), keeps it for argv[2] ms ("forever" waits for a
// signal), then releases it and prints "released". argv[3] is how long it may wait for the slot.
import {acquireRenderSlot} from '../../scripts/render-slot';

const main = async () => {
  const [hold = '0', waitLimit = '3000'] = process.argv.slice(2);
  const slot = await acquireRenderSlot({command: 'render-slot test holder', pollMs: 50, waitLimitMs: Number(waitLimit), log: () => {}});
  console.log(slot.inherited ? 'inherited' : 'held');
  if (hold === 'forever') { setInterval(() => {}, 1000); return; }
  setTimeout(() => { slot.release(); console.log('released'); }, Number(hold));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
