import { ThreeStage } from "@motion-script/three";
import * as THREE from 'three';
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";

export class BubbleStage extends ThreeStage {
    // Class properties and configurations declared outside the constructor
    private simplex: SimplexNoise;
    private animationSpeed: number = 0.2;
    private displacementAmount: number = 0.6;
    private noiseScale: number = 0.4;

    // Three.js object declarations
    // Using definite assignment assertion (!) since they are assigned in setupScene
    public blob!: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
    public geometry!: THREE.IcosahedronGeometry;
    public originalPositions!: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

    constructor() {
        super();

        // Use a seeded random function to guarantee determinism across page reloads
        let seed = 12345;
        const seededRandom = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };
        this.simplex = new SimplexNoise({ random: seededRandom });
    }

    setupScene(): void {
        // Note: Assuming `this.scene` is either instantiated by the base `ThreeStage` class 
        // or you have `this.scene = new THREE.Scene();` defined prior.

        this.camera = new THREE.PerspectiveCamera(75, this.viewport.width / this.viewport.height, 0.1, 1000);
        this.camera.position.z = 5;

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // r128 used a non-physical BRDF that implicitly multiplied light by π.
        // r155+ corrected this, making the same intensity values appear ~π× dimmer.
        // Disable tone mapping so CanvasKit receives raw sRGB values without
        // an extra curve applied on top.
        this.renderer.toneMapping = THREE.NoToneMapping;

        // Intensities scaled by π to match r128's non-physical BRDF, which
        // implicitly multiplied by π. r155+ corrected the BRDF so the same
        // values appear ~π× dimmer without this adjustment.
        const PI = Math.PI;
        const ambientLight = new THREE.AmbientLight(0xffdfd0, 0.7 * PI);
        this.scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffeedd, 0.5 * PI);
        dirLight1.position.set(5, 8, 5);
        dirLight1.castShadow = true;
        dirLight1.shadow.mapSize.width = 1024;
        dirLight1.shadow.mapSize.height = 1024;
        dirLight1.shadow.camera.near = 0.5;
        dirLight1.shadow.camera.far = 15;
        dirLight1.shadow.bias = -0.001;
        dirLight1.shadow.radius = 8;
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0x5a2e60, 1.0 * PI);
        dirLight2.position.set(-5, -6, 1);
        this.scene.add(dirLight2);

        const fillLight = new THREE.DirectionalLight(0xffaacc, 0.8 * PI);
        fillLight.position.set(5, -2, -5);
        this.scene.add(fillLight);

        const leftFillLight = new THREE.DirectionalLight(0xffd0e0, 0.5 * PI);
        leftFillLight.position.set(-8, 2, -2);
        this.scene.add(leftFillLight);

        const pointLight = new THREE.PointLight(0xffe5d0, 0.4 * PI, 20);
        pointLight.position.set(2, 3, 5);
        this.scene.add(pointLight);

        this.geometry = new THREE.IcosahedronGeometry(1.8, 64);
        this.originalPositions = this.geometry.attributes.position.clone();

        const material = new THREE.MeshStandardMaterial({
            color: 0xef9cba,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: false
        });

        this.blob = new THREE.Mesh(this.geometry, material);
        this.blob.castShadow = true;
        this.blob.receiveShadow = true;
        this.scene.add(this.blob);

        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.15 });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -2.8;
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    onTime(t: number): void {
        // Ensure rotation is completely tied to time (t)
        this.blob.rotation.x = t * 0.06;
        this.blob.rotation.y = t * 0.09;

        // Cast to BufferAttribute since we need to access position.count and setXYZ
        const positions = this.geometry.attributes.position as THREE.BufferAttribute;
        const vertex = new THREE.Vector3();
        const normal = new THREE.Vector3();

        // Convert absolute seconds into the deterministic noise offset
        const timeOffset = t * 0.6 * this.animationSpeed;

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(this.originalPositions as THREE.BufferAttribute, i);
            normal.copy(vertex).normalize();

            const noise = this.simplex.noise3d(
                vertex.x * this.noiseScale + timeOffset,
                vertex.y * this.noiseScale + timeOffset,
                vertex.z * this.noiseScale + timeOffset
            );

            vertex.addScaledVector(normal, noise * this.displacementAmount);
            positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        positions.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }
}