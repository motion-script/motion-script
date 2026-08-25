/**
 * `model` op → a live copy of a loaded glTF graph.
 *
 * The odd one among the handlers, because what it builds is not described by the
 * descriptor: every other op states its geometry and material in full, while this
 * one names a *file* and takes whatever is in it. So the three things here are
 * the three things a descriptor is allowed to say about someone else's graph —
 * put a copy of it in the scene, seek its baked clips, and replace named
 * materials on it.
 *
 * ── Why a clone, every time ───────────────────────────────────────────────────
 * three gives an object exactly one parent. Adding the loaded graph itself to a
 * scene would mean the second `Model3D` node pointing at a file *stole* it from
 * the first, and the first would silently go missing — so the bridge keeps the
 * parsed graph as an untouched master and every drawn instance is a clone of it.
 * The clone is `SkeletonUtils`', not `Object3D.clone()`: a plain clone copies a
 * skinned mesh's bone *references*, leaving two meshes driven by one skeleton, so
 * animating either one animates both.
 *
 * ── Why the animation is seeked rather than advanced ──────────────────────────
 * `ModelAnimation3D.time` is documented as explicit by design, and this is where
 * that is honoured: each action is `paused` and has its `time` written directly,
 * then the mixer is updated by a delta of **zero**. A mixer advanced by frame
 * deltas would make a model's pose depend on which frames happened to be drawn
 * before it, which is exactly the thing that breaks scrubbing and makes an export
 * disagree with the preview.
 */

import type * as THREE from "three";
import type { Material3D, ModelAnimation3D } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { canvas3DModel } from "../bridge";
import { createMaterial } from "./material";
import type { TextureResolver } from "./texture";

/** The per-instance animation state a cached model object carries between frames. */
export interface ModelPlayback {
    mixer: THREE.AnimationMixer;
    /** Actions by resolved clip name, so a frame reuses rather than rebuilds them. */
    actions: Map<string, THREE.AnimationAction>;
}

/**
 * An independent copy of the model at `src`, or `null` while it is still loading.
 *
 * `null` is not an error — it is the ordinary state on the frames between a
 * scene first mentioning a file and the loader finishing with it. The caller
 * leaves the slot empty and asks to be re-rendered.
 */
export function createModel(src: string): THREE.Object3D | null {
    return canvas3DModel(src)?.clone() ?? null;
}

/** Whether the model at `src` has finished loading — the model half of a signature. */
export function modelLoaded(src: string): boolean {
    return canvas3DModel(src) !== null;
}

/**
 * Pose `object` at the times `animation` names.
 *
 * Returns the playback state so the caller can keep it on its cache entry: the
 * mixer binds to *this* clone's nodes, so it has exactly the lifetime the clone
 * does and cannot be shared between instances or rebuilt per frame.
 */
export function applyModelAnimation(
    three: ThreeModule,
    object: THREE.Object3D,
    src: string,
    animation: readonly ModelAnimation3D[] | undefined,
    playback: ModelPlayback | undefined,
): ModelPlayback | undefined {
    const clips = canvas3DModel(src)?.animations ?? [];
    if (clips.length === 0) return playback;

    // A model that states no animation is left in its bind pose. Tearing the
    // mixer down here would also be correct, but a scene that toggles animation
    // on and off would then rebuild it every time it came back.
    if (!animation || animation.length === 0) {
        if (playback) for (const action of playback.actions.values()) action.enabled = false;
        return playback;
    }

    const state = playback ?? { mixer: new three.AnimationMixer(object), actions: new Map() };

    // Every action starts disabled and only the ones this frame names are turned
    // back on, so a clip that drops out of the list stops contributing rather
    // than holding its last pose over the top of the others.
    for (const action of state.actions.values()) action.enabled = false;

    for (const entry of animation) {
        const clip = resolveClip(clips, entry.clip);
        if (!clip) continue;

        let action = state.actions.get(clip.name);
        if (!action) {
            action = state.mixer.clipAction(clip);
            state.actions.set(clip.name, action);
        }

        action.enabled = true;
        action.setEffectiveWeight(entry.weight ?? 1);
        action.play();
        // Paused *and* explicitly timed — see this file's header. The
        // `mixer.update(0)` below then evaluates the interpolants at these times
        // without advancing anything.
        action.paused = true;
        action.time = wrapTime(entry.time, clip.duration);
    }

    state.mixer.update(0);
    return state;
}

/**
 * Replace materials on a loaded graph, keyed by mesh name or material name.
 *
 * Both keys are accepted because a glTF author controls neither reliably: an
 * exporter may name the mesh and leave the material as `Material.001`, or share
 * one named material across several unnamed meshes. Mesh name wins where both
 * match, being the more specific of the two.
 *
 * Only assigns when something actually changed, since writing `mesh.material`
 * marks the mesh dirty even with an equal value. A descriptor that genuinely
 * moved still rebuilds the whole object, because the reconciler folds the
 * override set into the op's material signature.
 */
export function applyModelOverrides(
    three: ThreeModule,
    object: THREE.Object3D,
    override: Readonly<Record<string, Material3D>> | undefined,
    textures: TextureResolver,
): void {
    if (!override) return;

    object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const replaced = materials.map((material) => {
            const key = overrideKeyFor(override, mesh.name, material?.name);
            return key === null ? material : createMaterial(three, override[key], textures);
        });

        if (replaced.some((material, index) => material !== materials[index])) {
            mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0];
        }
    });
}

/**
 * The override set as a signature fragment.
 *
 * Keys are sorted so two descriptors naming the same overrides in a different
 * order compare equal — key order on an object literal is stable in JS, but the
 * descriptor is rebuilt every frame from whatever the author wrote.
 */
export function modelOverrideSignature(
    override: Readonly<Record<string, Material3D>> | undefined,
): string {
    if (!override) return "";
    return Object.keys(override)
        .sort()
        .map((key) => `${key}=${JSON.stringify(override[key])}`)
        .join("&");
}

/** Which override key applies to a mesh, preferring the mesh's own name. */
function overrideKeyFor(
    override: Readonly<Record<string, Material3D>>,
    meshName: string,
    materialName: string | undefined,
): string | null {
    if (override[meshName] !== undefined) return meshName;
    if (materialName !== undefined && override[materialName] !== undefined) return materialName;
    return null;
}

/** The named or indexed clip, defaulting to the first in the file. */
function resolveClip(
    clips: readonly THREE.AnimationClip[],
    clip: string | number | undefined,
): THREE.AnimationClip | undefined {
    if (clip === undefined) return clips[0];
    if (typeof clip === "number") return clips[clip];
    return clips.find((candidate) => candidate.name === clip);
}

/**
 * `time` folded into the clip's own length.
 *
 * Wrapped rather than clamped, so a clip driven by a scene-long ramp loops
 * instead of sticking on its last frame — which is what a walk cycle wants, and
 * what every other reading of "seconds into the clip" would have to special-case
 * anyway. A negative time wraps from the end for the same reason.
 */
function wrapTime(time: number, duration: number): number {
    if (!Number.isFinite(time)) return 0;
    if (duration <= 0) return 0;
    const wrapped = time % duration;
    return wrapped < 0 ? wrapped + duration : wrapped;
}
