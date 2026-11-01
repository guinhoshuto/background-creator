import {useEffect, useState} from 'react';
import {Img, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {
  MISSING_FRAMES_MESSAGE, WILDFIRE_DIRECTORY, WILDFIRE_MANIFEST_FILE, WILDFIRE_SEQUENCE,
  frameFileOf, manifestProblems, parseManifest, sequenceFrame, type WildfireManifest,
} from './wildfire/manifest';

/** One pass of the sequence: 480 frames at 60 fps. */
export const LOOP_SECONDS = WILDFIRE_SEQUENCE.frames / WILDFIRE_SEQUENCE.fps;
export const DURATION_MESSAGE = `The wildfire smoke frames loop every ${LOOP_SECONDS} s: use 8, 16 or 24 s.`;

/**
 * A Blender frame sequence (public/wildfire-smoke/, from `npm run build:wildfire`) shown frame by
 * frame: nothing is drawn in code, so `colors` is left out (the sequence does not recolour); the
 * inherited `seed` has no effect, there is no randomness to seed. The scene is opaque, and
 * `backgroundColor` shows only where a frame is missing.
 */
export const wildfireSmokeLoopSchema = baseBackgroundSchema.omit({colors: true}).extend({
  durationSeconds: z.number().finite().positive().refine((seconds) => seconds % LOOP_SECONDS === 0, DURATION_MESSAGE)
    .describe('Cycle duration, in seconds: a whole number of 8 s passes of the frame sequence').default(LOOP_SECONDS),
  transparent: z.literal(false).describe('The smoke is an opaque scene; choose a different background for alpha').default(false),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#260401'),
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

  // The frame comes in only after the manifest passed, so a missing file is reported with the way out above.
  return (
    <Canvas {...props}>
      {ready ? (
        <Img
          src={staticFile(wildfireFrameFile(frame, durationInFrames))}
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block'}}
        />
      ) : null}
    </Canvas>
  );
};
