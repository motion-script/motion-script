/**
 * `Material3D` descriptor → `THREE.Material`, plus the in-place update path.
 *
 * The split that matters for performance:
 *
 *  - **Uniform-ish values** (`color`, `roughness`, `opacity`, shader uniform
 *    values, …) are written straight onto the live material every frame. Free.
 *  - **Structural flags** (`transparent`, `side`, `vertexColors`, `flatShading`,
 *    map presence, shader source) change the *compiled program*. Those live in
 *    {@link materialSignature}; a change there rebuilds the material.
 *
 * Core publishes both key lists (`MUTABLE_MATERIAL_KEYS` /
 * `STRUCTURAL_MATERIAL_KEYS`) so the two sides can't disagree about what is cheap.
 */

import type * as THREE from "three";
import type { Material3D, Texture3D, Uniform3D } from "@motion-script/core";
import { STRUCTURAL_MATERIAL_KEYS } from "@motion-script/core";
import type { ThreeModule } from "../bridge";
import { blending, colorAlpha, deg, faces, makeColor, writeColor } from "./constants";
import type { TextureResolver } from "./texture";

/** Which material fields hold a texture, so they can be resolved generically. */
const MAP_KEYS = [
    "map", "alphaMap", "aoMap", "normalMap", "displacementMap", "envMap",
    "lightMap", "emissionMap", "roughnessMap", "metalnessMap", "specularMap",
    "gradientMap", "matcap", "clearcoatMap", "clearcoatNormalMap",
    "clearcoatRoughnessMap", "transmissionMap", "thicknessMap",
] as const;

/**
 * Core's name for a field → three's, where the two differ.
 *
 * Core names these for what an author is describing; three names them after its
 * own history. Kept as a table rather than a `case` per key so the translation is
 * visible in one place — the same job the string-enum maps in `constants.ts` do.
 */
const FIELD_ALIASES: Readonly<Record<string, string>> = {
    emission: "emissive",
    emissionStrength: "emissiveIntensity",
    emissionMap: "emissiveMap",
};

/** Map slots whose data is numeric, not colour — they must stay linear. */
const LINEAR_MAP_KEYS: ReadonlySet<string> = new Set([
    "normalMap", "roughnessMap", "metalnessMap", "aoMap", "displacementMap",
    "alphaMap", "clearcoatRoughnessMap", "clearcoatNormalMap",
    "transmissionMap", "thicknessMap",
]);

/** Colour-valued fields, so they can be written through core's linear parser. */
const COLOR_KEYS = [
    "color", "emission", "specular", "sheenColor", "specularColor", "attenuationColor",
] as const;

/**
 * Whether a material needs alpha blending — derived, not asked for.
 *
 * `transparent` was a second flag an author had to remember to pair with a fade,
 * and forgetting it made `opacity: 0.5` silently do nothing. Everything that
 * genuinely needs blending is visible in the descriptor, so it is read off it:
 * an `opacity` below 1, a colour carrying alpha, a per-pixel `alphaMap`, or
 * transmission (real refraction, which is blending by definition).
 *
 * An explicit `transparent: true` still forces it on, for the occasional
 * draw-order reason. An explicit `false` cannot turn off blending that a lower
 * alpha requires — there was never a use for that beyond expressing a bug.
 */
function needsBlending(descriptor: Material3D): boolean {
    const bag = descriptor as unknown as Record<string, unknown>;
    if (bag.transparent === true) return true;
    if (typeof bag.opacity === "number" && bag.opacity < 1) return true;
    if (bag.alphaMap !== undefined) return true;
    if (typeof bag.transmission === "number" && bag.transmission > 0) return true;
    if (bag.color !== undefined && colorAlpha(bag.color as never) < 1) return true;
    return false;
}

function createRaw(three: ThreeModule, descriptor: Material3D): THREE.Material {
    switch (descriptor.type) {
        case "basic": return new three.MeshBasicMaterial();
        case "standard": return new three.MeshStandardMaterial();
        case "physical": return new three.MeshPhysicalMaterial();
        case "phong": return new three.MeshPhongMaterial();
        case "lambert": return new three.MeshLambertMaterial();
        case "toon": return new three.MeshToonMaterial();
        case "normal": return new three.MeshNormalMaterial();
        case "depth": return new three.MeshDepthMaterial();
        case "matcap": return new three.MeshMatcapMaterial();
        case "points": return new three.PointsMaterial();
        case "lineBasic": return new three.LineBasicMaterial();
        case "lineDashed": return new three.LineDashedMaterial();
        case "sprite": return new three.SpriteMaterial();
        case "shadow": return new three.ShadowMaterial();
        case "shader": return createShader(three, descriptor);
        default: return new three.MeshStandardMaterial();
    }
}

function createShader(
    three: ThreeModule,
    descriptor: Extract<Material3D, { type: "shader" }>,
): THREE.Material {
    const Ctor = descriptor.raw ? three.RawShaderMaterial : three.ShaderMaterial;
    return new Ctor({
        vertexShader: descriptor.vertex,
        fragmentShader: descriptor.fragment,
        defines: descriptor.defines as Record<string, unknown> | undefined,
        uniforms: {},
    });
}

/**
 * Build a material and apply every field from `descriptor`.
 *
 * Note that `material.premultipliedAlpha` is deliberately left at three's
 * default. Both settings are self-consistent — three picks the blend function to
 * match the flag (`ONE` with it, `SRC_ALPHA` without) and defines
 * `PREMULTIPLIED_ALPHA` for the shader in step — so either produces a correctly
 * premultiplied drawing buffer. Setting it is a no-op, which is worth recording
 * because it looks like the fix for a translucency bug and is not: see
 * `WebStorageAdapter.upload3DFrame`, where that bug actually lived.
 */
export function createMaterial(
    three: ThreeModule,
    descriptor: Material3D,
    textures: TextureResolver,
): THREE.Material {
    const material = createRaw(three, descriptor);
    applyMaterial(three, material, descriptor, textures, true);
    return material;
}

/**
 * Write `descriptor` onto a live material.
 *
 * `structural` is true only on creation (or a rebuild): on a normal frame the
 * structural flags are skipped, both because they cannot have changed without the
 * signature changing, and because writing them at all sets `needsUpdate` and
 * triggers a recompile.
 */
export function applyMaterial(
    three: ThreeModule,
    material: THREE.Material,
    descriptor: Material3D,
    textures: TextureResolver,
    structural = false,
): void {
    const bag = descriptor as unknown as Record<string, unknown>;
    const target = material as unknown as Record<string, unknown>;

    // ── Colours ──────────────────────────────────────────────────────────────
    // Alpha in a colour string ("white/10", "#0008") folds into material opacity,
    // since three keeps the two separate. An explicit `opacity` still wins.
    let colorAlphaValue: number | undefined;
    for (const key of COLOR_KEYS) {
        const value = bag[key];
        if (value === undefined) continue;
        const field = FIELD_ALIASES[key] ?? key;
        const existing = target[field];
        if (existing && typeof existing === "object" && "setRGB" in existing) {
            writeColor(three, existing as THREE.Color, value as never);
        } else {
            target[field] = makeColor(three, value as never);
        }
        if (key === "color") {
            const alpha = colorAlpha(value as never);
            if (alpha < 1) colorAlphaValue = alpha;
        }
    }

    // ── Plain scalar/vector values ───────────────────────────────────────────
    for (const key of Object.keys(bag)) {
        if (key === "type" || key === "params") continue;
        if ((COLOR_KEYS as readonly string[]).includes(key)) continue;
        if ((MAP_KEYS as readonly string[]).includes(key)) continue;
        if (key === "uniforms" || key === "vertex" || key === "fragment" || key === "defines" || key === "raw" || key === "extends") continue;
        if (!structural && (STRUCTURAL_MATERIAL_KEYS as readonly string[]).includes(key)) continue;
        // Derived below, from everything else in the descriptor.
        if (key === "transparent") continue;

        const value = bag[key];
        if (value === undefined) continue;

        switch (key) {
            case "faces":
                material.side = faces(three, value as never);
                break;
            case "shading":
                target.flatShading = value === "flat";
                break;
            case "blend":
                material.blending = blending(three, value as never);
                break;
            case "normalScale":
                writeNormalScale(three, target, value);
                break;
            case "rotation":
                // SpriteMaterial.rotation is radians; core is degrees.
                target.rotation = deg(value as number);
                break;
            case "iridescenceThicknessRange":
                target.iridescenceThicknessRange = [...(value as readonly number[])];
                break;
            case "width":
                // Line width. Capped to 1px by most WebGL implementations, but
                // setting it is harmless and correct where supported.
                target.linewidth = value;
                break;
            case "anisotropyRotation":
                target.anisotropyRotation = deg(value as number);
                break;
            default:
                target[FIELD_ALIASES[key] ?? key] = value;
                break;
        }
    }

    if (colorAlphaValue !== undefined && bag.opacity === undefined) {
        material.opacity = colorAlphaValue;
    }

    // ── Blending, derived and latched ────────────────────────────────────────
    // Deliberately outside the `structural` guard and outside the signature.
    // Turning blending on recompiles, and deriving it from a *tweened* opacity
    // would mean recompiling on the frame a fade starts and again on the frame it
    // ends. Latching it — once on, never off — costs one recompile per material
    // for the life of the timeline, and a material that has been transparent
    // costs nothing by staying so.
    const blends = needsBlending(descriptor);
    if (!material.transparent && blends) {
        material.transparent = true;
        material.needsUpdate = true;
    }

    // A blended surface stops writing depth unless told otherwise — the other
    // half of the same decision, and the other flag an author had to remember.
    // three defaults `depthWrite` to true for every material, so a translucent
    // mesh occludes everything drawn after it: a surface at 5% opacity renders
    // as a near-invisible cut-out through whatever is behind it, and only
    // resolves when the fade lands. Every scene that fades a mesh had to pair
    // the two by hand. An explicit `depthWrite` still wins, which is what a
    // deliberately depth-writing translucent surface sets.
    if (bag.depthWrite === undefined) material.depthWrite = !blends;

    // ── Textures ─────────────────────────────────────────────────────────────
    // Adding or removing a map changes the compiled program, so a *presence*
    // change is caught by the signature; here we only swap which texture is bound.
    for (const key of MAP_KEYS) {
        const value = bag[key] as Texture3D | undefined;
        if (value === undefined) continue;
        target[FIELD_ALIASES[key] ?? key] = textures.resolve(
            value, LINEAR_MAP_KEYS.has(key) ? "linear" : "srgb",
        );
    }

    // ── Shader uniforms ──────────────────────────────────────────────────────
    if (descriptor.type === "shader") {
        applyUniforms(three, material as THREE.ShaderMaterial, descriptor.uniforms, textures);
    }

    // ── Escape hatch ─────────────────────────────────────────────────────────
    // Unsafe by construction: we can't know whether a given key needs a
    // recompile, so the reconciler treats any change to `params` as structural
    // and rebuilds. Applied last so it can override anything above.
    if (descriptor.params) {
        for (const key of Object.keys(descriptor.params)) {
            target[key] = descriptor.params[key];
        }
    }

    if (structural) material.needsUpdate = true;
}

function writeNormalScale(three: ThreeModule, target: Record<string, unknown>, value: unknown): void {
    const existing = target.normalScale as THREE.Vector2 | undefined;
    const x = typeof value === "number" ? value : (value as { x: number }).x;
    const y = typeof value === "number" ? value : (value as { y: number }).y;
    if (existing && "set" in existing) existing.set(x, y);
    else target.normalScale = new three.Vector2(x, y);
}

/**
 * Write shader uniform values.
 *
 * Uniform *values* are the cheap path — the whole point of a shader material in an
 * animated scene — so this writes `uniform.value` in place and never touches
 * `needsUpdate`. A uniform appearing or disappearing does need a recompile, and is
 * caught by the signature.
 */
function applyUniforms(
    three: ThreeModule,
    material: THREE.ShaderMaterial,
    uniforms: Readonly<Record<string, Uniform3D>> | undefined,
    textures: TextureResolver,
): void {
    if (!uniforms) return;

    for (const name of Object.keys(uniforms)) {
        const value = coerceUniform(three, uniforms[name], textures);
        const slot = material.uniforms[name];
        if (slot) slot.value = value;
        else material.uniforms[name] = { value };
    }
}

function coerceUniform(three: ThreeModule, value: Uniform3D, textures: TextureResolver): unknown {
    if (typeof value === "number" || typeof value === "boolean") return value;

    // A bare string is either a colour or a texture path. Treat anything that
    // looks like a path as a texture; everything else goes through the colour
    // parser, so `oklch(...)` and theme tokens work in shaders too.
    if (typeof value === "string") {
        return looksLikePath(value) ? textures.resolve(value, "srgb") : makeColor(three, value);
    }

    // A numeric array is read as a GLSL vector, never as a colour — even at length
    // 4, where it would be ambiguous with core's normalized `[r,g,b,a]`. vec4 is
    // overwhelmingly the more likely intent in a shader, and a colour uniform can
    // always be written as a string (`"#ff0000"`, `"oklch(...)"`) to be explicit.
    if (Array.isArray(value)) {
        const components = value as readonly number[];
        switch (components.length) {
            case 2: return new three.Vector2(components[0], components[1]);
            case 3: return new three.Vector3(components[0], components[1], components[2]);
            case 4: return new three.Vector4(components[0], components[1], components[2], components[3]);
            default: return [...components];
        }
    }

    if (typeof value === "object" && value !== null) {
        const bag = value as Record<string, unknown>;
        if ("src" in bag || "data" in bag) return textures.resolve(value as Texture3D, "srgb");
        if ("w" in bag) return new three.Vector4(bag.x as number, bag.y as number, bag.z as number, bag.w as number);
        if ("z" in bag) return new three.Vector3(bag.x as number, bag.y as number, bag.z as number);
        if ("y" in bag) return new three.Vector2(bag.x as number, bag.y as number);
    }

    return value;
}

function looksLikePath(value: string): boolean {
    return value.startsWith("/") || value.startsWith(".") || /\.(png|jpe?g|webp|avif|svg|ktx2?|hdr|exr)$/i.test(value);
}

/**
 * A structural signature for a material descriptor.
 *
 * Includes only what changes the compiled shader program — the type, the
 * structural flags core publishes, which map slots are *present* (not which
 * texture), shader source and uniform *names*, and the passthrough bag. So a
 * colour or roughness tween never invalidates, while flipping `transparent` does.
 */
export function materialSignature(descriptor: Material3D): string {
    const bag = descriptor as unknown as Record<string, unknown>;
    const parts: string[] = [descriptor.type];

    for (const key of STRUCTURAL_MATERIAL_KEYS) {
        const value = bag[key];
        if (value !== undefined) parts.push(`${key}=${JSON.stringify(value)}`);
    }

    // Map *presence* toggles `#define`s, so it is structural; the bound texture is
    // not (swapping one image for another needs no recompile).
    for (const key of MAP_KEYS) {
        if (bag[key] !== undefined) parts.push(`+${key}`);
    }

    if (descriptor.type === "shader") {
        parts.push(`v=${hash(descriptor.vertex)}`, `f=${hash(descriptor.fragment)}`);
        if (descriptor.uniforms) parts.push(`u=${Object.keys(descriptor.uniforms).sort().join(",")}`);
    }

    // Any change to the unsafe passthrough forces a rebuild — we can't know what
    // a given key affects, so the safe assumption is "everything".
    if (descriptor.params) parts.push(`params=${JSON.stringify(descriptor.params)}`);

    return parts.join("|");
}

/** FNV-1a. Cheap and stable — shader sources are long, and this runs per frame. */
function hash(source: string): number {
    let value = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) {
        value ^= source.charCodeAt(i);
        value = Math.imul(value, 0x01000193);
    }
    return value >>> 0;
}

/** Dispose a material and any textures it exclusively owns. */
export function disposeMaterial(material: THREE.Material): void {
    material.dispose();
}
