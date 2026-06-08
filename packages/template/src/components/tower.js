"use strict";
// import { ThreeStage } from '@motion-script/three';
// import * as THREE from 'three';
// import { ColorManagement } from 'three';
// export class TowerDioramaStage extends ThreeStage {
//     private sceneGroup!: THREE.Group;
//     private orthoCam!: THREE.OrthographicCamera;
//     private elapsed = 0;
//     constructor() {
//         super();
//     }
//     protected setupScene(): void {
//         this.setupCamera();
//         this.setupRenderer();
//         this.setupLighting();
//         this.sceneGroup = new THREE.Group();
//         this.sceneGroup.position.y = -0.25;
//         this.scene.add(this.sceneGroup);
//         this.buildPlatform();
//         this.buildRoad();
//         this.buildFountain();
//         this.buildTower();
//         this.buildFence();
//         this.buildFoliage();
//         this.buildShadowGround();
//     }
//     private setupCamera(): void {
//         const aspect = this.viewport.width / this.viewport.height;
//         const d = 16;
//         this.orthoCam = new THREE.OrthographicCamera(
//             -d * aspect, d * aspect, d, -d, 1, 1000
//         );
//         this.orthoCam.position.set(20, 20, 20);
//         this.orthoCam.lookAt(0, 0, 0);
//     }
//     private setupRenderer(): void {
//         ColorManagement.enabled = false;
//         this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
//         this.renderer.toneMappingExposure = 1.1;
//         this.renderer.outputColorSpace = THREE.SRGBColorSpace;
//         this.renderer.shadowMap.enabled = true;
//         this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
//     }
//     private setupLighting(): void {
//         const hemi = new THREE.HemisphereLight(0xffbfa8, 0x2b381e, 0.8);
//         hemi.position.set(0, 20, 0);
//         this.scene.add(hemi);
//         const key = new THREE.DirectionalLight(0xff9933, 1.8);
//         key.position.set(-25, 30, 5);
//         key.castShadow = true;
//         key.shadow.mapSize.width = 4096;
//         key.shadow.mapSize.height = 4096;
//         const s = 35;
//         key.shadow.camera.left = -s;
//         key.shadow.camera.right = s;
//         key.shadow.camera.top = s;
//         key.shadow.camera.bottom = -s;
//         key.shadow.camera.near = 0.5;
//         key.shadow.camera.far = 100;
//         key.shadow.bias = -0.001;
//         this.scene.add(key);
//         const fill = new THREE.DirectionalLight(0x8a70a8, 0.6);
//         fill.position.set(15, 15, 15);
//         this.scene.add(fill);
//     }
//     private _mats: ReturnType<typeof this.buildMats> | null = null;
//     private buildMats() {
//         return {
//             baseSide: new THREE.MeshStandardMaterial({ color: '#e5dbd9', roughness: 0.9, metalness: 0.0 }),
//             grass: new THREE.MeshStandardMaterial({ color: '#5eb330', roughness: 0.9, metalness: 0.0 }),
//             road: new THREE.MeshStandardMaterial({ color: '#261c38', roughness: 0.9, metalness: 0.0 }),
//             towerBase: new THREE.MeshStandardMaterial({ color: '#fbe2c4', roughness: 0.8, metalness: 0.0 }),
//             towerDark: new THREE.MeshStandardMaterial({ color: '#d39972', roughness: 0.9, metalness: 0.0 }),
//             towerAccent: new THREE.MeshStandardMaterial({ color: '#f0c0a6', roughness: 0.9, metalness: 0.0 }),
//             water: new THREE.MeshStandardMaterial({ color: '#2a75c7', roughness: 0.1, metalness: 0.1 }),
//             stone: new THREE.MeshStandardMaterial({ color: '#90909c', roughness: 0.8, metalness: 0.0 }),
//             blackMetal: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6, metalness: 0.4 }),
//             treeDark: new THREE.MeshStandardMaterial({ color: '#277a2e', roughness: 0.9, metalness: 0.0, flatShading: true }),
//             treeLight: new THREE.MeshStandardMaterial({ color: '#77cc35', roughness: 0.9, metalness: 0.0, flatShading: true }),
//             treeYellow: new THREE.MeshStandardMaterial({ color: '#f5c522', roughness: 0.9, metalness: 0.0, flatShading: true }),
//             treeTrunk: new THREE.MeshStandardMaterial({ color: '#593a26', roughness: 1.0, metalness: 0.0, flatShading: true }),
//             hedge: new THREE.MeshStandardMaterial({ color: '#3f9e40', roughness: 0.9, metalness: 0.0, flatShading: true }),
//             lightGlow: new THREE.MeshBasicMaterial({ color: '#ffcc00' }),
//         };
//     }
//     private get mats() {
//         if (!this._mats) this._mats = this.buildMats();
//         return this._mats;
//     }
//     private roundedRectShape(width: number, length: number, radius: number): THREE.Shape {
//         const shape = new THREE.Shape();
//         const x = -width / 2, y = -length / 2;
//         shape.moveTo(x, y + radius);
//         shape.lineTo(x, y + length - radius);
//         shape.quadraticCurveTo(x, y + length, x + radius, y + length);
//         shape.lineTo(x + width - radius, y + length);
//         shape.quadraticCurveTo(x + width, y + length, x + width, y + length - radius);
//         shape.lineTo(x + width, y + radius);
//         shape.quadraticCurveTo(x + width, y, x + width - radius, y);
//         shape.lineTo(x + radius, y);
//         shape.quadraticCurveTo(x, y, x, y + radius);
//         return shape;
//     }
//     private buildPlatform(): void {
//         const m = this.mats;
//         const shape = this.roundedRectShape(24, 24, 3);
//         const baseGeom = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false, curveSegments: 32 });
//         baseGeom.rotateX(Math.PI / 2);
//         const base = new THREE.Mesh(baseGeom, m.baseSide);
//         base.receiveShadow = true;
//         base.castShadow = true;
//         this.sceneGroup.add(base);
//         const grassGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false, curveSegments: 32 });
//         grassGeom.rotateX(Math.PI / 2);
//         const grass = new THREE.Mesh(grassGeom, m.grass);
//         grass.position.y = 0.02;
//         grass.receiveShadow = true;
//         this.sceneGroup.add(grass);
//     }
//     private buildRoad(): void {
//         const m = this.mats;
//         const roadShape = new THREE.Shape();
//         roadShape.moveTo(-12, 5);
//         roadShape.lineTo(-12, 9);
//         roadShape.lineTo(-2, 3);
//         roadShape.lineTo(4, 3);
//         roadShape.quadraticCurveTo(11, 3, 11, -4);
//         roadShape.quadraticCurveTo(11, -11, 4, -11);
//         roadShape.lineTo(-2, -11);
//         roadShape.lineTo(-10, -12);
//         roadShape.lineTo(-6, -12);
//         roadShape.lineTo(2, -7);
//         roadShape.quadraticCurveTo(7, -7, 7, -4);
//         roadShape.quadraticCurveTo(7, -1, 4, -1);
//         roadShape.lineTo(0, -1);
//         roadShape.lineTo(-8, 5);
//         const roadGeom = new THREE.ShapeGeometry(roadShape, 32);
//         roadGeom.rotateX(-Math.PI / 2);
//         const road = new THREE.Mesh(roadGeom, m.road);
//         road.position.y = 0.05;
//         road.receiveShadow = true;
//         this.sceneGroup.add(road);
//     }
//     private buildFountain(): void {
//         const m = this.mats;
//         const g = new THREE.Group();
//         g.position.set(6, 0.1, -4);
//         const pond = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.1, 32), m.water);
//         pond.receiveShadow = true;
//         g.add(pond);
//         const border = new THREE.Mesh(new THREE.TorusGeometry(2, 0.2, 16, 32), m.stone);
//         border.rotation.x = Math.PI / 2;
//         border.castShadow = true;
//         border.receiveShadow = true;
//         g.add(border);
//         const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 16), m.stone);
//         spout.position.y = 0.1;
//         spout.castShadow = true;
//         g.add(spout);
//         const padGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8);
//         const pad1 = new THREE.Mesh(padGeom, m.treeLight);
//         pad1.position.set(0.8, 0.05, 0.8);
//         const pad2 = new THREE.Mesh(padGeom, m.treeLight);
//         pad2.position.set(-1, 0.05, 0.4);
//         pad2.scale.set(0.6, 1, 0.6);
//         g.add(pad1, pad2);
//         this.sceneGroup.add(g);
//     }
//     private buildTower(): void {
//         const m = this.mats;
//         const g = new THREE.Group();
//         // Base cylinder
//         const tBase = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 2.2, 64), m.towerBase);
//         tBase.position.y = 1.1;
//         tBase.castShadow = true;
//         tBase.receiveShadow = true;
//         g.add(tBase);
//         // Ground floor arches
//         for (let i = 0; i < 16; i++) {
//             const angle = (i / 16) * Math.PI * 2;
//             const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.4), m.towerBase);
//             pillar.position.set(Math.cos(angle) * 3.65, 1.0, Math.sin(angle) * 3.65);
//             pillar.rotation.y = -angle;
//             pillar.castShadow = true;
//             g.add(pillar);
//             const indent = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.5, 16), m.towerDark);
//             indent.position.set(Math.cos(angle) * 3.4, 1.0, Math.sin(angle) * 3.4);
//             g.add(indent);
//         }
//         // Door
//         const doorG = new THREE.Group();
//         doorG.position.set(0, 0, 3.6);
//         const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.3), m.treeTrunk);
//         door.position.y = 0.75;
//         doorG.add(door);
//         const framePillarL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.4), m.towerBase);
//         framePillarL.position.set(-0.6, 0.75, 0);
//         const framePillarR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.4), m.towerBase);
//         framePillarR.position.set(0.6, 0.75, 0);
//         doorG.add(framePillarL, framePillarR);
//         const pediment = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 4), m.towerBase);
//         pediment.position.set(0, 1.8, 0);
//         pediment.rotation.y = Math.PI / 4;
//         doorG.add(pediment);
//         const diamond = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), m.towerAccent);
//         diamond.position.set(0, 2.3, -0.1);
//         diamond.rotation.z = Math.PI / 4;
//         doorG.add(diamond);
//         g.add(doorG);
//         // Tiers
//         let currentY = 2.2;
//         const tierRadius = 3.3;
//         const coreRadius = 2.4;
//         for (let i = 0; i < 6; i++) {
//             const tierHeight = 1.4;
//             const core = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius, coreRadius, tierHeight, 32), m.towerDark);
//             core.position.y = currentY + tierHeight / 2;
//             core.castShadow = true;
//             core.receiveShadow = true;
//             g.add(core);
//             for (let j = 0; j < 24; j++) {
//                 const angle = (j / 24) * Math.PI * 2;
//                 const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, tierHeight, 16), m.towerBase);
//                 const colX = Math.cos(angle) * (tierRadius - 0.2);
//                 const colZ = Math.sin(angle) * (tierRadius - 0.2);
//                 col.position.set(colX, currentY + tierHeight / 2, colZ);
//                 col.castShadow = true;
//                 g.add(col);
//                 const nextAngle = ((j + 1) / 24) * Math.PI * 2;
//                 const midX = (colX + Math.cos(nextAngle) * (tierRadius - 0.2)) / 2;
//                 const midZ = (colZ + Math.sin(nextAngle) * (tierRadius - 0.2)) / 2;
//                 const arch = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16, Math.PI), m.towerBase);
//                 arch.position.set(midX, currentY + tierHeight - 0.1, midZ);
//                 arch.rotation.y = -angle - Math.PI / 2;
//                 g.add(arch);
//             }
//             const ring = new THREE.Mesh(new THREE.CylinderGeometry(tierRadius, tierRadius, 0.35, 64), m.towerBase);
//             ring.position.y = currentY + tierHeight + 0.175;
//             ring.castShadow = true;
//             g.add(ring);
//             const trim = new THREE.Mesh(new THREE.CylinderGeometry(tierRadius - 0.1, tierRadius - 0.1, 0.4, 64), m.towerDark);
//             trim.position.y = currentY + tierHeight + 0.2;
//             g.add(trim);
//             currentY += tierHeight + 0.35;
//         }
//         // Belfry
//         const belfryH = 2.0;
//         const bBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.3, 32), m.towerBase);
//         bBase.position.y = currentY + 0.15;
//         g.add(bBase);
//         const belfry = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, belfryH, 32), m.towerDark);
//         belfry.position.y = currentY + belfryH / 2 + 0.3;
//         belfry.castShadow = true;
//         g.add(belfry);
//         const topRing = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.4, 32), m.towerBase);
//         topRing.position.y = currentY + belfryH + 0.3;
//         g.add(topRing);
//         for (let k = 0; k < 12; k++) {
//             const angle = (k / 12) * Math.PI * 2;
//             const bCol = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, belfryH, 16), m.towerBase);
//             bCol.position.set(Math.cos(angle) * 1.9, currentY + belfryH / 2 + 0.3, Math.sin(angle) * 1.9);
//             g.add(bCol);
//         }
//         const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 8), m.stone);
//         pole.position.set(1.4, currentY + belfryH + 1.2, 0);
//         g.add(pole);
//         g.position.set(-2, 0.1, 2);
//         g.rotation.z = -0.10;
//         this.sceneGroup.add(g);
//     }
//     private buildFence(): void {
//         const m = this.mats;
//         const g = new THREE.Group();
//         g.position.set(-2, 0.1, 2);
//         const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.2, 64), m.towerBase);
//         platform.position.y = 0.1;
//         platform.receiveShadow = true;
//         g.add(platform);
//         for (let r = 1; r <= 4; r++) {
//             const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5 + r * 0.5, 0.04, 4, 64), m.towerAccent);
//             ring.rotation.x = Math.PI / 2;
//             ring.position.y = 0.2;
//             g.add(ring);
//         }
//         const inner = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.22, 64), m.towerAccent);
//         inner.position.y = 0.1;
//         inner.receiveShadow = true;
//         g.add(inner);
//         const fBase = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.08, 16, 64), m.stone);
//         fBase.rotation.x = Math.PI / 2;
//         fBase.position.y = 0.2;
//         g.add(fBase);
//         const rail = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.04, 8, 64), m.blackMetal);
//         rail.rotation.x = Math.PI / 2;
//         rail.position.y = 0.7;
//         g.add(rail);
//         for (let i = 0; i < 40; i++) {
//             const angle = (i / 40) * Math.PI * 2;
//             const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), m.blackMetal);
//             post.position.set(Math.cos(angle) * 5.5, 0.45, Math.sin(angle) * 5.5);
//             g.add(post);
//         }
//         this.sceneGroup.add(g);
//     }
//     private buildFoliage(): void {
//         const m = this.mats;
//         const pineTree = (x: number, z: number, scale: number, mat: THREE.Material) => {
//             const g = new THREE.Group();
//             g.add(this.mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), m.treeTrunk, [0, 0.5, 0]));
//             g.add(this.castMesh(new THREE.ConeGeometry(1, 1.8, 6), mat, [0, 1.2, 0]));
//             g.add(this.castMesh(new THREE.ConeGeometry(0.8, 1.4, 6), mat, [0, 2.1, 0]));
//             g.position.set(x, 0.15, z);
//             g.scale.setScalar(scale);
//             this.sceneGroup.add(g);
//         };
//         const deciduousTree = (x: number, z: number, scale: number, mat: THREE.Material) => {
//             const g = new THREE.Group();
//             g.add(this.mesh(new THREE.CylinderGeometry(0.1, 0.15, 1, 6), m.treeTrunk, [0, 0.5, 0]));
//             const top = this.castMesh(new THREE.IcosahedronGeometry(0.8, 0), mat, [0, 1.4, 0]);
//             top.rotation.set(Math.random(), Math.random(), Math.random());
//             g.add(top);
//             g.position.set(x, 0.15, z);
//             g.scale.setScalar(scale);
//             this.sceneGroup.add(g);
//         };
//         const bush = (x: number, z: number, scale: number) => {
//             const b = this.castMesh(new THREE.IcosahedronGeometry(0.5, 0), m.treeDark, [x, 0.2 + scale * 0.3, z]);
//             b.rotation.set(Math.random(), Math.random(), Math.random());
//             b.scale.setScalar(scale);
//             b.receiveShadow = true;
//             this.sceneGroup.add(b);
//         };
//         const hedge = (x: number, z: number, yRot: number) => {
//             const h = this.castMesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), m.hedge, [x, 0.55, z]);
//             h.rotation.y = yRot;
//             h.receiveShadow = true;
//             this.sceneGroup.add(h);
//         };
//         const lamp = (x: number, z: number) => {
//             const g = new THREE.Group();
//             g.add(this.castMesh(new THREE.CylinderGeometry(0.05, 0.08, 1.8, 8), m.blackMetal, [0, 0.9, 0]));
//             g.add(this.mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.2, 8), m.blackMetal, [0, 0.1, 0]));
//             g.add(this.mesh(new THREE.IcosahedronGeometry(0.2, 1), m.lightGlow, [0, 1.9, 0]));
//             g.add(this.mesh(new THREE.CylinderGeometry(0.15, 0.05, 0.1, 8), m.blackMetal, [0, 2.15, 0]));
//             const light = new THREE.PointLight(0xffaa00, 1.5, 6);
//             light.position.y = 1.9;
//             g.add(light);
//             g.position.set(x, 0.1, z);
//             this.sceneGroup.add(g);
//         };
//         pineTree(-8, -5, 1.2, m.treeDark);
//         pineTree(-6, -7, 0.9, m.treeLight);
//         pineTree(8, 5, 1.1, m.treeDark);
//         deciduousTree(9, 7, 1.0, m.treeYellow);
//         deciduousTree(2, -8, 1.1, m.treeYellow);
//         deciduousTree(-3, 10, 1.2, m.treeLight);
//         pineTree(-1, 11, 0.9, m.treeDark);
//         bush(-4, -5.5, 1);
//         bush(4, -4, 0.8);
//         bush(6.5, 1, 0.6);
//         bush(-9, 2, 1.1);
//         bush(-4, 6, 0.7);
//         bush(3, 8, 0.9);
//         for (let i = 0; i < 4; i++) hedge(-9 + i * 1.3, 5 + i * 1.3, Math.PI / 4);
//         for (let i = 0; i < 3; i++) hedge(-6 + i * 1.3, 8 + i * 1.3, Math.PI / 4);
//         lamp(-5.5, 3.5);
//         lamp(1.5, -4.5);
//         lamp(8.5, 3.5);
//         for (let i = 0; i < 20; i++) {
//             const px = (Math.random() - 0.5) * 20;
//             const pz = (Math.random() - 0.5) * 20;
//             if (px > -11 && px < 11 && pz > -11 && pz < 11) {
//                 const tuft = this.castMesh(new THREE.ConeGeometry(0.08, 0.25, 4), m.treeLight, [px, 0.25, pz]);
//                 tuft.rotation.x = (Math.random() - 0.5) * 0.5;
//                 tuft.rotation.z = (Math.random() - 0.5) * 0.5;
//                 this.sceneGroup.add(tuft);
//             }
//         }
//     }
//     private buildShadowGround(): void {
//         const geom = new THREE.PlaneGeometry(300, 300);
//         const mat = new THREE.ShadowMaterial({ opacity: 0.4 });
//         const mesh = new THREE.Mesh(geom, mat);
//         mesh.rotation.x = -Math.PI / 2;
//         mesh.position.y = -2.0;
//         mesh.receiveShadow = true;
//         this.scene.add(mesh);
//     }
//     private mesh(geom: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number]): THREE.Mesh {
//         const m = new THREE.Mesh(geom, mat);
//         m.position.set(...pos);
//         return m;
//     }
//     private castMesh(geom: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number]): THREE.Mesh {
//         const m = this.mesh(geom, mat, pos);
//         m.castShadow = true;
//         return m;
//     }
//     public render(): void {
//         this.initializeScene();
//         this.renderer.render(this.scene, this.orthoCam);
//     }
//     public toImageURL(): string {
//         this.render();
//         return this.renderer.domElement.toDataURL('image/png');
//     }
//     public setViewport(viewport: { width: number; height: number }): void {
//         super.setViewport(viewport);
//         if (this.orthoCam) {
//             const d = 16;
//             const aspect = viewport.width / viewport.height;
//             this.orthoCam.left = -d * aspect;
//             this.orthoCam.right = d * aspect;
//             this.orthoCam.top = d;
//             this.orthoCam.bottom = -d;
//             this.orthoCam.updateProjectionMatrix();
//         }
//     }
//     public update(deltaTime: number): void {
//         if (!this.orthoCam) return;
//         this.elapsed += deltaTime;
//         const angle = this.elapsed * 0.15;
//         this.orthoCam.position.set(20 * Math.cos(angle), 20, 20 * Math.sin(angle));
//         this.orthoCam.lookAt(0, 0, 0);
//     }
// }
