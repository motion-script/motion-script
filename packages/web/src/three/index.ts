/**
 * The 3D backend's public face to the rest of `@motion-script/web`.
 *
 * The render context talks only to {@link Scene3DBackend}, so the lazy three
 * import stays an implementation detail: a 2D-only project reaches
 * `scene3DBackend()`, gets `null`, and never pulls in the chunk.
 *
 * Pure re-export barrel — non-barrel modules must import the concrete file
 * (`./three/backend`, `./three/bridge`, …) rather than this.
 */

export {
    loadScene3D, threeModule, registerScene3DBackend,
    requestScene3DWarm, warmPendingScene3D, __resetScene3DBridgeForTests,
} from "./bridge";
export {
    Scene3DBackend, scene3DBackend, disposeScene3DBackend, scene3DModule,
} from "./backend";
export { disposeSharedRenderer } from "./renderer";
export { disposeTextureCache } from "./handlers/texture";
export type { RenderedScene3D } from "./renderer";
export type { Scene3DAssets } from "./handlers/texture";
