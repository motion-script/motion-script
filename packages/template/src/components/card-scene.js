import { ThreeStage } from '@motion-script/three';
import * as THREE from 'three';
export const galleryData = [
    {
        id: '01', title: 'Lumière', desc: 'morning dawn refraction', pms: 'PMS 134 C',
        bg: '#fbe8cd', blob1: '#ffd56d', blob2: '#e5a87e', imgColor1: '#ffc17a', imgColor2: '#ff8a5c',
        x: -1.8
    },
    {
        id: '02', title: 'Sylph', desc: 'pressed forest bloom', pms: 'PMS 555 C',
        bg: '#d4dfd8', blob1: '#84a98c', blob2: '#52796f', imgColor1: '#354f52', imgColor2: '#2f3e46',
        x: 1.8
    },
    {
        id: '03', title: 'Aura', desc: 'deep oceanic current', pms: 'PMS 295 C',
        bg: '#d1e5f0', blob1: '#92c5de', blob2: '#4393c3', imgColor1: '#2166ac', imgColor2: '#053061',
        x: -1.5
    },
    {
        id: '04', title: 'Ignis', desc: 'embers in ash', pms: 'PMS 1795 C',
        bg: '#f4d0cb', blob1: '#e58e82', blob2: '#d73027', imgColor1: '#a50026', imgColor2: '#4a000f',
        x: 1.6
    },
    {
        id: '05', title: 'Nova', desc: 'midnight velvet sky', pms: 'PMS 268 C',
        bg: '#e0d4eb', blob1: '#9e9ac8', blob2: '#6a51a3', imgColor1: '#4a1486', imgColor2: '#25004d',
        x: -0.5
    }
];
export class CardStage extends ThreeStage {
    data;
    // Engine settings
    PLANE_GAP = 8;
    PLANE_WIDTH = 3.2;
    PLANE_HEIGHT = 4.5;
    CAMERA_START_Z = 6;
    // Arrays to hold specific mesh references
    imagePlanes = [];
    textPlanes = [];
    // Materials and Meshes created later
    bgMat;
    trailMesh;
    constructor(data) {
        super();
        this.data = data ?? galleryData;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.z = this.CAMERA_START_Z;
    }
    setupScene() {
        this.setupBackground();
        this.setupTrail();
        this.setupGallery();
    }
    setupBackground() {
        const bgGeo = new THREE.PlaneGeometry(150, 150);
        this.bgMat = new THREE.ShaderMaterial({
            uniforms: {
                uBgColor: { value: new THREE.Color(this.data[0].bg) },
                uBlob1Color: { value: new THREE.Color(this.data[0].blob1) },
                uBlob2Color: { value: new THREE.Color(this.data[0].blob2) },
                uTime: { value: 0 },
                uBlobStrength: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform vec3 uBgColor;
                uniform vec3 uBlob1Color;
                uniform vec3 uBlob2Color;
                uniform float uTime;
                uniform float uBlobStrength;

                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                }

                void main() {
                    vec3 color = uBgColor;

                    vec2 blob1Center = vec2(0.5 + 0.3 * sin(uTime * 0.4), 0.5 + 0.3 * cos(uTime * 0.3));
                    vec2 blob2Center = vec2(0.5 + 0.4 * cos(uTime * 0.3), 0.5 + 0.2 * sin(uTime * 0.5));

                    float blob1 = smoothstep(0.8, 0.0, distance(vUv, blob1Center));
                    float blob2 = smoothstep(0.9, 0.0, distance(vUv, blob2Center));

                    vec3 b1Soft = mix(uBlob1Color, uBgColor, 0.3);
                    vec3 b2Soft = mix(uBlob2Color, uBgColor, 0.3);

                    color = mix(color, b1Soft, blob1 * uBlobStrength);
                    color = mix(color, b2Soft, blob2 * uBlobStrength);

                    float grain = random(vUv * vec2(1387.13, 947.91)) - 0.5;
                    color += grain * 0.04;

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            depthWrite: false
        });
        const bgMesh = new THREE.Mesh(bgGeo, this.bgMat);
        bgMesh.position.z = -50;
        this.camera.add(bgMesh); // Attach directly to camera so it moves with it
        this.scene.add(this.camera);
    }
    setupTrail() {
        const trailPoints = [];
        for (let i = 0; i <= 100; i++) {
            let t = i / 100;
            let z = this.CAMERA_START_Z - 2 - (t * (this.data.length * this.PLANE_GAP + 10));
            let x = Math.sin(t * Math.PI * 6) * 3;
            let y = Math.cos(t * Math.PI * 4) * 2;
            trailPoints.push(new THREE.Vector3(x, y, z));
        }
        const trailCurve = new THREE.CatmullRomCurve3(trailPoints, false, 'centripetal');
        const trailGeo = new THREE.TubeGeometry(trailCurve, 200, 0.02, 8, false);
        const trailMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.15,
            wireframe: true
        });
        this.trailMesh = new THREE.Mesh(trailGeo, trailMat);
        this.scene.add(this.trailMesh);
    }
    setupGallery() {
        const planeGeo = new THREE.PlaneGeometry(this.PLANE_WIDTH, this.PLANE_HEIGHT, 32, 32);
        const textPlaneGeo = new THREE.PlaneGeometry(5, 5); // Larger plane for crisp text rendering
        this.data.forEach((item, index) => {
            const baseZ = -index * this.PLANE_GAP;
            // 1. Image Mesh
            const tex = this.createAbstractTexture(item);
            const mat = new THREE.MeshBasicMaterial({ map: tex });
            const imgMesh = new THREE.Mesh(planeGeo, mat);
            imgMesh.position.set(item.x, 0, baseZ);
            this.scene.add(imgMesh);
            this.imagePlanes.push(imgMesh);
            // 2. Text Mesh (Replacing HTML UI)
            const textOnLeft = item.x > 0; // If image is on the right (>0), text goes on left
            const textTex = this.createTextTexture(item, textOnLeft);
            const textMat = new THREE.MeshBasicMaterial({
                map: textTex,
                transparent: true,
                opacity: 0
            });
            const textMesh = new THREE.Mesh(textPlaneGeo, textMat);
            // Position text next to the image plane
            const textXOffset = textOnLeft ? item.x - 3.8 : item.x + 3.8;
            textMesh.position.set(textXOffset, 0, baseZ);
            this.scene.add(textMesh);
            this.textPlanes.push(textMesh);
        });
    }
    createAbstractTexture(data) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1440;
        const ctx = canvas.getContext('2d');
        const grd = ctx.createLinearGradient(0, 0, 0, 1440);
        grd.addColorStop(0, data.bg);
        grd.addColorStop(1, data.blob2);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 1024, 1440);
        ctx.globalCompositeOperation = 'overlay';
        ctx.filter = 'blur(80px)';
        ctx.fillStyle = data.imgColor1;
        ctx.beginPath();
        ctx.arc(300, 400, 400, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'multiply';
        ctx.filter = 'blur(120px)';
        ctx.fillStyle = data.imgColor2;
        ctx.beginPath();
        ctx.arc(800, 1000, 600, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.filter = 'none';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(60, 60, 1024 - 120, 1440 - 120);
        ctx.beginPath();
        ctx.moveTo(60, 200);
        ctx.lineTo(1024 - 60, 200);
        ctx.moveTo(60, 1440 - 200);
        ctx.lineTo(1024 - 60, 1440 - 200);
        ctx.stroke();
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return tex;
    }
    createTextTexture(data, textOnLeft) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 1024, 1024);
        // All backgrounds are visually light, so text is dark
        const textColor = '#111111';
        const subTextColor = 'rgba(0,0,0,0.6)';
        const align = textOnLeft ? 'right' : 'left';
        const xBase = textOnLeft ? 974 : 50;
        const yBase = 250; // Push down slightly to align vertically with image
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        // Meta Line
        ctx.font = '500 24px Inter, sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillText(`NO. ${data.id}  //  ARCHIVAL MOOD`, xBase, yBase);
        // Title
        ctx.font = '300 120px "Cormorant Garamond", serif';
        ctx.fillStyle = textColor;
        ctx.fillText(data.title, xBase, yBase + 40);
        // Description
        ctx.font = 'italic 400 32px Inter, sans-serif';
        ctx.fillStyle = subTextColor;
        ctx.fillText(data.desc, xBase, yBase + 180);
        // Color Chip
        const chipY = yBase + 280;
        const chipRadius = 24;
        if (textOnLeft) {
            // Right-aligned (Text is to the left of the image)
            ctx.beginPath();
            ctx.arc(xBase - chipRadius, chipY + chipRadius, chipRadius, 0, Math.PI * 2);
            ctx.fillStyle = data.imgColor1;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.stroke();
            ctx.font = '400 20px monospace';
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(data.pms, xBase - 70, chipY + 8);
            ctx.fillText(`HEX ${data.imgColor1.toUpperCase()}`, xBase - 70, chipY + 36);
        }
        else {
            // Left-aligned (Text is to the right of the image)
            ctx.beginPath();
            ctx.arc(xBase + chipRadius, chipY + chipRadius, chipRadius, 0, Math.PI * 2);
            ctx.fillStyle = data.imgColor1;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.stroke();
            ctx.font = '400 20px monospace';
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(data.pms, xBase + 70, chipY + 8);
            ctx.fillText(`HEX ${data.imgColor1.toUpperCase()}`, xBase + 70, chipY + 36);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }
    onTime(t) {
        // --- TIME-BASED ANIMATION LOGIC ---
        // Calculate a simulated scroll position based strictly on time `t` (in seconds).
        // Using a sine wave creates a smooth, continuous back-and-forth auto-pan.
        // If you prefer linear looping instead of back-and-forth, you can use:
        // const simulatedScroll = (t * speedMultiplier) % maxScroll;
        const speedMultiplier = 0.3; // Adjust this to make the pan faster/slower
        const maxScroll = (this.data.length - 1) * this.PLANE_GAP;
        const simulatedScroll = (Math.sin(t * speedMultiplier) * 0.5 + 0.5) * maxScroll;
        // Update Camera
        this.camera.position.z = this.CAMERA_START_Z - simulatedScroll;
        // Update Trail
        if (this.trailMesh) {
            this.trailMesh.rotation.z = simulatedScroll * 0.05;
        }
        // Mood Blending & Shader Update
        const progress = simulatedScroll / this.PLANE_GAP;
        const currentIndex = Math.max(0, Math.min(this.data.length - 1, Math.floor(progress)));
        const nextIndex = Math.min(currentIndex + 1, this.data.length - 1);
        const blend = progress - currentIndex;
        const cBg = new THREE.Color(this.data[currentIndex].bg).lerp(new THREE.Color(this.data[nextIndex].bg), blend);
        const cB1 = new THREE.Color(this.data[currentIndex].blob1).lerp(new THREE.Color(this.data[nextIndex].blob1), blend);
        const cB2 = new THREE.Color(this.data[currentIndex].blob2).lerp(new THREE.Color(this.data[nextIndex].blob2), blend);
        if (this.bgMat) {
            this.bgMat.uniforms.uBgColor.value.copy(cBg);
            this.bgMat.uniforms.uBlob1Color.value.copy(cB1);
            this.bgMat.uniforms.uBlob2Color.value.copy(cB2);
            this.bgMat.uniforms.uTime.value = t * 0.5; // Organic drift using real time
        }
        // Fade 3D Text Planes based on distance to camera
        this.textPlanes.forEach((mesh, i) => {
            const dist = Math.abs(simulatedScroll - (i * this.PLANE_GAP));
            const opacity = 1.0 - Math.min(dist / (this.PLANE_GAP * 0.6), 1.0);
            // Ensure material isn't type-cast purely as Material
            const mat = mesh.material;
            mat.opacity = opacity;
            mesh.visible = opacity > 0.01;
            // Subtle float effect on text
            mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, (1.0 - opacity) * 0.5, 0.1);
        });
        // Finally render
        this.renderer.render(this.scene, this.camera);
    }
}
