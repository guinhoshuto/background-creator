import {registerOrnamentHarness} from './helpers/ornament-harness';

/** The shared ornament harness (tests/helpers/ornament-harness.ts) on the 'cobweb' set: chat and block (the borders run from ornaments-harness-cobweb-border, in parallel). */
registerOrnamentHarness('cobweb', {kinds: ['chat', 'block']});
