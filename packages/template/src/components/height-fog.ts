// import * as THREE from 'three/webgpu';
// import { exponentialHeightFogFactor, uniform, fog, color } from 'three/tsl';
// import { ThreeStage } from '@motion-script/three';
// export class HeightFogStage extends ThreeStage {
//     private instancedMesh!: THREE.InstancedMesh;

//     // Storing uniforms as class properties so they could be animated or updated later
//     private fogDensity = uniform(0.04);
//     private fogHeight = uniform(2);

//     constructor() {
//         super();
//         this.initializeScene();
//     }

//     /**
//      * Sets up the TSL fog, instanced meshes, and lighting.
//      */
//     protected setupScene(): void {
//         // 1. Override the base camera settings to match the HTML snippet
//         this.camera.fov = 45;
//         this.camera.position.set(20, 10, 25);
//         this.camera.lookAt(0, 0, 0);
//         this.camera.updateProjectionMatrix();

//         // 2. Setup TSL Exponential Height Fog and Background
//         const fogFactor = exponentialHeightFogFactor(this.fogDensity, this.fogHeight);

//         // Note: Casting scene to 'any' bypasses standard WebGL scene type limits
//         // to attach WebGPU/TSL specific node properties
//         this.scene.fogNode = fog(color(0xffdfc1), fogFactor);
//         this.scene.backgroundNode = color(0xffdfc1);

//         // 3. Create Geometry and Node Material
//         const geometry = new THREE.BoxGeometry(1, 25, 1);
//         const material = new THREE.MeshPhongMaterial({ color: 0xcd959a });

//         // 4. Create and position the InstancedMesh
//         this.instancedMesh = new THREE.InstancedMesh(geometry, material, 100);
//         this.instancedMesh.position.y = -10;
//         this.scene.add(this.instancedMesh);

//         const dummy = new THREE.Object3D();
//         let index = 0;

//         for (let i = 0; i < 10; i++) {
//             for (let j = 0; j < 10; j++) {
//                 dummy.position.x = -18 + (i * 4);
//                 dummy.position.z = -18 + (j * 4);
//                 dummy.updateMatrix();

//                 this.instancedMesh.setMatrixAt(index++, dummy.matrix);
//             }
//         }

//         // 5. Add Lighting
//         const directionalLight = new THREE.DirectionalLight(0xffc0cb, 2);
//         directionalLight.position.set(-10, 10, 10);
//         this.scene.add(directionalLight);

//         const ambientLight = new THREE.AmbientLight(0xcccccc);
//         this.scene.add(ambientLight);
//     }

//     /**
//      * Called per frame.
//      * The original example relies on OrbitControls for movement,
//      * but you can add programmatic animation here if desired.
//      */
//     public update(deltaTime: number): void {
//         if (!this.instancedMesh) return;

//         // Example: Slowly rotate the entire group of instanced meshes
//         // this.instancedMesh.rotation.y += 0.1 * deltaTime;
//     }
// }