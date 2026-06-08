import React, { useEffect, useRef, useState } from 'react';

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/* -------------------------------------------------------------------------- */
/*  Minimal column-major mat4 helpers (same conventions as three.js / WebGL)  */
/* -------------------------------------------------------------------------- */
type M4 = Float32Array;

function perspective(fovyRad: number, aspect: number, near: number, far: number): M4 {
  const f = 1.0 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function translation(x: number, y: number, z: number): M4 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

function rotationX(rad: number): M4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotationY(rad: number): M4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // prettier-ignore
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

// out = a * b
function multiply(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/* -------------------------------------------------------------------------- */
/*  Geometry (matches three.js PlaneGeometry vertex/UV/index layout)          */
/* -------------------------------------------------------------------------- */
interface Plane {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

function createPlane(width: number, height: number, wSeg: number, hSeg: number): Plane {
  const wHalf = width / 2;
  const hHalf = height / 2;
  const gridX1 = wSeg + 1;
  const gridY1 = hSeg + 1;
  const segW = width / wSeg;
  const segH = height / hSeg;

  const positions = new Float32Array(gridX1 * gridY1 * 3);
  const uvs = new Float32Array(gridX1 * gridY1 * 2);
  let p = 0;
  let u = 0;
  for (let iy = 0; iy < gridY1; iy++) {
    const y = iy * segH - hHalf;
    for (let ix = 0; ix < gridX1; ix++) {
      const x = ix * segW - wHalf;
      positions[p++] = x;
      positions[p++] = -y;
      positions[p++] = 0;
      uvs[u++] = ix / wSeg;
      uvs[u++] = 1 - iy / hSeg;
    }
  }

  const indices = new Uint16Array(wSeg * hSeg * 6);
  let i = 0;
  for (let iy = 0; iy < hSeg; iy++) {
    for (let ix = 0; ix < wSeg; ix++) {
      const a = ix + gridX1 * iy;
      const b = ix + gridX1 * (iy + 1);
      const c = ix + 1 + gridX1 * (iy + 1);
      const d = ix + 1 + gridX1 * iy;
      indices[i++] = a;
      indices[i++] = b;
      indices[i++] = d;
      indices[i++] = b;
      indices[i++] = c;
      indices[i++] = d;
    }
  }

  return { positions, uvs, indices };
}

function createParticles(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 10;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }
  return pos;
}

/* -------------------------------------------------------------------------- */
/*  Color: sRGB hex -> linear, matching THREE.Color with ColorManagement on.  */
/*  three.js feeds linear color values to shaders, and these ShaderMaterials   */
/*  write their result straight to the framebuffer (no output encoding), so    */
/*  we linearize on input and leave the output untouched to match it exactly.  */
/* -------------------------------------------------------------------------- */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinear(hex: string): Float32Array {
  const n = parseInt(hex.slice(1), 16);
  return new Float32Array([
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ]);
}

/* -------------------------------------------------------------------------- */
/*  Shaders                                                                    */
/* -------------------------------------------------------------------------- */
const SNOISE = `
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

const gradientVert = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;
  varying vec2 vUv;
  varying float vElevation;
  uniform float uTime;
  ${SNOISE}
  void main() {
    vUv = uv;
    vec3 pos = position;
    float noise = snoise(vec3(pos.x * 1.5, pos.y * 1.5, uTime)) * 0.4;
    noise += snoise(vec3(pos.x * 3.0, pos.y * 3.0, uTime * 0.5)) * 0.15;
    pos.z += noise;
    vElevation = noise;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const gradientFrag = `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  varying vec2 vUv;
  varying float vElevation;
  void main() {
    float t1 = sin(uTime * 0.5 + vUv.x * 3.14159) * 0.5 + 0.5;
    float t2 = cos(uTime * 0.3 + vUv.y * 3.14159) * 0.5 + 0.5;

    vec3 color1 = mix(uColor1, uColor2, t1);
    vec3 color2 = mix(uColor3, uColor4, t2);
    vec3 finalColor = mix(color1, color2, vUv.y + vElevation * 0.5);

    float brightness = 0.85 + vElevation * 0.3;
    finalColor *= brightness;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const gridVert = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float uTime;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const gridFrag = `
  #extension GL_OES_standard_derivatives : enable
  precision highp float;
  uniform float uGridSize;
  uniform float uLineWidth;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vec2 animatedPos = vPosition.xy;
    animatedPos.y -= uTime;

    vec2 grid = abs(fract(animatedPos / uGridSize - 0.5) - 0.5) / fwidth(animatedPos / uGridSize);
    float line = min(grid.x, grid.y);
    float lineStrength = 1.0 - min(line, 1.0);

    float distFromCenter = length(vPosition.xy) / 10.0;
    float fade = 1.0 - smoothstep(0.3, 1.0, distFromCenter);

    float alpha = lineStrength * fade * 0.2;

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

// three.js PointsMaterial with sizeAttenuation. gl_PointSize ends up in physical
// pixels as: size * (drawingBufferHeight / 2) / -mvPosition.z (devicePixelRatio
// cancels out between three's `size` and `scale` uniforms).
const particlesVert = `
  precision highp float;
  attribute vec3 position;
  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;
  uniform float uSize;
  uniform float uScale;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * (uScale / -mvPosition.z);
  }
`;

const particlesFrag = `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

/* -------------------------------------------------------------------------- */
/*  GL helpers                                                                 */
/* -------------------------------------------------------------------------- */
function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader), src);
  }
  return shader;
}

function buildProgram(
  gl: WebGLRenderingContext,
  vsrc: string,
  fsrc: string,
  attribs: string[]
): WebGLProgram {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  // Force stable attribute locations: position = 0, uv = 1.
  attribs.forEach((name, i) => gl.bindAttribLocation(program, i, name));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function makeBuffer(
  gl: WebGLRenderingContext,
  target: number,
  data: Float32Array | Uint16Array
): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(target, buf);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buf;
}

const GRADIENT_COLORS = {
  c1: hexToLinear('#6366f1'),
  c2: hexToLinear('#8b5cf6'),
  c3: hexToLinear('#06b6d4'),
  c4: hexToLinear('#ec4899'),
};
const PARTICLE_COLOR = new Float32Array([1, 1, 1]);

function GradientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDark = useIsDark();
  const gridColorRef = useRef<Float32Array>(hexToLinear('#6b7280'));

  useEffect(() => {
    gridColorRef.current = hexToLinear(isDark ? '#d1d5db' : '#6b7280');
  }, [isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contextAttribs: WebGLContextAttributes = {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      depth: true,
      stencil: false,
    };
    const gl = (canvas.getContext('webgl', contextAttribs) ||
      canvas.getContext('experimental-webgl', contextAttribs)) as WebGLRenderingContext | null;
    if (!gl) return;

    gl.getExtension('OES_standard_derivatives');

    /* ---- programs ---- */
    const progGradient = buildProgram(gl, gradientVert, gradientFrag, ['position', 'uv']);
    const progGrid = buildProgram(gl, gridVert, gridFrag, ['position', 'uv']);
    const progParticles = buildProgram(gl, particlesVert, particlesFrag, ['position']);

    const gradU = {
      proj: gl.getUniformLocation(progGradient, 'projectionMatrix'),
      mv: gl.getUniformLocation(progGradient, 'modelViewMatrix'),
      time: gl.getUniformLocation(progGradient, 'uTime'),
      c1: gl.getUniformLocation(progGradient, 'uColor1'),
      c2: gl.getUniformLocation(progGradient, 'uColor2'),
      c3: gl.getUniformLocation(progGradient, 'uColor3'),
      c4: gl.getUniformLocation(progGradient, 'uColor4'),
    };
    const gridU = {
      proj: gl.getUniformLocation(progGrid, 'projectionMatrix'),
      mv: gl.getUniformLocation(progGrid, 'modelViewMatrix'),
      time: gl.getUniformLocation(progGrid, 'uTime'),
      gridSize: gl.getUniformLocation(progGrid, 'uGridSize'),
      lineWidth: gl.getUniformLocation(progGrid, 'uLineWidth'),
      color: gl.getUniformLocation(progGrid, 'uColor'),
    };
    const partU = {
      proj: gl.getUniformLocation(progParticles, 'projectionMatrix'),
      mv: gl.getUniformLocation(progParticles, 'modelViewMatrix'),
      size: gl.getUniformLocation(progParticles, 'uSize'),
      scale: gl.getUniformLocation(progParticles, 'uScale'),
      color: gl.getUniformLocation(progParticles, 'uColor'),
      opacity: gl.getUniformLocation(progParticles, 'uOpacity'),
    };

    /* ---- geometry / buffers ---- */
    const gradientPlane = createPlane(8, 8, 128, 128);
    const gridPlane = createPlane(30, 30, 1, 1);
    const particlePositions = createParticles(200);

    const buffers = {
      gradPos: makeBuffer(gl, gl.ARRAY_BUFFER, gradientPlane.positions),
      gradUv: makeBuffer(gl, gl.ARRAY_BUFFER, gradientPlane.uvs),
      gradIdx: makeBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, gradientPlane.indices),
      gridPos: makeBuffer(gl, gl.ARRAY_BUFFER, gridPlane.positions),
      gridUv: makeBuffer(gl, gl.ARRAY_BUFFER, gridPlane.uvs),
      gridIdx: makeBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, gridPlane.indices),
      partPos: makeBuffer(gl, gl.ARRAY_BUFFER, particlePositions),
    };
    const gradientIndexCount = gradientPlane.indices.length;
    const gridIndexCount = gridPlane.indices.length;

    /* ---- static matrices ---- */
    const view = translation(0, 0, -3); // camera at [0, 0, 3] looking at origin
    const mvGradient = multiply(view, multiply(translation(0, 0, -1), rotationX(-Math.PI / 3)));
    const mvGrid = multiply(view, multiply(translation(0, 0, -2), rotationX(-Math.PI / 3)));

    const fovy = (60 * Math.PI) / 180;
    let proj = perspective(fovy, 1, 0.1, 2000);

    /* ---- pipeline state ---- */
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const bindAttrib = (buffer: WebGLBuffer, loc: number, size: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };

    const resize = (): boolean => {
      const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (w === 0 || h === 0) return false;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        proj = perspective(fovy, w / h, 0.1, 2000);
      }
      return true;
    };

    let raf = 0;
    let start = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!resize()) return;
      if (!start) start = now;
      const elapsed = (now - start) / 1000;

      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      /* ---- opaque: gradient wave ---- */
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.useProgram(progGradient);
      gl.uniformMatrix4fv(gradU.proj, false, proj);
      gl.uniformMatrix4fv(gradU.mv, false, mvGradient);
      gl.uniform1f(gradU.time, elapsed * 0.3);
      gl.uniform3fv(gradU.c1, GRADIENT_COLORS.c1);
      gl.uniform3fv(gradU.c2, GRADIENT_COLORS.c2);
      gl.uniform3fv(gradU.c3, GRADIENT_COLORS.c3);
      gl.uniform3fv(gradU.c4, GRADIENT_COLORS.c4);
      bindAttrib(buffers.gradPos, 0, 3);
      bindAttrib(buffers.gradUv, 1, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.gradIdx);
      gl.drawElements(gl.TRIANGLES, gradientIndexCount, gl.UNSIGNED_SHORT, 0);

      /* ---- transparent: grid (back) then particles (front) ---- */
      gl.enable(gl.BLEND);
      gl.depthMask(false);

      gl.useProgram(progGrid);
      gl.uniformMatrix4fv(gridU.proj, false, proj);
      gl.uniformMatrix4fv(gridU.mv, false, mvGrid);
      gl.uniform1f(gridU.time, elapsed * 0.2);
      gl.uniform1f(gridU.gridSize, 1.0);
      gl.uniform1f(gridU.lineWidth, 0.02);
      gl.uniform3fv(gridU.color, gridColorRef.current);
      bindAttrib(buffers.gridPos, 0, 3);
      bindAttrib(buffers.gridUv, 1, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.gridIdx);
      gl.drawElements(gl.TRIANGLES, gridIndexCount, gl.UNSIGNED_SHORT, 0);

      // three.js Euler order 'XYZ' (with z = 0) composes as Rx * Ry
      const mvParticles = multiply(
        view,
        multiply(rotationX(elapsed * 0.01), rotationY(elapsed * 0.02))
      );
      gl.useProgram(progParticles);
      gl.uniformMatrix4fv(partU.proj, false, proj);
      gl.uniformMatrix4fv(partU.mv, false, mvParticles);
      gl.uniform1f(partU.size, 0.03);
      gl.uniform1f(partU.scale, gl.drawingBufferHeight * 0.5);
      gl.uniform3fv(partU.color, PARTICLE_COLOR);
      gl.uniform1f(partU.opacity, 0.4);
      gl.disableVertexAttribArray(1);
      bindAttrib(buffers.partPos, 0, 3);
      gl.drawArrays(gl.POINTS, 0, 200);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      Object.values(buffers).forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(progGradient);
      gl.deleteProgram(progGrid);
      gl.deleteProgram(progParticles);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}

function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="grain-overlay pointer-events-none absolute inset-0 z-10"
    />
  );
}

export default function GradientBackground() {
  return (
    <>
      <div className="dark:bg-black/20 z-10 absolute inset-0 -bottom-20 -top-10" />
      <div className="absolute inset-0 -bottom-20 md:-top-30 ">
        <GradientCanvas />
        <GrainOverlay />
        <div className="absolute inset-0" />
      </div>
    </>
  );
}
