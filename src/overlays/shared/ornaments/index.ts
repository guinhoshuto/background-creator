/**
 * Themed ornaments (enfeites) and the lightning flash of the overlay kinds; see types.ts.
 * Explicit names: sets import the files they need directly, never this index.
 */
export {
  DARK_OUTLINE, RadialLight, mixColor, ornamentPalette, ornamentPartId, paint, unitToward,
} from './draw';
export {ORNAMENT_DEFAULT_COLORS, ORNAMENT_SCALE_RANGE, ORNAMENT_SIZE_RANGE, ornamentFields} from './fields';
export {frameOrnamentFrame, panelOrnamentFrame, scaleOrnamentFrame} from './frame';
export {
  ORNAMENT_CLEARANCE, ORNAMENT_EDGE, ORNAMENT_MAX_SLIDE, ORNAMENT_SEED, cornerSlot, cornerSlots, fitMotif, fitsAt, floorHalf,
  harmonics, maxExtentAt, meetsKeepOut, ornamentOutset, ornamentRandom, pointOnSlot, rectDistance, roomAt, slideRange, slideToFit,
  slotsOffAccent, type FitMotifOptions, type OrnamentCorner, type SlideRange,
} from './place';
export {
  FLASH_COLOR, ORNAMENT_REGISTRY, buildFlashScene, buildOrnamentScene, layoutOrnaments, layoutOutset, ornamentSetOf, ornamentWayOut,
  placeOrnaments, refineLightning, refineOrnaments,
} from './registry';
export {
  FLASH_BAND_PEAK, FLASH_EDGE_PEAK, FLASH_PANEL_PEAK, FlashLayer, OrnamentLayer, type FlashClip,
} from './render';
export {
  ORNAMENT_CHOICES, ORNAMENT_SET_IDS, type FlashElement, type OrnamentBase, type OrnamentChoice, type OrnamentCornerId,
  type OrnamentElement, type OrnamentFit, type OrnamentFrame, type OrnamentKind, type OrnamentLayerName, type OrnamentLayout,
  type OrnamentPlacement, type OrnamentRenderContext, type OrnamentSet, type OrnamentSetId, type OrnamentSlotId, type OrnamentStyle,
} from './types';
