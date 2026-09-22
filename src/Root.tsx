import {Composition} from 'remotion';
import {backgroundCatalog} from './catalog';
import {getCompositionMetadata, getExportPreset, type BaseBackgroundProps} from './settings';

const gradient = backgroundCatalog.GradientLoop;
const particles = backgroundCatalog.ParticleLoop;
const geometry = backgroundCatalog.GeometricLoop;
const halloween = backgroundCatalog.HalloweenLoop;
const hauntedMansion = backgroundCatalog.HauntedMansionLoop;
const hauntedInterior = backgroundCatalog.HauntedInteriorLoop;
const kawaii = backgroundCatalog.KawaiiLoop;
const cobweb = backgroundCatalog.CobwebLoop;
const sunburst = backgroundCatalog.SunburstLoop;
const vaporwave = backgroundCatalog.VaporwaveLoop;

const metadataFor = <Props extends BaseBackgroundProps>(id: string, props: Props) => {
  const preset = getExportPreset(props);
  return {
    ...getCompositionMetadata(props),
    props,
    defaultCodec: preset.codec,
    defaultVideoImageFormat: preset.imageFormat,
    defaultPixelFormat: 'pixelFormat' in preset ? preset.pixelFormat : undefined,
    defaultOutName: `${id}.${props.outputFormat}`,
  };
};

export const RemotionRoot = () => (
  <>
    <Composition
      id="KawaiiLoop"
      component={kawaii.component}
      schema={kawaii.schema}
      defaultProps={{
        durationSeconds: 12, seed: 7, transparent: false, backgroundColor: '#FFF7F4',
        colors: ['#F7C8D8', '#FFE6BC', '#BFE3DC'], outputFormat: 'webm',
        familyCount: 5, familyScale: 1, centerClearance: 0.5, drift: 0.55, sparkleTrail: 2,
      }}
      {...getCompositionMetadata(kawaii.defaultProps)}
      calculateMetadata={({props}: {props: typeof kawaii.defaultProps}) => metadataFor(kawaii.id, kawaii.schema.parse(props))}
    />
    <Composition
      id="HalloweenLoop"
      component={halloween.component}
      schema={halloween.schema}
      defaultProps={{
        durationSeconds: 12, seed: 31, transparent: false, backgroundColor: '#120E20',
        colors: ['#9B85C9', '#F7DCA6', '#ED792D'], outputFormat: 'webm',
        batCount: 7, emberCount: 36, fogIntensity: 0.6, moonScale: 1,
      }}
      {...getCompositionMetadata(halloween.defaultProps)}
      calculateMetadata={({props}: {props: typeof halloween.defaultProps}) => metadataFor(halloween.id, halloween.schema.parse(props))}
    />
    <Composition
      id="HauntedMansionLoop"
      component={hauntedMansion.component}
      schema={hauntedMansion.schema}
      defaultProps={{
        durationSeconds: 16, seed: 81, transparent: false, backgroundColor: '#0E1520',
        colors: ['#688789', '#D6DDC7', '#E8AF62'], outputFormat: 'webm',
        batCount: 4, moteCount: 28, fogIntensity: 0.75, windowIntensity: 0.7, moonScale: 1,
      }}
      {...getCompositionMetadata(hauntedMansion.defaultProps)}
      calculateMetadata={({props}: {props: typeof hauntedMansion.defaultProps}) => metadataFor(hauntedMansion.id, hauntedMansion.schema.parse(props))}
    />
    <Composition
      id="HauntedInteriorLoop"
      component={hauntedInterior.component}
      schema={hauntedInterior.schema}
      defaultProps={{
        durationSeconds: 16, seed: 113, transparent: false, backgroundColor: '#080D10',
        colors: ['#536C68', '#A8BDB0', '#CA8A48'], outputFormat: 'webm',
        dustCount: 36, fogIntensity: 0.55, candleIntensity: 0.8, moonlightIntensity: 0.65,
        hauntingIntensity: 0.45, chandelierSway: 0.6,
      }}
      {...getCompositionMetadata(hauntedInterior.defaultProps)}
      calculateMetadata={({props}: {props: typeof hauntedInterior.defaultProps}) => metadataFor(hauntedInterior.id, hauntedInterior.schema.parse(props))}
    />
    <Composition
      id="CobwebLoop"
      component={cobweb.component}
      schema={cobweb.schema}
      defaultProps={{
        durationSeconds: 12, seed: 47, transparent: false, backgroundColor: '#100B1B',
        colors: ['#CFC6E4', '#F6EFD8', '#E8963C'], outputFormat: 'webm' as const,
        webCount: 4, strandCount: 12, moteCount: 40, spiderCount: 1, dewIntensity: 0.7, mistIntensity: 0.5,
      }}
      {...getCompositionMetadata(cobweb.defaultProps)}
      calculateMetadata={({props}: {props: typeof cobweb.defaultProps}) => metadataFor(cobweb.id, cobweb.schema.parse(props))}
    />
    <Composition
      id="SunburstLoop"
      component={sunburst.component}
      schema={sunburst.schema}
      defaultProps={{
        durationSeconds: 10, seed: 23, transparent: false, backgroundColor: '#5A0F18',
        colors: ['#9E1A26', '#C42A36'], outputFormat: 'webm' as const,
        rayCount: 20, rayWidth: 0.5, swirl: 0.5, spin: 3, coreFade: 0.7, coreShade: 0.6,
      }}
      {...getCompositionMetadata(sunburst.defaultProps)}
      calculateMetadata={({props}: {props: typeof sunburst.defaultProps}) => metadataFor(sunburst.id, sunburst.schema.parse(props))}
    />
    <Composition
      id="VaporwaveLoop"
      component={vaporwave.component}
      schema={vaporwave.schema}
      defaultProps={{
        durationSeconds: 16, seed: 88, transparent: false, backgroundColor: '#120C2E',
        colors: ['#FF71CE', '#01CDFE', '#FFFB96', '#B967FF'], outputFormat: 'webm' as const,
        speed: 4, sunPosition: 0.9, neonGlow: 0.7, starCount: 90, shootingStars: 1,
        palmCount: 2, shapeCount: 2, centerShade: 0.6,
      }}
      {...getCompositionMetadata(vaporwave.defaultProps)}
      calculateMetadata={({props}: {props: typeof vaporwave.defaultProps}) => metadataFor(vaporwave.id, vaporwave.schema.parse(props))}
    />
    <Composition
      id="GradientLoop"
      component={gradient.component}
      schema={gradient.schema}
      defaultProps={{"durationSeconds":8,"seed":1,"transparent":false,"backgroundColor":"#0B0F19","colors":["#73baf3","#818CF8","#F472B6"],"outputFormat":"webm" as const,"scale":1,"intensity":1}}
      {...getCompositionMetadata(gradient.defaultProps)}
      calculateMetadata={({props}: {props: typeof gradient.defaultProps}) => metadataFor(gradient.id, gradient.schema.parse(props))}
    />
    <Composition
      id="ParticleLoop"
      component={particles.component}
      schema={particles.schema}
      defaultProps={{
        durationSeconds: 8, seed: 1, transparent: false, backgroundColor: '#0B0F19',
        colors: ['#67E8F9', '#818CF8', '#F472B6'], outputFormat: 'webm', count: 100, size: 3, distribution: 'uniform',
      }}
      {...getCompositionMetadata(particles.defaultProps)}
      calculateMetadata={({props}: {props: typeof particles.defaultProps}) => metadataFor(particles.id, particles.schema.parse(props))}
    />
    <Composition
      id="GeometricLoop"
      component={geometry.component}
      schema={geometry.schema}
      defaultProps={{
        durationSeconds: 8, seed: 1, transparent: false, backgroundColor: '#0B0F19',
        colors: ['#67E8F9', '#818CF8', '#F472B6'], outputFormat: 'webm', count: 18, scale: 1,
      }}
      {...getCompositionMetadata(geometry.defaultProps)}
      calculateMetadata={({props}: {props: typeof geometry.defaultProps}) => metadataFor(geometry.id, geometry.schema.parse(props))}
    />
  </>
);
