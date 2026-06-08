"use strict";
// import * as THREE from 'three';
// import { ThreeStage } from "@motion-script/three";
// // --- MATH HELPER ---
// function getBezier2DPoints(p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, segments: number): THREE.Vector2[] {
//     const pts: THREE.Vector2[] = [];
//     for (let i = 0; i <= segments; i++) {
//         const t = i / segments;
//         const u = 1 - t;
//         const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
//         const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
//         pts.push(new THREE.Vector2(x, y));
//     }
//     return pts;
// }
// export class VaccineThree extends ThreeStage {
//     private bottleGroup: THREE.Group;
//     constructor() {
//         super();
//         this.bottleGroup = new THREE.Group();
//     }
//     protected setupScene(): void {
//         // --- SCENE & CAMERA SETUP ---
//         this.scene.background = new THREE.Color('#ebc994');
//         this.camera.fov = 45;
//         this.camera.position.set(0, 1.5, 8);
//         this.camera.updateProjectionMatrix();
//         this.renderer.shadowMap.enabled = true;
//         this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
//         // --- LIGHTING ---
//         const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//         this.scene.add(ambientLight);
//         const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
//         dirLight.position.set(5, 8, 5);
//         dirLight.castShadow = false;
//         dirLight.shadow.mapSize.width = 1024;
//         dirLight.shadow.mapSize.height = 1024;
//         this.scene.add(dirLight);
//         const fillLight = new THREE.DirectionalLight(0x90b0d0, 1.0);
//         fillLight.position.set(-5, 3, -5);
//         this.scene.add(fillLight);
//         // --- TOON SHADING SETUP ---
//         const format = this.renderer.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
//         const colors = new Uint8Array([0, 100, 180, 255]);
//         const gradientMap = new THREE.DataTexture(colors, colors.length, 1, format);
//         gradientMap.needsUpdate = true;
//         gradientMap.minFilter = THREE.NearestFilter;
//         gradientMap.magFilter = THREE.NearestFilter;
//         gradientMap.generateMipmaps = false;
//         // --- VACCINE BOTTLE GEOMETRY ---
//         const points: THREE.Vector2[] = [];
//         // Outer Bottom
//         points.push(new THREE.Vector2(0, 0));
//         points.push(new THREE.Vector2(1, 0));
//         points.push(new THREE.Vector2(1, 2.4));
//         // Outer Shoulder Curve
//         const outerCurvePoints = getBezier2DPoints(
//             new THREE.Vector2(1, 2.4),
//             new THREE.Vector2(1, 3.0),
//             new THREE.Vector2(0.5, 3.0),
//             10
//         );
//         points.push(...outerCurvePoints.slice(1));
//         // Outer Neck and Rim
//         points.push(new THREE.Vector2(0.5, 3.4));
//         points.push(new THREE.Vector2(0.65, 3.4));
//         points.push(new THREE.Vector2(0.65, 3.6));
//         // Cross over top lip to inside
//         points.push(new THREE.Vector2(0.4, 3.6));
//         // Inner Neck
//         points.push(new THREE.Vector2(0.4, 3.0));
//         // Inner Shoulder Curve
//         const innerCurvePoints = getBezier2DPoints(
//             new THREE.Vector2(0.4, 3.0),
//             new THREE.Vector2(0.9, 3.0),
//             new THREE.Vector2(0.9, 2.4),
//             10
//         );
//         points.push(...innerCurvePoints.slice(1));
//         // Inner Body and Bottom
//         points.push(new THREE.Vector2(0.9, 0.1));
//         points.push(new THREE.Vector2(0, 0.1));
//         // 1. Hollow Glass Body
//         const glassGeometry = new THREE.LatheGeometry(points, 64);
//         const glassMaterial = new THREE.MeshToonMaterial({
//             color: 0xddeeff,
//             transparent: true,
//             opacity: 0.35,
//             side: THREE.DoubleSide,
//             gradientMap: gradientMap,
//             depthWrite: false
//         });
//         const glassMesh = new THREE.Mesh(glassGeometry, glassMaterial);
//         glassMesh.castShadow = true;
//         glassMesh.receiveShadow = true;
//         this.bottleGroup.add(glassMesh);
//         // 2. Label
//         const labelGeometry = new THREE.CylinderGeometry(1.005, 1.005, 1.4, 64, 1, true);
//         const labelMaterial = new THREE.MeshToonMaterial({
//             color: 0xffffff,
//             side: THREE.DoubleSide,
//             gradientMap: gradientMap
//         });
//         const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
//         labelMesh.position.y = 1.2;
//         this.bottleGroup.add(labelMesh);
//         // 3. Stripe
//         const stripeGeometry = new THREE.CylinderGeometry(1.006, 1.006, 0.15, 64, 1, true);
//         const stripeMaterial = new THREE.MeshToonMaterial({
//             color: 0xff3366,
//             side: THREE.DoubleSide,
//             gradientMap: gradientMap
//         });
//         const stripeMesh = new THREE.Mesh(stripeGeometry, stripeMaterial);
//         stripeMesh.position.y = 1.7;
//         this.bottleGroup.add(stripeMesh);
//         // 4. Aluminum Cap Seal
//         const metalMaterial = new THREE.MeshToonMaterial({
//             color: 0xb0c4de,
//             side: THREE.DoubleSide,
//             gradientMap: gradientMap
//         });
//         const capSideGeometry = new THREE.CylinderGeometry(0.66, 0.66, 0.25, 32, 1, true);
//         const capSideMesh = new THREE.Mesh(capSideGeometry, metalMaterial);
//         capSideMesh.position.y = 3.48;
//         this.bottleGroup.add(capSideMesh);
//         const capTopGeometry = new THREE.RingGeometry(0.3, 0.66, 32);
//         const capTopMesh = new THREE.Mesh(capTopGeometry, metalMaterial);
//         capTopMesh.rotation.x = -Math.PI / 2;
//         capTopMesh.position.y = 3.605;
//         this.bottleGroup.add(capTopMesh);
//         // 5. Rubber Stopper
//         const rubberGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 32);
//         const rubberMaterial = new THREE.MeshToonMaterial({
//             color: 0x222222,
//             gradientMap: gradientMap
//         });
//         const rubberMesh = new THREE.Mesh(rubberGeometry, rubberMaterial);
//         rubberMesh.position.y = 3.6;
//         this.bottleGroup.add(rubberMesh);
//         // Center the bottle
//         this.bottleGroup.position.y = -1.5;
//         this.scene.add(this.bottleGroup);
//     }
//     public update(deltaTime: number): void {
//         // Cinematic slow rotation per frame
//         if (this.bottleGroup) {
//             this.bottleGroup.rotation.y += deltaTime * 0.2;
//         }
//     }
// }
