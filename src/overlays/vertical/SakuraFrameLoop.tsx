import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {OverlayCanvas} from '../shared/render';
import {cornerRectPath, type CornerRect} from './geometry';
import {verticalBaseFields} from './schema';
import {FACE_BAND, LIVE_COMMENTS_CLEAR, LIVE_HOST_CARD, LIVE_TOP_RIGHT, LIVE_BAR, SAFE_FEED} from './zones';

export const SAKURA_STYLES = ['watercolor', 'moonlit', 'botanical', 'relief'] as const;
export type SakuraStyle = typeof SAKURA_STYLES[number];
export const sakuraFrameSchema = z.object({
  ...verticalBaseFields(),
  style: z.enum(SAKURA_STYLES).describe('Cherry blossom artwork: watercolor, moonlit, botanical or sculpted relief').default('watercolor'),
  motion: z.number().finite().min(0).max(1).describe('Ambient branch sway; zero keeps the artwork still').default(0.6),
  petals: z.number().int().min(0).max(12).describe('Drifting petals confined to the frame edges').default(6),
  label: z.string().max(28).describe('Optional nameplate; leave empty for a clean frame').default(''),
  safeZones: z.boolean().describe('Static guide for placement, exported separately from the overlay').default(false),
});
export type SakuraFrameProps = z.infer<typeof sakuraFrameSchema>;

/** This guaranteed clear window is fixed on every frame; the rest is clear except the artwork. */
export const SAKURA_CLEAR_WINDOW: CornerRect = {x: 156, y: 344, width: 768, height: 1186, radii: [40, 40, 40, 40]};
export const SAKURA_HOLE = `M0 0H1080V1920H0Z${cornerRectPath(SAKURA_CLEAR_WINDOW)}`;
const TAU = Math.PI * 2;
const fixed = (n: number) => Number(n.toFixed(6));
const at = (frame: number, duration: number) => ((frame % duration) + duration) % duration / duration;

/** Integer loop frequencies, with positions and derivatives continuous at the seam. */
export const sakuraMotion = (props: SakuraFrameProps, frame: number, duration: number) => {
  const t = at(frame, duration);
  const phase = t * TAU;
  return {
    top: fixed(Math.sin(phase) * props.motion * 0.8),
    bottom: fixed(Math.sin(phase + 1.2) * props.motion * 0.6),
    petals: Array.from({length: props.petals}, (_, i) => {
      const p = (t + (i + 0.37) / Math.max(1, props.petals)) % 1;
      const right = i % 2 === 1;
      return {
        x: fixed((right ? 1014 : 52) + Math.sin(p * TAU + i) * 25),
        y: fixed(285 + p * 1330),
        angle: fixed(Math.sin(p * TAU + i * 2) * 65 + i * 37),
        scale: fixed(0.1 + (i % 3) * 0.025),
        // Zero position contribution at each teleport; sin² has a zero derivative too.
        opacity: fixed(Math.sin(p * Math.PI) ** 2 * (right ? 0.58 : 0.28) * props.motion),
      };
    }),
  };
};

type Palette = {petal: string; edge: string; light: string; center: string; branch: string; bark: string; leaf: string; ring: string; shadow: string};
export const SAKURA_PALETTES: Record<SakuraStyle, Palette> = {
  watercolor: {petal:'#F3B7C3',edge:'#D9869D',light:'#FFF2E8',center:'#B75E6D',branch:'#A07563',bark:'#CCA18A',leaf:'#BCB39B',ring:'#E7A4B3',shadow:'#9A5A65'},
  moonlit: {petal:'#D7A7DA',edge:'#9B64B0',light:'#FFF0F5',center:'#E6ABBC',branch:'#473047',bark:'#A8809E',leaf:'#777091',ring:'#AD83C8',shadow:'#150F26'},
  botanical: {petal:'#E9B5A9',edge:'#E9B5A9',light:'#F0C5B6',center:'#976759',branch:'#737664',bark:'#737664',leaf:'#9CA58B',ring:'#929D83',shadow:'#737664'},
  relief: {petal:'#EAB1C5',edge:'#D697B2',light:'#FFF1F4',center:'#D69EAB',branch:'#B58A87',bark:'#DFC1B5',leaf:'#C9B7D4',ring:'#E8AEC2',shadow:'#AC7588'},
};

const PETAL = 'M0 1C-11-7-34-25-35-45C-37-60-28-71-17-72C-9-73-5-66 0-61C5-67 11-74 19-71C34-68 38-57 33-43C27-24 11-7 0 1Z';
const PETAL_ALT = 'M0 1C-14-5-35-25-33-44C-35-60-27-69-15-70C-7-70-3-64 0-60C5-65 10-72 19-69C34-64 36-52 31-38C25-21 13-5 0 1Z';

const Petal = ({style, id, variant = 0}: {style:SakuraStyle; id:string; variant?:number}) => {
  const c = SAKURA_PALETTES[style];
  const d = variant % 2 ? PETAL_ALT : PETAL;
  const flat = style === 'botanical';
  return <>
    {style === 'relief' ? <path d={d} transform="translate(1.4 2.3)" fill={c.shadow} opacity={0.16} /> : null}
    <path d={d} fill={flat ? c.petal : `url(#${id}-petal)`} stroke={flat ? 'none' : c.edge} strokeWidth={style === 'watercolor' ? 0.65 : 0.5} strokeOpacity={0.4} />
    {flat ? null : <>
      <path d="M0-3C-3-23-6-39-1-58M-2-16C-11-24-21-36-25-49M-1-21C7-30 16-43 21-55" fill="none" stroke={style === 'relief' ? '#FFFFFF' : c.edge} strokeOpacity={style === 'relief' ? 0.27 : 0.2} strokeWidth={0.65} />
      <path d="M-30-44C-34-59-24-70-16-69" fill="none" stroke={c.light} strokeWidth={1.4} opacity={0.6} />
    </>}
    {style === 'watercolor' ? <path d="M-2-3C-9-15-20-30-21-40C-17-38-11-27-6-21C4-29 17-42 18-45C16-24 7-9-2-3Z" fill={c.edge} opacity={0.12} /> : null}
  </>;
};

const Blossom = ({x,y,size,angle=0,style,id}: {x:number;y:number;size:number;angle?:number;style:SakuraStyle;id:string}) => {
  const c = SAKURA_PALETTES[style];
  const flat = style === 'botanical';
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size / 74})`} data-flower="sakura">
    <g filter={style === 'relief' || style === 'moonlit' ? `url(#${id}-shadow)` : undefined}>
      {Array.from({length:5},(_,i)=><g key={i} transform={`rotate(${i*72}) scale(${1 - i%3*0.018} 1)`}><Petal style={style} id={id} variant={i} /></g>)}
    </g>
    <circle r={flat ? 6 : 12} fill={flat ? c.center : `url(#${id}-heart)`} opacity={flat ? 0.3 : 0.8} />
    {Array.from({length:flat ? 15 : 23},(_,i)=>{
      const a = i / (flat ? 15 : 23) * TAU + 0.12;
      const length = 15 + i % 4 * 4;
      const x2 = Math.cos(a) * length;
      const y2 = Math.sin(a) * length;
      return <g key={i}>
        <path d={`M${Math.cos(a)*4} ${Math.sin(a)*4}Q${x2*0.6+2} ${y2*0.7} ${x2} ${y2}`} fill="none" stroke={style === 'relief' ? '#F4DAB8' : c.center} strokeWidth={flat ? 0.9 : 0.8} opacity={0.86}/>
        <ellipse cx={x2} cy={y2} rx={flat ? 1.35 : 1.8} ry={flat ? 1.35 : 2.2} fill={style === 'relief' || style === 'moonlit' ? '#EBD3AC' : c.center} transform={`rotate(${a*180/Math.PI} ${x2} ${y2})`} />
      </g>;
    })}
  </g>;
};

const Leaf = ({x,y,angle,scale,style,id}: {x:number;y:number;angle:number;scale:number;style:SakuraStyle;id:string}) => {
  const c = SAKURA_PALETTES[style];
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
    <path d="M0 0C-22-20-28-53-12-83C7-59 24-24 0 0Z" fill={c.leaf} stroke={c.branch} strokeWidth={0.4} strokeOpacity={0.2} filter={style==='relief'?`url(#${id}-shadow)`:undefined}/>
    <path d="M0 0Q-2-34-12-78M-3-22L-18-38M-5-43L4-57" fill="none" stroke={style==='relief'?'#F2EAF5':c.branch} strokeWidth={0.7} opacity={0.45}/>
  </g>;
};

const Bud = ({x,y,angle,style,id}: {x:number;y:number;angle:number;style:SakuraStyle;id:string}) => {
  const c=SAKURA_PALETTES[style];
  return <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <path d="M0 6C-15 1-16-23-6-34C-2-38 2-33 4-31C15-24 15-4 0 6Z" fill={style==='botanical'?c.petal:`url(#${id}-petal)`} stroke={c.edge} strokeWidth={0.5}/>
    <path d="M-9 0L-4 14L1 8L5 12L10-1L1 3Z" fill={c.branch}/>
    <path d="M0 6Q-4-11-3-28" fill="none" stroke={c.edge} strokeWidth={0.7} opacity={0.5}/>
  </g>;
};

const MAIN_BRANCH='M-28 534C27 412 38 313 53 227C67 155 139 108 231 91C365 67 458 60 628 13';
const TWIGS=[
  'M41 305C65 273 91 254 125 219',
  'M58 214C48 179 44 150 18 116',
  'M91 157C120 139 154 158 180 161C222 167 251 169 282 203',
  'M158 112C173 85 191 56 202 19',
  'M231 91C259 110 283 117 315 131C343 143 354 163 361 183',
  'M300 78C313 62 340 43 353 12',
  'M390 60C417 77 444 84 478 91C502 95 515 107 529 122',
  'M456 51C485 32 493 10 503-20',
  'M27 372C51 368 70 369 87 351',
  'M13 423C0 416-8 402-20 399',
];

const Branch = ({style,id}: {style:SakuraStyle;id:string}) => {
  const c=SAKURA_PALETTES[style];
  const flat=style==='botanical';
  const blooms=flat ? [[125,219,66,-12],[315,131,49,13],[202,19,34,0],[87,351,30,-20]] : [[125,219,91,-12],[180,161,56,15],[315,131,61,12],[202,19,53,14],[478,91,36,4],[87,351,39,-12],[18,116,45,0]];
  return <g data-branch={style}>
    <path d={MAIN_BRANCH} fill="none" stroke={c.branch} strokeWidth={flat?9:15} strokeLinecap="round"/>
    {!flat?<path d={MAIN_BRANCH} fill="none" stroke={c.bark} strokeWidth={4} strokeLinecap="round" opacity={0.5} transform="translate(-2 -2)"/>:null}
    {TWIGS.map((d,i)=><g key={i}>
      <path d={d} fill="none" stroke={c.branch} strokeWidth={flat?2.7:4.8-i%3*0.7} strokeLinecap="round"/>
      {!flat?<path d={d} fill="none" stroke={c.bark} strokeWidth={1.1} opacity={0.55}/>:null}
    </g>)}
    {style==='relief'||flat?<>
      <Leaf x={135} y={182} angle={-44} scale={style==='relief'?1.15:0.58} style={style} id={id}/>
      <Leaf x={231} y={94} angle={62} scale={style==='relief'?1.1:0.58} style={style} id={id}/>
      <Leaf x={87} y={351} angle={-57} scale={0.65} style={style} id={id}/>
      <Leaf x={398} y={62} angle={28} scale={0.46} style={style} id={id}/>
    </>:null}
    <Bud x={282} y={203} angle={142} style={style} id={id}/>
    <Bud x={361} y={183} angle={147} style={style} id={id}/>
    <Bud x={529} y={122} angle={143} style={style} id={id}/>
    <Bud x={353} y={12} angle={34} style={style} id={id}/>
    {blooms.map(([x,y,size,angle],i)=><Blossom key={i} x={x!} y={y!} size={size!} angle={angle!} style={style} id={id}/>)}
  </g>;
};

const ArtworkDefs=({style,id}:{style:SakuraStyle;id:string})=>{
  const c=SAKURA_PALETTES[style];
  return <defs>
    <radialGradient id={`${id}-petal`} cx={style==='relief'?'30%':'42%'} cy="25%" r="85%" fx="25%" fy="15%">
      <stop offset="0" stopColor={c.light}/><stop offset="0.55" stopColor={c.petal}/><stop offset="1" stopColor={c.edge}/>
    </radialGradient>
    <radialGradient id={`${id}-heart`}><stop stopColor={c.center}/><stop offset="1" stopColor={c.center} stopOpacity="0"/></radialGradient>
    <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
      <feDropShadow dx={style==='relief'?1.5:0} dy={style==='relief'?3:1} stdDeviation={style==='relief'?1.8:1} floodColor={c.shadow} floodOpacity={0.25}/>
    </filter>
    <clipPath id={`${id}-content-clear`}><path d={SAKURA_HOLE} clipRule="evenodd"/></clipPath>
    <mask id={`${id}-quiet-comments`} maskUnits="userSpaceOnUse" x="0" y="0" width="1080" height="1920">
      <rect width="1080" height="1920" fill="white"/>
      <rect x="0" y="1290" width="780" height="485" fill="#333333"/>
    </mask>
  </defs>;
};

const Guide = () => {
  const zones=[['FACE / MAIN CONTENT',FACE_BAND,'#62B6AD'],['NATIVE COMMENTS',LIVE_COMMENTS_CLEAR,'#D79A42'],['HOST CARD',LIVE_HOST_CARD,'#DA7C92'],['VIEWERS',LIVE_TOP_RIGHT,'#DA7C92'],['MESSAGE BAR',LIVE_BAR,'#DA7C92'],['FEED SAFE AREA',SAFE_FEED,'#A78BDD']] as const;
  return <g data-layer="safe-zones" fontFamily="Arial, sans-serif">
    {zones.map(([name,box,color])=><g key={name}>
      <rect x={box.x} y={box.y} width={box.width} height={box.height} fill={color} fillOpacity={0.13} stroke={color} strokeWidth="2" strokeDasharray="10 7"/>
      <rect x={box.x+8} y={box.y+8} width={name.length*12+16} height="30" rx="4" fill="#141824" fillOpacity="0.9"/>
      <text x={box.x+16} y={box.y+29} fill="white" fontSize="18">{name}</text>
    </g>)}
    <path d={cornerRectPath(SAKURA_CLEAR_WINDOW)} fill="none" stroke="white" strokeWidth="3" strokeDasharray="5 8"/>
    <text x="178" y="380" fill="#FFFFFF" stroke="#202030" strokeWidth="4" paintOrder="stroke" fontSize="19">GUARANTEED CLEAR WINDOW</text>
  </g>;
};

export const SakuraFrame = ({props,frame,durationInFrames}:{props:SakuraFrameProps;frame:number;durationInFrames:number})=>{
  const id=`sakura-${props.style}`;
  const c=SAKURA_PALETTES[props.style];
  const motion=sakuraMotion(props,props.safeZones?0:frame,durationInFrames);
  const botanical=props.style==='botanical';
  return <OverlayCanvas key={frame} props={props} width={1080} height={1920} idPrefix={id}>
    <ArtworkDefs style={props.style} id={id}/>
    <g clipPath={`url(#${id}-content-clear)`} mask={`url(#${id}-quiet-comments)`}>
      {props.style==='relief'?<>
        <rect x="22" y="23" width="1036" height="1874" rx="48" fill="none" stroke="#BB8497" strokeOpacity="0.22" strokeWidth="9"/>
        <rect x="20" y="20" width="1036" height="1874" rx="48" fill="none" stroke="#FBE3EB" strokeWidth="7"/>
      </>:<rect x="22" y="22" width="1036" height="1876" rx={botanical?0:props.style==='moonlit'?4:34} fill="none" stroke={c.ring} strokeWidth={botanical?3:1.7} opacity={props.style==='watercolor'?0.7:0.8}/>}
      <g transform={botanical?'translate(1080 0) scale(-1 1)':undefined}>
        <g transform={`rotate(${motion.top} 30 70)`}><Branch style={props.style} id={id}/></g>
      </g>
      <g transform={botanical?'translate(0 1920) scale(0.72 -0.72)':'translate(1080 1920) rotate(180) scale(0.8)'}>
        <g transform={`rotate(${motion.bottom} 30 70)`}><Branch style={props.style} id={id}/></g>
      </g>
      <g data-layer="drifting-petals">
        {motion.petals.map((p,i)=><g key={i} opacity={p.opacity} transform={`translate(${p.x} ${p.y}) rotate(${p.angle}) scale(${p.scale})`}><Petal style={props.style} id={id}/></g>)}
      </g>
    </g>
    {props.label ? <g data-layer="nameplate">
      <rect x="340" y="285" width="400" height="46" rx="23" fill={props.style==='moonlit'?'#21172E':'#FFF1F3'} fillOpacity="0.94" stroke={c.ring} strokeWidth="1.5"/>
      <text x="540" y="314" textAnchor="middle" fill={c.branch} fontFamily="Georgia, serif" fontSize="22">{props.label}</text>
    </g>:null}
    {props.safeZones?<Guide/>:null}
  </OverlayCanvas>;
};

export const SakuraFrameLoop=(props:SakuraFrameProps)=>{
  const frame=useCurrentFrame();
  const {durationInFrames}=useVideoConfig();
  return <SakuraFrame props={props} frame={frame} durationInFrames={durationInFrames}/>;
};
export const sakuraFrameCatalogEntry={id:'SakuraFrameLoop',kind:'vertical',component:SakuraFrameLoop,schema:sakuraFrameSchema,defaultProps:sakuraFrameSchema.parse({})} as const;
