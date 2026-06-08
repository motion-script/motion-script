import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

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

function GradientMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color('#6366f1') },
      uColor2: { value: new THREE.Color('#8b5cf6') },
      uColor3: { value: new THREE.Color('#06b6d4') },
      uColor4: { value: new THREE.Color('#ec4899') },
    }),
    []
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * 0.3;
    }
  });

  const vertexShader = `
    varying vec2 vUv;
    varying float vElevation;
    uniform float uTime;

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

  const fragmentShader = `
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

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 3, 0, 0]} position={[0, 0, -1]}>
      <planeGeometry args={[8, 8, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function GridBackground({ color }: { color: string }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uGridSize: { value: 1.0 },
      uLineWidth: { value: 0.02 },
      uColor: { value: new THREE.Color(color) },
    }),
    []
  );

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uColor.value.set(color);
    }
  }, [color]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * 0.2;
    }
  });

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float uTime;

    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
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

  return (
    <mesh rotation={[-Math.PI / 3, 0, 0]} position={[0, 0, -2]}>
      <planeGeometry args={[30, 30, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function FloatingParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 200;

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
      sz[i] = Math.random() * 3 + 1;
    }
    return [pos, sz];
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
      particlesRef.current.rotation.x = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#ffffff"
        transparent
        opacity={0.4}
        sizeAttenuation
      />
    </points>
  );
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
  const isDark = useIsDark();
  const gridColor = isDark ? '#d1d5db' : '#6b7280';

  return (
    <>
      <div className="dark:bg-black/20 z-10 absolute inset-0 -bottom-20 -top-10" />
      <div className="absolute inset-0 -bottom-20 -top-10">
        <Canvas
          camera={{ position: [0, 0, 3], fov: 60 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
        >
          <GridBackground color={gridColor} />
          <GradientMesh />
          <FloatingParticles />
        </Canvas>
        <GrainOverlay />
        <div className="absolute inset-0" />
      </div>
    </>
  );
}
