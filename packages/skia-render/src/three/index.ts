/**
 * The 3D backend's public face to the rest of `@motion-script/web`.
 *
 * The render context talks only to {@link Canvas3DBackend}, so the lazy three
 * import stays an implementation detail: a 2D-only project reaches
 * `canvas3DBackend()`, gets `null`, and never pulls in the chunk.
 *
 * Pure re-export barrel — non-barrel modules must import the concrete file
 * (`./three/backend`, `./three/bridge`, …) rather than this.
 */

export {
    loadCanvas3D, threeModule, registerCanvas3DBackend,
    requestCanvas3DWarm, warmPendingCanvas3D, __resetCanvas3DBridgeForTests,
} from "./bridge";
export {
    Canvas3DBackend, canvas3DBackend, disposeCanvas3DBackend, canvas3DModule,
} from "./backend";
export { disposeTextureCache } from "./handlers/texture";
export {
    registerCanvas3DRendererHost, canvas3DRendererHost, __resetView3DRendererHostForTests,
} from "./renderer-seam";
export type {
    RenderedCanvas3D, Canvas3DRendererHost, Canvas3DRendererSettings,
} from "./renderer-seam";
export type { Canvas3DAssets } from "./handlers/texture";
