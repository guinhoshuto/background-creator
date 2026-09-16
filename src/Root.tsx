import {Composition} from 'remotion';
import {backgroundCatalog} from './catalog';
import {getCompositionMetadata, getExportPreset, type BaseBackgroundProps} from './settings';

const gradient = backgroundCatalog.GradientLoop;
const particles = backgroundCatalog.ParticleLoop;
const geometry = backgroundCatalog.GeometricLoop;

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
