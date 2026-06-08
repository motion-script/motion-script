// import * as THREE from 'three';
// import { ThreeStage } from '@motion-script/three';

// // --- Simplex Noise (embedded, no external dep) ---
// const grad3 = new Float32Array([
//     1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
//     1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
//     0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
// ]);

// function createSimplex() {
//     const F3 = 1.0 / 3.0;
//     const G3 = 1.0 / 6.0;
//     const p = new Uint8Array(256);
//     for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
//     const perm = new Uint8Array(512);
//     const permMod12 = new Uint8Array(512);
//     for (let i = 0; i < 512; i++) {
//         perm[i] = p[i & 255];
//         permMod12[i] = perm[i] % 12;
//     }

//     return function noise3D(xin: number, yin: number, zin: number): number {
//         let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
//         const s = (xin + yin + zin) * F3;
//         const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
//         const t = (i + j + k) * G3;
//         const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
//         let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
//         if (x0 >= y0) {
//             if (y0 >= z0)      { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
//             else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
//             else               { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
//         } else {
//             if (y0 < z0)       { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
//             else if (x0 < z0)  { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
//             else               { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
//         }
//         const x1 = x0-i1+G3, y1 = y0-j1+G3, z1 = z0-k1+G3;
//         const x2 = x0-i2+2*G3, y2 = y0-j2+2*G3, z2 = z0-k2+2*G3;
//         const x3 = x0-1+3*G3, y3 = y0-1+3*G3, z3 = z0-1+3*G3;
//         const ii=i&255, jj=j&255, kk=k&255;
//         const check = (t0: number, gx: number, _gy: number, _gz: number, dx: number, dy: number, dz: number) => {
//             if (t0 < 0) return 0;
//             const t2 = t0 * t0;
//             return t2 * t2 * (grad3[gx]*dx + grad3[gx+1]*dy + grad3[gx+2]*dz);
//         };
//         n0 = check(0.6 - x0*x0 - y0*y0 - z0*z0, permMod12[ii+perm[jj+perm[kk]]]*3, 0, 0, x0, y0, z0);
//         n1 = check(0.6 - x1*x1 - y1*y1 - z1*z1, permMod12[ii+i1+perm[jj+j1+perm[kk+k1]]]*3, 0, 0, x1, y1, z1);
//         n2 = check(0.6 - x2*x2 - y2*y2 - z2*z2, permMod12[ii+i2+perm[jj+j2+perm[kk+k2]]]*3, 0, 0, x2, y2, z2);
//         n3 = check(0.6 - x3*x3 - y3*y3 - z3*z3, permMod12[ii+1+perm[jj+1+perm[kk+1]]]*3, 0, 0, x3, y3, z3);
//         return 32 * (n0 + n1 + n2 + n3);
//     };
// }

// export class CellStage extends ThreeStage {
//     private noise3D = createSimplex();
//     private cellGroup!: THREE.Group;
//     private shellGeo!: THREE.SphereGeometry;
//     private shellOriginalPositions: THREE.Vector3[] = [];
//     private elapsed = 0;

//     constructor() {
//         super();
//         this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
//         this.camera.position.set(0, 2, 9);
//         this.initializeScene();
//     }

//     protected setupScene(): void {
//         this.scene.background = new THREE.Color('#fff1db');
//         this.scene.fog = new THREE.Fog(0xf6f6f6, 10, 25);

//         this.cellGroup = new THREE.Group();
//         this.scene.add(this.cellGroup);

//         this.setupLights();
//         this.buildCore();
//         this.buildShell();
//         this.buildShadowPlane();
//     }

//     private setupLights(): void {
//         this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));

//         const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
//         mainLight.position.set(5, 8, 5);
//         mainLight.castShadow = true;
//         mainLight.shadow.mapSize.width = 2048;
//         mainLight.shadow.mapSize.height = 2048;
//         mainLight.shadow.bias = -0.001;
//         this.scene.add(mainLight);

//         const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
//         fillLight.position.set(-5, 2, 2);
//         this.scene.add(fillLight);

//         const rimLight = new THREE.PointLight(0xff4411, 2.5, 10);
//         rimLight.position.set(-3, -3, 2);
//         this.scene.add(rimLight);
//     }

//     private buildCore(): void {
//         const RADIUS = 1.6;
//         const geo = new THREE.SphereGeometry(RADIUS, 128, 128);
//         const pos = geo.attributes.position;
//         const colorBase = new THREE.Color('#d92400');
//         const colorTip = new THREE.Color('#ffbfa6');
//         const vertex = new THREE.Vector3();
//         const displacements: number[] = [];
//         let minD = Infinity, maxD = -Infinity;

//         for (let i = 0; i < pos.count; i++) {
//             vertex.fromBufferAttribute(pos, i).normalize();
//             let n = this.noise3D(vertex.x * 3.5, vertex.y * 3.5, vertex.z * 3.5) * 0.3;
//             n += this.noise3D(vertex.x * 12, vertex.y * 12, vertex.z * 12) * 0.15;
//             n += this.noise3D(vertex.x * 25, vertex.y * 25, vertex.z * 25) * 0.05;
//             if (n > 0) n = Math.pow(n, 0.8);
//             const d = RADIUS + n;
//             displacements.push(d);
//             minD = Math.min(minD, d);
//             maxD = Math.max(maxD, d);
//             vertex.multiplyScalar(d);
//             pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
//         }

//         const colors: number[] = [];
//         for (let i = 0; i < pos.count; i++) {
//             const h = Math.pow((displacements[i] - minD) / (maxD - minD), 1.5);
//             const c = colorBase.clone().lerp(colorTip, h);
//             colors.push(c.r, c.g, c.b);
//         }
//         geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
//         geo.computeVertexNormals();

//         const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
//         const mesh = new THREE.Mesh(geo, mat);
//         mesh.castShadow = true;
//         mesh.receiveShadow = true;
//         this.cellGroup.add(mesh);
//     }

//     private buildShell(): void {
//         const RADIUS = 2.4;
//         this.shellGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
//         const pos = this.shellGeo.attributes.position;
//         for (let i = 0; i < pos.count; i++) {
//             this.shellOriginalPositions.push(new THREE.Vector3().fromBufferAttribute(pos, i));
//         }

//         const mat = new THREE.MeshPhysicalMaterial({
//             color: '#edb0a4',
//             roughness: 0.05,
//             metalness: 0.3,
//             transmission: 0.9,
//             ior: 1.7,
//             thickness: 1.5,
//             transparent: true,
//             opacity: 1.0,
//             clearcoat: 1.0,
//             clearcoatRoughness: 0.05,
//             side: THREE.FrontSide,
//         } as THREE.MeshPhysicalMaterialParameters);

//         const mesh = new THREE.Mesh(this.shellGeo, mat);
//         mesh.castShadow = true;
//         this.cellGroup.add(mesh);
//     }

//     private buildShadowPlane(): void {
//         const floor = new THREE.Mesh(
//             new THREE.PlaneGeometry(20, 20),
//             new THREE.ShadowMaterial({ opacity: 0.15 }),
//         );
//         floor.rotation.x = -Math.PI / 2;
//         floor.position.y = -2.8;
//         floor.receiveShadow = true;
//         this.scene.add(floor);
//     }

//     public update(deltaTime: number): void {
//         if (!this.shellGeo) return;
//         this.elapsed += deltaTime;
//         const t = this.elapsed;

//         const sPos = this.shellGeo.attributes.position;
//         for (let i = 0; i < sPos.count; i++) {
//             const v = this.shellOriginalPositions[i];
//             const dir = v.clone().normalize();
//             const noise = this.noise3D(dir.x * 1.5 + t * 0.2, dir.y * 1.5 + t * 0.3, dir.z * 1.5);
//             let displacement = 2.4 + noise * 0.15;
//             if (dir.y < -0.5) displacement += Math.sin(t * 2 + dir.x * 5) * 0.05;
//             const newPos = dir.multiplyScalar(displacement);
//             sPos.setXYZ(i, newPos.x, newPos.y, newPos.z);
//         }
//         this.shellGeo.computeVertexNormals();
//         sPos.needsUpdate = true;

//         this.cellGroup.position.y = Math.sin(t * 0.5) * 0.1;
//         this.cellGroup.rotation.y += 0.005;
//     }
// }
