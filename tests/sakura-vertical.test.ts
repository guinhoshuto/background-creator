import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SakuraFrame, SAKURA_STYLES, SAKURA_CLEAR_WINDOW, SAKURA_HOLE, sakuraFrameSchema, sakuraMotion} from '../src/overlays/vertical/SakuraFrameLoop';
import {hasAlpha} from '../src/settings';

const markup=(style:typeof SAKURA_STYLES[number],frame:number,patch={})=>renderToStaticMarkup(createElement(SakuraFrame,{props:sakuraFrameSchema.parse({style,...patch}),frame,durationInFrames:480}));

test('sakura presets retain alpha, fixed portrait geometry and distinct artwork',()=>{
  const variants=new Set<string>();
  for(const style of SAKURA_STYLES){
    const raw=JSON.parse(readFileSync(new URL(`../presets/vertical-sakura-${style}.json`,import.meta.url),'utf8'));
    const props=sakuraFrameSchema.strict().parse(raw);
    assert.equal(props.style,style);
    assert.equal(hasAlpha({...props,outputFormat:'png'}),true);
    assert.equal(hasAlpha({...props,outputFormat:'webm'}),true);
    assert.equal(hasAlpha({...props,outputFormat:'mp4'}),false);
    assert.equal(props.backgroundColor,'#00FF00');
    const rendered=markup(style,0);
    assert.match(rendered,/viewBox="0 0 1080 1920"/);
    assert.ok(rendered.includes(`clip-path="url(#sakura-${style}-content-clear)"`));
    assert.ok(rendered.includes(`d="${SAKURA_HOLE}"`));
    assert.ok(rendered.includes('clip-rule="evenodd"'));
    assert.doesNotMatch(rendered,/<image|mix-blend-mode|<foreignObject/);
    variants.add(rendered);
  }
  assert.equal(variants.size,4);
  assert.deepEqual(SAKURA_CLEAR_WINDOW,{x:156,y:344,width:768,height:1186,radii:[40,40,40,40]});
});

test('sakura loop closes exactly and actually moves at the selected amplitude',()=>{
  for(const style of SAKURA_STYLES){
    const props=sakuraFrameSchema.parse({style});
    assert.deepEqual(sakuraMotion(props,0,480),sakuraMotion(props,480,480));
    assert.equal(markup(style,0),markup(style,480));
    assert.notEqual(markup(style,0),markup(style,120));
    assert.equal(markup(style,0,{motion:0,petals:0}),markup(style,120,{motion:0,petals:0}));
    const before=sakuraMotion(props,479,480).top;
    const after=sakuraMotion(props,1,480).top;
    assert.ok(Math.abs(before+after)<0.000002,'branch velocity must continue through the seam');
  }
});

test('the guide is separate and stable; optional labels are escaped',()=>{
  assert.doesNotMatch(markup('botanical',0),/GUARANTEED CLEAR WINDOW|data-layer="nameplate"/);
  assert.match(markup('botanical',0,{safeZones:true}),/GUARANTEED CLEAR WINDOW/);
  assert.equal(markup('botanical',0,{safeZones:true}),markup('botanical',120,{safeZones:true}));
  assert.match(markup('botanical',0,{label:'<Sakura>'}),/&lt;Sakura&gt;/);
  assert.equal(sakuraFrameSchema.safeParse({motion:Infinity}).success,false);
  assert.equal(sakuraFrameSchema.safeParse({petals:13}).success,false);
  assert.equal(sakuraFrameSchema.safeParse({style:'unknown'}).success,false);
});
