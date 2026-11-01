import {useEffect, useState} from 'react';
import {Img, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {
  MISSING_FRAMES_MESSAGE, WILDFIRE_DIRECTORY, WILDFIRE_MANIFEST_FILE, WILDFIRE_SEQUENCE,
  frameFileOf, manifestProblems, parseManifest, sequenceFrame, type WildfireManifest,
} from './wildfire/manifest';
import {SPARK_CORNERS, getSparkScene} from './wildfire/sparks';

/** One pass of the sequence: 480 frames at 60 fps. */
export const LOOP_SECONDS = WILDFIRE_SEQUENCE.frames / WILDFIRE_SEQUENCE.fps;
export const DURATION_MESSAGE = `The wildfire smoke frames loop every ${LOOP_SECONDS} s: use 8, 16 or 24 s.`;
export const OPAQUE_MESSAGE = 'The smoke is an opaque scene: choose a different background for alpha.';

/**
 * A Blender frame sequence (public/wildfire-smoke/, from `npm run build:wildfire`) shown frame by
 * frame, with an optional layer of embers drawn in code over it (`sparks`, src/backgrounds/wildfire/
 * sparks.ts). The sequence does not recolour, so `colors` is left out; the inherited `seed` lays the
 * embers out and does nothing without them. The scene is opaque, and `backgroundColor` shows only
 * where a frame is missing.
 */
export const wildfireSmokeLoopSchema = baseBackgroundSchema.omit({colors: true}).extend({
  durationSeconds: z.number().finite().positive().refine((seconds) => seconds % LOOP_SECONDS === 0, DURATION_MESSAGE)
    .describe('Cycle duration, in seconds: a whole number of 8 s passes of the frame sequence').default(LOOP_SECONDS),
  transparent: z.literal(false, {error: OPAQUE_MESSAGE}).describe('The smoke is an opaque scene; choose a different background for alpha').default(false),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#260401'),
  sparks: z.enum(SPARK_CORNERS).describe('Embers drawn over the frames, rising from a bottom corner or along the whole bottom; none for the smoke alone').default('none'),
  sparkCount: z.number().int().min(0).max(400).describe('Ember slots laid out per loop; about a third are alive at once').default(90),
  sparkSize: z.number().finite().min(0.5).max(12).describe('Ember size, in px').default(3),
  sparkRise: z.number().finite().min(40).max(1200).describe('How fast the embers rise, in px per second').default(260),
  sparkTrail: z.number().finite().min(0).max(3).describe('Streak behind each ember, as a share of its motion over 60 ms; 0 for none').default(0.5),
  sparkAngle: z.number().finite().min(0).max(70).describe('How far from vertical the embers of a corner rise, in degrees towards the middle of the frame; 0 for straight up (bottom ignores it)').default(0),
});

export type WildfireSmokeLoopProps = z.infer<typeof wildfireSmokeLoopSchema>;

/** The file under public/ of the frame a composition N frames long shows at frame f. */
export const wildfireFrameFile = (frame: number, durationInFrames: number): string =>
  `${WILDFIRE_DIRECTORY}/${frameFileOf(sequenceFrame(frame, durationInFrames), WILDFIRE_SEQUENCE.frames)}`;

/** public/wildfire-smoke/manifest.json through Remotion's static server; null when it is not there. */
const fetchManifest = async (): Promise<WildfireManifest | null> => {
  const response = await fetch(staticFile(WILDFIRE_MANIFEST_FILE));
  if (!response.ok) return null;
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // The Studio's dev server answers a missing file with its HTML page; anything else is a broken manifest.
    if (/^\s*</.test(text)) return null;
    throw error;
  }
  return parseManifest(data);
};

export const WildfireSmokeLoop = (props: WildfireSmokeLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const [handle] = useState(() => delayRender('Checking the wildfire smoke frames', {timeoutInMilliseconds: 60000}));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    const check = async () => {
      const problems = manifestProblems(await fetchManifest(), WILDFIRE_SEQUENCE);
      if (problems.length > 0) throw new Error(problems.join('; '));
    };
    check().then(() => {
      if (disposed) return;
      setReady(true);
      continueRender(handle);
    }, (error: unknown) => {
      if (!disposed) cancelRender(new Error(`${MISSING_FRAMES_MESSAGE} ${error instanceof Error ? error.message : String(error)}`));
    });
    return () => {
      disposed = true;
    };
  }, [handle]);

  const sparks = ready ? getSparkScene(props, frame, durationInFrames) : [];

  // The frame comes in only after the manifest passed, so a missing file is reported with the way out above.
  return (
    <Canvas {...props}>
      {ready ? (
        <Img
          src={staticFile(wildfireFrameFile(frame, durationInFrames))}
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block'}}
        />
      ) : null}
      {sparks.length > 0 ? (
        // Plain alpha over the frame: no blend mode (README, Known pitfalls); the glow is a radial gradient.
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true" style={{position: 'absolute', inset: 0}}>
          <defs>
            <radialGradient id="wildfire-ember-glow">
              <stop offset="0%" stopColor="#ffb347" stopOpacity="0.55" />
              <stop offset="40%" stopColor="#ff6a1f" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#ff3b1a" stopOpacity="0" />
            </radialGradient>
          </defs>
          {sparks.map((spark, index) => (
            <g key={index} opacity={spark.opacity}>
              {spark.tail ? (
                <line x1={spark.tail.x} y1={spark.tail.y} x2={spark.x} y2={spark.y} stroke={spark.color} strokeWidth={spark.radius * 1.2} strokeLinecap="round" opacity="0.6" />
              ) : null}
              <circle cx={spark.x} cy={spark.y} r={spark.radius * 6} fill="url(#wildfire-ember-glow)" />
              <circle cx={spark.x} cy={spark.y} r={spark.radius} fill={spark.color} />
              <circle cx={spark.x} cy={spark.y} r={spark.radius * 0.4} fill="#fff1c8" opacity="0.7" />
            </g>
          ))}
        </svg>
      ) : null}
    </Canvas>
  );
};
