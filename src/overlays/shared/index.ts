/**
 * The shared overlay engine: geometry, layouts, zod field groups, pure scene builders and SVG
 * layers for the sized kinds (chat, bloco, borda). A kind composes it like this:
 *
 * ```ts
 * const fields = z.object({
 *   ...overlayBaseFields(size), radius: radiusField(), padding: paddingField(),
 *   ...fillFields(), ...strokeFields(), ...glowFields(), ...haloFields(),
 * });
 * export const blocoLoopSchema = fields.superRefine((props, context) => {
 *   refineCanvas(props, context);
 *   const layout = getBlocoLayout(props);            // layoutPanel({...props, insets})
 *   refineOutset(props, layout.outset, context);
 *   refineContent(layout, context);
 *   refineStroke(props, layout.track, context);
 *   refineFill(props, layout.box, context);
 * });
 * export const getBlocoScene = (props, frame, n) => [
 *   ...buildHaloScene(props, frame, n),
 *   ...buildFillScene(props, layout.box, frame, n, {corner: layout.shape.radius}),
 *   ...buildStrokeScene(props, layout.track, frame, n),
 *   ...buildGlowScene(props, frame, n),
 * ];
 * // Component: <OverlayStage props={props} layout={layout} guides={props.guides}>
 * //   <HaloLayer …/><FillLayer elements={fill} clip={layout.shape}/><StrokeLayer elements={stroke} tracks={[layout.track]}/>
 * // </OverlayStage>
 * ```
 *
 * Units: canvas pixels everywhere (the box sits at (bleed, bleed)); decorative lengths are
 * fixed px and never scale with the box; arc length `s` runs clockwise from the middle of the
 * top edge; speeds are px/s rounded to whole periods per cycle (see getStrokeMotion/getFillMotion).
 */
export * from './box';
export * from './content';
export * from './elements';
export * from './fields';
export * from './fills';
export * from './geometry';
export * from './layout';
export * from './legibility';
export * from './motion';
export * from './ornaments';
export * from './perimeter';
export * from './render';
export * from './shape';
export * from './strokes';
