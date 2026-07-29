/**
 * 3D scene description — the `Graphics` of 3D.
 *
 * Unlike `@/render` (whose descriptors are `@internal`, since nodes build them on
 * the author's behalf), everything here is **public**: there is exactly one 3D
 * node, so `Graphics3D` and its descriptors *are* the authoring surface.
 *
 * Nothing in this directory imports a renderer, and no field holds a DOM handle —
 * so `three` stays entirely inside `@motion-script/web`.
 */

export { Graphics3D } from "./graphics3d";
export type {
    Graphics3DOp, LineMode3D, ModelAnimation3D,
    MaterialShorthand3D, MeshShorthand3D,
} from "./graphics3d";

export { Geo, Mat, Tex } from "./builders";

export {
    lerpVector3, lerpEuler3, slerpQuaternion, normalizeQuaternion,
    quaternionFromEuler, resolveVector3, IDENTITY_QUATERNION,
} from "./vector3";
export type { Vector3, Vector3Input, Euler3, EulerOrder, Quaternion } from "./vector3";

export type { Transform3D, Side3D, Blending3D } from "./transform";

export { evaluateParametric } from "./geometry";
export type {
    Geometry3D, Passthrough3D,
    BoxGeometry3D, SphereGeometry3D, PlaneGeometry3D, CylinderGeometry3D,
    ConeGeometry3D, TorusGeometry3D, TorusKnotGeometry3D, CircleGeometry3D,
    RingGeometry3D, CapsuleGeometry3D, PolyhedronGeometry3D, ExtrudeGeometry3D,
    LatheGeometry3D, TubeGeometry3D, BufferGeometry3D, ParametricGeometry3D,
    ParametricVertex3D, EdgesGeometry3D, WireframeGeometry3D, ModelGeometry3D,
} from "./geometry";

export { MUTABLE_MATERIAL_KEYS, STRUCTURAL_MATERIAL_KEYS } from "./material";
export type {
    Material3D, MaterialCommon3D, Uniform3D,
    BasicMaterial3D, StandardMaterial3D, PhysicalMaterial3D, PhongMaterial3D,
    LambertMaterial3D, ToonMaterial3D, NormalMaterial3D, DepthMaterial3D,
    MatcapMaterial3D, PointsMaterial3D, LineBasicMaterial3D, LineDashedMaterial3D,
    SpriteMaterial3D, ShadowMaterial3D, ShaderMaterial3D,
} from "./material";

export { isDataTexture3D, isSurfaceTexture3D, resolveTexture3D, texture3DSource } from "./texture";
export type {
    Texture3D, ImageTexture3D, DataTexture3D, SurfaceTexture3D, TextureOptions3D,
    TextureWrap3D, TextureFilter3D, TextureColorSpace3D,
} from "./texture";

export type {
    Light3D, LightShadow3D, DirectionalLightShadow3D,
    AmbientLight3D, HemisphereLight3D, DirectionalLight3D,
    PointLight3D, SpotLight3D, RectAreaLight3D,
} from "./light";

export type { Camera3D, PerspectiveCamera3D, OrthographicCamera3D } from "./camera";

export type {
    Fog3D, Background3D, Environment3D, ShadowSettings3D, ShadowType3D,
    ToneMapping3D, ToneMappingMode3D, PostEffect3D,
} from "./scene-settings";

/** @internal */ export { track3DResources } from "./tracking";
/** @internal */ export { forEachTexture3D, isTextureLike, TEXTURE_KEYS } from "./walk";

export { registerView3DWarmup, registerView3DResourceLoader } from "./resources";
export type { View3DWarmup, View3DResourceLoader, View3DResourceKind } from "./resources";
/** @internal */ export { warmView3D, view3DResourceLoader, hasView3DBackend } from "./resources";
