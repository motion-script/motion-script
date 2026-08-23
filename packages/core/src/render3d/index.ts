/**
 * 3D scene description.
 *
 * The same split as 2D, one dimension over: a {@link Graphics3D} is what a single
 * node draws (the `Graphics2D` of 3D), a {@link RenderContext3D} is what it draws
 * *into*, and a {@link Scene3D} is the recorded result — camera, lights, fog and
 * every drawable — that a backend replays.
 *
 * Unlike `@/render` (whose descriptors are `@internal`, since nodes build them on
 * the author's behalf), the vocabulary here is **public**: a `Node3D` takes these
 * descriptors as props, and a hand-built `Scene3D` is the escape hatch for
 * painting 3D through an arbitrary 2D path.
 *
 * Nothing in this directory imports a renderer, and no field holds a DOM handle —
 * so `three` stays entirely inside `@motion-script/web`.
 */

export { Graphics3D } from "./graphics3d";
export type {
    Graphics3DOp, LineMode3D, ModelAnimation3D,
    MaterialShorthand3D, MeshShorthand3D,
} from "./graphics3d";
/** @internal */ export { DRAWABLE_KINDS } from "./graphics3d";

export { Scene3D } from "./scene3d";
export type { Scene3DOp } from "./scene3d";

export { RenderContext3D } from "./render-context3d";
export type { Node3DRenderState } from "./render-context3d";

export { Geo, Mat, Tex } from "./builders";

export {
    lerpVector3, lerpEuler3, slerpQuaternion, normalizeQuaternion,
    quaternionFromEuler, resolveVector3, IDENTITY_QUATERNION,
} from "./vector3";
export type { Vector3, Vector3Input, Euler3, EulerOrder, Quaternion } from "./vector3";

export type { Transform3D, Side3D, Blending3D } from "./transform";

export { geometryBounds3D } from "./bounds3d";
export type { Box3 } from "./bounds3d";
/** @internal */ export { centeredBox3, corners3, transformBox3, unionBox3 } from "./bounds3d";

/** @internal */ export {
    applyMatrix4, compose4, identity4, invert4, lookAtRotation4, multiply4,
    orthographic4, perspective4, rotationOf4, transformMatrix4, translation4,
} from "./matrix4";
/** @internal */ export type { Matrix4, Vector4 } from "./matrix4";

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

export { isDataTexture3D, isSurfaceTexture3D, resolveTexture3D, resolveSurfaceSource, texture3DSource } from "./texture";
export type {
    Texture3D, ImageTexture3D, DataTexture3D, SurfaceTexture3D, TextureOptions3D,
    SurfaceSource3D, ResolvedSurfaceSource,
    TextureWrap3D, TextureFilter3D, TextureColorSpace3D,
} from "./texture";

export type {
    LightData3D, LightShadowData3D, DirectionalLightShadowData3D,
    AmbientLightData3D, HemisphereLightData3D, DirectionalLightData3D,
    PointLightData3D, SpotLightData3D, RectAreaLightData3D,
} from "./light";

export type { CameraData3D, PerspectiveCameraData3D, OrthographicCameraData3D } from "./camera";

export type {
    FogData3D, BackgroundData3D, EnvironmentData3D, ShadowSettingsData3D, ShadowType3D,
    ToneMappingData3D, ToneMappingMode3D, PostEffectData3D,
} from "./scene-settings";

/** @internal */ export { track3DResources } from "./tracking";
/** @internal */ export { forEachTexture3D, isTextureLike, TEXTURE_KEYS } from "./walk";

export { registerCanvas3DWarmup, registerCanvas3DResourceLoader } from "./resources";
export type { Canvas3DWarmup, Canvas3DResourceLoader, Canvas3DResourceKind } from "./resources";
/** @internal */ export { warmCanvas3D, canvas3DResourceLoader, hasCanvas3DBackend } from "./resources";
