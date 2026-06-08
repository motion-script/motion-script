import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ThreeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.z = 5;

    // Flowing particle field
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const offsets = new Float32Array(count);

    const palette = [
      new THREE.Color('#6366f1'), // indigo
      new THREE.Color('#a855f7'), // purple
      new THREE.Color('#ec4899'), // pink
      new THREE.Color('#06b6d4'), // cyan
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      speeds[i] = 0.1 + Math.random() * 0.4;
      offsets[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Subtle wireframe torus
    const torusGeo = new THREE.TorusGeometry(2.2, 0.6, 18, 80);
    const torusMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#6366f1'),
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.x = Math.PI / 4;
    scene.add(torus);

    // Second torus at different angle
    const torus2 = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.3, 12, 100),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#a855f7'), wireframe: true, transparent: true, opacity: 0.04 })
    );
    torus2.rotation.y = Math.PI / 3;
    scene.add(torus2);

    let animId: number;
    const clock = new THREE.Clock();
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;

    function animate() {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Float particles in sinusoidal waves
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3 + 1] = (
          (posAttr.array[i * 3 + 1] as number) +
          Math.sin(t * speeds[i] + offsets[i]) * 0.0008
        );
      }
      posAttr.needsUpdate = true;

      points.rotation.y = t * 0.03;
      points.rotation.x = Math.sin(t * 0.015) * 0.1;

      torus.rotation.z = t * 0.08;
      torus.rotation.y = t * 0.04;
      torus2.rotation.x = t * 0.05;
      torus2.rotation.z = t * 0.03;

      renderer.render(scene, camera);
    }

    animate();

    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      torusGeo.dispose();
      torusMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}
