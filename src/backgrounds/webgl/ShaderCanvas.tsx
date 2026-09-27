import {useLayoutEffect, useRef} from 'react';
import {getRemotionEnvironment} from 'remotion';
import {GLSL_VERTEX} from './glsl';

export type UniformValue = number | readonly number[];
export type Uniforms = Record<string, UniformValue>;

type UniformSlot = {location: WebGLUniformLocation; type: number; size: number};
type ShaderState = {gl: WebGL2RenderingContext; source: string; program: WebGLProgram; slots: Map<string, UniformSlot>};

export const WEBGL_UNAVAILABLE_MESSAGE =
  'WebGL2 indisponível. Para exportar, use os comandos oficiais (npm run render:mp4, render:webm ou render:gif), que abrem o Chrome com o renderizador OpenGL "angle"; no diálogo de render do Studio, escolha "angle" em OpenGL renderer.';

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Não foi possível criar o shader WebGL.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`O shader não compilou:\n${log}`);
  }
  return shader;
};

const link = (gl: WebGL2RenderingContext, fragmentSource: string): ShaderState => {
  const vertex = compile(gl, gl.VERTEX_SHADER, GLSL_VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Não foi possível criar o programa WebGL.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`O programa WebGL não ligou:\n${log}`);
  }
  // The compiler drops unused uniforms; only the active ones need a value.
  const slots = new Map<string, UniformSlot>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    const location = gl.getUniformLocation(program, info.name);
    if (location) slots.set(name, {location, type: info.type, size: info.size});
  }
  return {gl, source: fragmentSource, program, slots};
};

/** Components per element for each uniform type the experiments use. */
const componentsOf = (gl: WebGL2RenderingContext, type: number) => {
  switch (type) {
    case gl.FLOAT: case gl.INT: case gl.UNSIGNED_INT: case gl.BOOL: return 1;
    case gl.FLOAT_VEC2: case gl.INT_VEC2: case gl.UNSIGNED_INT_VEC2: case gl.BOOL_VEC2: return 2;
    case gl.FLOAT_VEC3: case gl.INT_VEC3: case gl.UNSIGNED_INT_VEC3: case gl.BOOL_VEC3: return 3;
    case gl.FLOAT_VEC4: case gl.INT_VEC4: case gl.UNSIGNED_INT_VEC4: case gl.BOOL_VEC4: return 4;
    default: throw new Error(`Tipo de uniform não suportado: 0x${type.toString(16)}.`);
  }
};

const setUniform = (gl: WebGL2RenderingContext, name: string, slot: UniformSlot, value: UniformValue) => {
  const values = typeof value === 'number' ? [value] : [...value];
  const components = componentsOf(gl, slot.type);
  if (values.length === 0 || values.length % components !== 0 || values.length > components * slot.size) {
    throw new Error(`O uniform ${name} recebeu ${values.length} valores; esperava múltiplos de ${components}, até ${components * slot.size}.`);
  }
  if (!values.every(Number.isFinite)) throw new Error(`O uniform ${name} recebeu um valor não finito.`);
  const {location} = slot;
  switch (slot.type) {
    case gl.FLOAT: gl.uniform1fv(location, values); break;
    case gl.FLOAT_VEC2: gl.uniform2fv(location, values); break;
    case gl.FLOAT_VEC3: gl.uniform3fv(location, values); break;
    case gl.FLOAT_VEC4: gl.uniform4fv(location, values); break;
    case gl.INT: case gl.BOOL: gl.uniform1iv(location, values); break;
    case gl.INT_VEC2: case gl.BOOL_VEC2: gl.uniform2iv(location, values); break;
    case gl.INT_VEC3: case gl.BOOL_VEC3: gl.uniform3iv(location, values); break;
    case gl.INT_VEC4: case gl.BOOL_VEC4: gl.uniform4iv(location, values); break;
    case gl.UNSIGNED_INT: gl.uniform1uiv(location, values); break;
    case gl.UNSIGNED_INT_VEC2: gl.uniform2uiv(location, values); break;
    case gl.UNSIGNED_INT_VEC3: gl.uniform3uiv(location, values); break;
    case gl.UNSIGNED_INT_VEC4: gl.uniform4uiv(location, values); break;
  }
};

/**
 * A full-frame WebGL2 canvas that draws one fragment shader. It draws synchronously on every
 * render, before the browser paints, from the uniforms alone: nothing is kept between frames
 * but the compiled program, so any frame can be rendered first and in any tab.
 */
export const ShaderCanvas = ({fragmentShader, uniforms, width, height}: {
  fragmentShader: string;
  uniforms: Uniforms;
  width: number;
  height: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<ShaderState | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lost = (event: Event) => {
      // Let the browser restore the context; the next frame compiles the program again.
      event.preventDefault();
      stateRef.current = null;
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      const state = stateRef.current;
      if (state && !state.gl.isContextLost()) state.gl.deleteProgram(state.program);
      stateRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      // The frame is captured after it is composited; the buffer must survive until then.
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error(WEBGL_UNAVAILABLE_MESSAGE);
    if (gl.isContextLost()) {
      // A blank frame in a file would be silent damage; in the Studio the next frame retries.
      if (getRemotionEnvironment().isRendering) throw new Error('O contexto WebGL foi perdido durante o render.');
      return;
    }
    let state = stateRef.current;
    if (!state || state.gl !== gl || state.source !== fragmentShader) {
      if (state && state.gl === gl) gl.deleteProgram(state.program);
      state = link(gl, fragmentShader);
      stateRef.current = state;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(state.program);
    for (const [name, slot] of state.slots) {
      const value = uniforms[name];
      if (value === undefined) throw new Error(`O shader espera o uniform ${name}, que a cena não forneceu.`);
      setUniform(gl, name, slot, value);
    }
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  return <canvas ref={canvasRef} width={width} height={height} style={{position: 'absolute', inset: 0, width, height}} />;
};
