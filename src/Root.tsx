import {Composition, Folder} from 'remotion';
import {backgroundCatalog, getAsset, getLayoutOf, overlayCatalog} from './catalog';
import {kindPolicies} from './kinds';
import {getBoxCanvas} from './overlays/shared/box';
import {getCompositionMetadata, getExportPreset, type BaseBackgroundProps} from './settings';
import {assetFileStem} from './sizes';

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
const dotGrid = backgroundCatalog.DotGridLoop;
const checkerboard = backgroundCatalog.CheckerboardLoop;
const webgl = backgroundCatalog.WebGLLoop;
const chat = overlayCatalog.ChatLoop;
const bloco = overlayCatalog.BlocoLoop;
const borda = overlayCatalog.BordaLoop;

type MetadataProps = Pick<BaseBackgroundProps, 'durationSeconds' | 'outputFormat' | 'transparent'>
  & {width?: number; height?: number; bleed?: number};

/** Studio defaults follow the official exporter: same size, codec, pixel format and file name. */
const metadataFor = <Props extends MetadataProps>(id: string, props: Props) => {
  const asset = getAsset(id);
  const preset = getExportPreset(props);
  // The layout is the single source of truth for the file size, so its sidecar can never disagree.
  // Without one, sized kinds fall back to the box plus the bleed on every side.
  const canvas = getLayoutOf(asset)?.(props).canvas ?? (props.width === undefined || props.height === undefined
    ? undefined
    : getBoxCanvas({width: props.width, height: props.height, bleed: props.bleed ?? 0}).canvas);
  return {
    ...getCompositionMetadata(props, canvas),
    props,
    // A PNG still has no video codec; the Studio keeps its own default there.
    defaultCodec: preset.codec ?? undefined,
    defaultVideoImageFormat: preset.imageFormat,
    defaultPixelFormat: 'pixelFormat' in preset ? preset.pixelFormat : undefined,
    defaultProResProfile: 'proResProfile' in preset ? preset.proResProfile : undefined,
    // Remotion appends the extension of the chosen codec to this name.
    defaultOutName: assetFileStem({id, kind: asset.kind, props}),
  };
};

export const RemotionRoot = () => (
  <>
    <Folder name={kindPolicies.background.folder}>
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
          hauntingIntensity: 0.45, chandelierSway: 0.6, lightningIntensity: 0.7,
        }}
        {...getCompositionMetadata(hauntedInterior.defaultProps)}
        calculateMetadata={({props}: {props: typeof hauntedInterior.defaultProps}) => metadataFor(hauntedInterior.id, hauntedInterior.schema.parse(props))}
      />
      <Composition
        id="CobwebLoop"
        component={cobweb.component}
        schema={cobweb.schema}
        defaultProps={{"durationSeconds":12,"seed":47,"transparent":false,"backgroundColor":"#6630de","colors":["#c7bae7","#e4c769","#7c1b7d"],"outputFormat":"webm" as const,"webCount":4,"strandCount":12,"moteCount":40,"spiderCount":1,"dewIntensity":0.7,"mistIntensity":0.5}}
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
        id="WebGLLoop"
        component={webgl.component}
        schema={webgl.schema}
        defaultProps={{"durationSeconds":16,"seed":7,"transparent":false,"backgroundColor":"#385093","colors":["#ed70cb","#818CF8","#F472B6"],"outputFormat":"webm" as const,"experiment":"mesh" as const,"speed":1,"scale":1,"intensity":1,"centerFade":0.5}}
        {...getCompositionMetadata(webgl.defaultProps)}
        calculateMetadata={({props}: {props: typeof webgl.defaultProps}) => metadataFor(webgl.id, webgl.schema.parse(props))}
      />
      <Composition
        id="DotGridLoop"
        component={dotGrid.component}
        schema={dotGrid.schema}
        defaultProps={{"durationSeconds":8,"seed":1,"transparent":false,"backgroundColor":"#10162B","outputFormat":"webm" as const,"direction":"down-right" as const,"layout":"alternating" as const,"dotColor":"#7C8CFF","dotSize":10,"spacing":48,"speed":24}}
        {...getCompositionMetadata(dotGrid.defaultProps)}
        calculateMetadata={({props}: {props: typeof dotGrid.defaultProps}) => metadataFor(dotGrid.id, dotGrid.schema.parse(props))}
      />
      <Composition
        id="CheckerboardLoop"
        component={checkerboard.component}
        schema={checkerboard.schema}
        defaultProps={{"durationSeconds":8,"seed":1,"transparent":false,"backgroundColor":"#fc0fad","outputFormat":"mp4" as const,"direction":"up-right" as const,"angle":22,"squareColor":"#222C57","squareSize":80,"speed":40}}
        {...getCompositionMetadata(checkerboard.defaultProps)}
        calculateMetadata={({props}: {props: typeof checkerboard.defaultProps}) => metadataFor(checkerboard.id, checkerboard.schema.parse(props))}
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
    </Folder>
    {/* Sized overlays: the Studio size is the layout's canvas (box + 2·bleed), as in the export. */}
    <Folder name={kindPolicies.chat.folder}>
      <Composition
        id="ChatLoop"
        component={chat.component}
        schema={chat.schema}
        defaultProps={{"durationSeconds":8,"seed":1,"transparent":true,"backgroundColor":"#0B0620","outputFormat":"webm" as const,"width":400,"height":600,"bleed":32,"guides":false,"radius":16,"padding":16,"fill":"gradiente" as const,"fillColors":["#120A38","#26105C","#0A1C4E"],"fillOpacity":0.9,"fillScale":32,"fillSpeed":16,"fillAngle":60,"fillRise":false,"fillLight":0.05,"strokeMotion":"cometas" as const,"strokeColors":["#22D3EE","#E879F9","#A78BFA"],"strokeWidth":3,"dashLength":16,"gapLength":12,"cometSpacing":640,"cometTail":320,"gradientLength":480,"strokeSpeed":160,"strokePulses":1,"strokeCore":0.9,"trackOpacity":0.45,"glow":20,"glowPulses":1,"glowStrength":3,"halo":24,"haloColor":"#A855F7","rimLight":0,"headerHeight":48,"headerColor":"#E879F9","headerOpacity":0.1,"headerLineWidth":2,"ornaments":"nenhum" as const,"ornamentColors":["#CFC6E4","#F6EFD8","#E8963C"],"ornamentSize":48,"ornamentScale":1,"lightning":0}}
        {...getCompositionMetadata(chat.defaultProps, chat.getLayout(chat.defaultProps).canvas)}
        calculateMetadata={({props}: {props: typeof chat.defaultProps}) => metadataFor(chat.id, chat.schema.parse(props))}
      />
    </Folder>
    <Folder name={kindPolicies.bloco.folder}>
      <Composition
        id="BlocoLoop"
        component={bloco.component}
        schema={bloco.schema}
        defaultProps={{"durationSeconds":8,"seed":1,"transparent":true,"backgroundColor":"#0B0F19","outputFormat":"webm" as const,"width":640,"height":360,"bleed":32,"guides":false,"shape":"retangulo" as const,"radius":16,"paddingX":24,"paddingY":16,"fill":"gradiente" as const,"fillColors":["#120A38","#26105C","#0A1C4E"],"fillOpacity":0.9,"fillScale":32,"fillSpeed":16,"fillAngle":60,"fillRise":false,"fillLight":0.05,"strokeMotion":"cometas" as const,"strokeColors":["#22D3EE","#E879F9"],"strokeWidth":4,"dashLength":16,"gapLength":12,"cometSpacing":640,"cometTail":320,"gradientLength":480,"strokeSpeed":160,"strokePulses":1,"strokeCore":0.9,"trackOpacity":0.45,"glow":20,"glowPulses":2,"glowStrength":3,"halo":20,"haloColor":"#A855F7","rimLight":0,"accent":"nenhum" as const,"accentColor":"#E879F9","accentSize":6,"accentSheen":0,"ornaments":"nenhum" as const,"ornamentColors":["#CFC6E4","#F6EFD8","#E8963C"],"ornamentSize":48,"ornamentScale":1,"lightning":0}}
        {...getCompositionMetadata(bloco.defaultProps, bloco.getLayout(bloco.defaultProps).canvas)}
        calculateMetadata={({props}: {props: typeof bloco.defaultProps}) => metadataFor(bloco.id, bloco.schema.parse(props))}
      />
    </Folder>
    <Folder name={kindPolicies.borda.folder}>
      <Composition
        id="BordaLoop"
        component={borda.component}
        schema={borda.schema}
        defaultProps={{"durationSeconds":8,"seed":1,"transparent":true,"backgroundColor":"#0B0620","outputFormat":"webm" as const,"width":640,"height":360,"bleed":48,"guides":false,"fit":"janela" as const,"shape":"retangulo" as const,"mascara":false,"radius":16,"thickness":10,"fill":"solido" as const,"fillColors":["#120A38"],"fillOpacity":0.9,"fillScale":12,"fillSpeed":24,"fillAngle":45,"fillRise":false,"fillLight":0,"strokeMotion":"cometas" as const,"strokeColors":["#22D3EE","#E879F9","#A78BFA"],"strokeWidth":4,"dashLength":18,"gapLength":12,"cometSpacing":640,"cometTail":320,"gradientLength":480,"strokeSpeed":160,"strokePulses":1,"strokeCore":0.9,"trackOpacity":0.45,"glow":16,"glowPulses":0,"glowStrength":2.6,"halo":0,"haloColor":"#A78BFA","rimLight":0,"lines":2,"lineGap":4,"outerLineWidth":2,"corners":"colchetes" as const,"cornerSize":28,"cornerGap":6,"gemSize":14,"cornerPulses":1,"ornaments":"nenhum" as const,"ornamentColors":["#CFC6E4","#F6EFD8","#E8963C"],"ornamentSize":48,"ornamentScale":1,"lightning":0}}
        {...getCompositionMetadata(borda.defaultProps, borda.getLayout(borda.defaultProps).canvas)}
        calculateMetadata={({props}: {props: typeof borda.defaultProps}) => metadataFor(borda.id, borda.schema.parse(props))}
      />
    </Folder>
  </>
);
