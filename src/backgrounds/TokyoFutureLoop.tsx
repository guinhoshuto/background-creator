import {useLayoutEffect, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {createTokyoScene, type TokyoScene} from './tokyo/scene';

export const tokyoFutureLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(12),
  seed: baseBackgroundSchema.shape.seed.default(2089),
  transparent: z.literal(false).describe('This city is an opaque scene; choose a different background for alpha').default(false),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#08131D'),
  colors: baseBackgroundSchema.shape.colors.default(['#55DDE8', '#FF7665', '#FFCA87']),
  rain: z.number().min(0).max(1).describe('Rain visibility').default(0.55),
  atmosphere: z.number().min(0.2).max(1.5).describe('Depth haze and layered low street fog').default(0.95),
  glow: z.number().min(0).max(1.5).describe('Soft bloom around neon and shop lights').default(0.55),
  cameraMotion: z.number().min(0).max(1).describe('Gentle closed camera drift; zero holds the camera still').default(0.65),
  weathering: z.number().min(0).max(1).describe('Concrete grime, aged metal and broken asphalt reflections').default(0.9),
  cinematic: z.number().min(0).max(1).describe('Cool shadows, warm highlights, lens fringe and vignette').default(0.7),
  filmGrain: z.number().min(0).max(1).describe('Subtle deterministic film grain').default(0.4),
});

export type TokyoFutureLoopProps = z.infer<typeof tokyoFutureLoopSchema>;

export const TokyoFutureLoop = (props: TokyoFutureLoopProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TokyoScene | null>(null);
  const frame = useCurrentFrame();
  const {width, height, durationInFrames} = useVideoConfig();
  const latest = useRef({frame, durationInFrames, props});
  latest.current = {frame, durationInFrames, props};
  const [handle] = useState(() => delayRender('Loading the Blender Tokyo city', {timeoutInMilliseconds: 180000}));

  useLayoutEffect(() => {
    if (!canvas.current) return;
    let disposed = false;
    createTokyoScene({
      canvas: canvas.current, width, height,
      modelUrl: staticFile('tokyo/organic/tokyo-city.glb'),
      signsUrl: staticFile('tokyo/organic/tokyo-signs.json'),
      detailsUrl: staticFile('tokyo/organic/tokyo-props.json'),
      seed: props.seed,
    }).then((value) => {
      if (disposed) {value.dispose(); return;}
      scene.current = value;
      const current = latest.current;
      value.draw(current.frame, current.durationInFrames, current.props);
      continueRender(handle);
    }).catch((error: unknown) => {
      if (!disposed) cancelRender(new Error(`Tokyo city could not load. Run npm run build:tokyo with the Sandisk connected. ${String(error)}`));
    });
    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [width, height, props.seed, handle]);

  useLayoutEffect(() => {
    scene.current?.draw(frame, durationInFrames, props);
  }, [frame, durationInFrames, props]);

  return <Canvas {...props}><canvas ref={canvas} width={width} height={height} style={{width: '100%', height: '100%'}} /></Canvas>;
};
