import {Composition} from 'remotion';
import {backgroundCatalog} from './catalog';
import {getCompositionMetadata, getExportPreset, type BaseBackgroundProps} from './settings';

const gradient = backgroundCatalog.GradientLoop;
const particles = backgroundCatalog.ParticleLoop;
const geometry = backgroundCatalog.GeometricLoop;
const halloween = backgroundCatalog.HalloweenLoop;
const kawaii = backgroundCatalog.KawaiiLoop;
const cobweb = backgroundCatalog.CobwebLoop;
const sunburst = backgroundCatalog.SunburstLoop;

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
