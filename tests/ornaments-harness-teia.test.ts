import {registerOrnamentHarness} from './helpers/ornament-harness';

/** The shared ornament harness (tests/helpers/ornament-harness.ts) on the 'teia' set: chat and bloco (the borders run from ornaments-harness-teia-borda, in parallel). */
registerOrnamentHarness('teia', {kinds: ['chat', 'bloco']});
