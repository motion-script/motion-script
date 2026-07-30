/**
 * The 3D backend's public face to the rest of `@motion-script/web`.
 *
 * The render context talks only to {@link View3DBackend}, so the lazy three
 * import stays an implementation detail: a 2D-only project reaches
 * `view3DBackend()`, gets `null`, and never pulls in the chunk.
 *
 * Pure re-export barrel — non-barrel modules must import the concrete file
 * (`./three/backend`, `./three/bridge`, …) rather than this.
 */

export {
    loadView3D, threeModule, registerView3DBackend,
    requestView3DWarm, warmPendingView3D, __resetView3DBridgeForTests,
} from "./bridge";
export {
    View3DBackend, view3DBackend, disposeView3DBackend, view3DModule,
} from "./backend";
export { disposeTextureCache } from "./handlers/texture";
export {
    registerView3DRendererHost, view3DRendererHost, __resetView3DRendererHostForTests,
} from "./renderer-seam";
export type {
    RenderedView3D, View3DRendererHost, View3DRendererSettings,
} from "./renderer-seam";
export type { View3DAssets } from "./handlers/texture";
