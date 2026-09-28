import {registerOrnamentHarness} from './helpers/ornament-harness';

/** The shared ornament harness (tests/helpers/ornament-harness.ts) on the 'teia' set: chat and block (the borders run from ornaments-harness-teia-border, in parallel). */
registerOrnamentHarness('teia', {kinds: ['chat', 'block']});
