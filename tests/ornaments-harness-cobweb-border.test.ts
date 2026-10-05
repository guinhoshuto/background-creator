import {NEUTRAL, registerOrnamentHarness} from './helpers/ornament-harness';

/**
 * The shared ornament harness (tests/helpers/ornament-harness.ts) on the 'cobweb' set's borders (its
 * heaviest part, in a file of its own), at the neutral ornamentSize; the extremes run from
 * ornaments-harness-cobweb-border-extremes, in parallel.
 */
registerOrnamentHarness('cobweb', {kinds: ['border'], ornamentSizes: [NEUTRAL.ornamentSize]});
