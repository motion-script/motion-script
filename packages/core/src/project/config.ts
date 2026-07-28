import { Size2D } from "@/attributes/layout/size";
import { Color } from "@/attributes/shape/fill/color/parser";
import { Scene } from "@/nodes/scene/scene-node";
import { Node } from "@/nodes/base/node";
import type { AudioFilter } from "@/attributes/audio/filters/chain";
import type { TextStyle } from "@/runtime/builtin-context";

/** A color token: a resolvable {@link Color}, or a nested group of them. Groups
 *  flatten to dash-joined names — `{ brand: { 500: … } }` → `brand-500`. */
export type ColorToken = Color | ColorGroup;
export interface ColorGroup { [key: string]: ColorToken; }

/** Named color tokens, possibly nested into groups. Referenced by their
 *  (flattened) name in any `fill`/`stroke` string. */
export type ColorTokens = Record<string, ColorToken>;

/** A named text-style preset referenced by a `Text`/`RichText` `variant` prop.
 *  Each field it sets supplies that style key to a variant'd node (unless the
 *  author set it explicitly). Same shape as the `<DefaultTextStyle>` defaults. */
export type TypographyPreset = TextStyle;

/** Named typography presets, keyed by variant name (e.g. `header`, `body`).
 *  The `default` key is reserved: if present, it's applied to every `Text`/
 *  `RichText` as a project-wide base style — no `variant` prop or
 *  `<DefaultTextStyle>` wrapper needed — for any style key a more specific
 *  source (explicit prop, `variant`, inherited `<DefaultTextStyle>`) doesn't
 *  set. Declared as an explicit property (rather than folded into the index
 *  signature) so editors offer it in autocomplete. */
export type Typography = { default?: TypographyPreset } & Record<string, TypographyPreset>;

/** Flat, arbitrary project constants (corner radii, durations, counts, flags, …),
 *  keyed by name. Keys are flat — no nesting; author dash-names them directly
 *  (e.g. `'rounded-sm'`). Values may be any type. Read in a scene generator via
 *  `stage.variables(...)`. Distinct from {@link Theme}, which is purely visual. */
export type Variables = Record<string, unknown>;

/**
 * A project-wide audio bed: a clip laid straight onto the **project** timeline
 * rather than authored inside a scene, so it plays across scene cuts.
 *
 * Placement and cropping are separate concerns:
 * - `startAt` is *when on the project timeline* the clip begins (scene cuts are
 *   irrelevant to it);
 * - `trimStart`/`trimEnd` are the in/out points *inside the source file*.
 *
 * The clip runs until its (trimmed) source ends or the project does, whichever
 * comes first — a bed never extends the project's duration. `loop: true` makes
 * it repeat until the project ends instead of stopping at the source's end.
 */
export interface AudioTrack {
    /** Path/URL of the audio (or video) asset. Must exist in the asset manifest. */
    src: string;
    /** Second on the **project** timeline at which the clip starts. Defaults to 0. */
    startAt?: number;
    /** In-point inside the source file, in seconds. Defaults to 0. */
    trimStart?: number;
    /** Out-point inside the source file, in seconds. Defaults to the source's full length. */
    trimEnd?: number;
    /** Linear gain applied to the clip. Defaults to 1. */
    volume?: number;
    /** Repeat the (trimmed) clip until the project ends. Defaults to false. */
    loop?: boolean;
    /** Audio filters applied to the clip (gain, eq, tremolo, speed, echo). */
    filters?: AudioFilter;
}

/**
 * How a global layer picks the scenes it appears on: a scene `name`, a scene
 * index, or a list mixing both.
 *
 * Names are matched loosely — case and `-`/`_`/`.`/space separators are ignored
 * — so the scene the `?scene` transform names `CrossFade` (from `cross-fade.tsx`)
 * is selected by `'cross-fade'`, `'CrossFade'` or `'cross fade'` alike.
 *
 * Prefer names — an index-based selector shifts meaning when scenes are
 * reordered, or when only a subset is rendered (`ms export --scenes …`).
 */
export type SceneSelector = string | number | ReadonlyArray<string | number>;

/**
 * A node drawn under (`backgrounds`) or over (`overlays`) every scene, plus the
 * optional allow/deny lists that narrow which scenes it appears on.
 */
export interface GlobalLayer {
    /**
     * The layer's content, laid out against the full viewport exactly as if it
     * had been `stage.add(...)`ed to a scene.
     *
     * Prefer a **factory** (`() => <Watermark/>`): the project module is
     * evaluated before the runtime registers `theme`, so a node constructed
     * inline at module scope resolves theme tokens (`fill="brand-500"`,
     * `variant="header"`) against an empty registry. The runtime calls a factory
     * after registration, so tokens resolve.
     */
    node: Node | (() => Node);
    /** Scenes this layer appears on. Omitted → every scene. */
    include?: SceneSelector;
    /** Scenes this layer is suppressed on. Applied after {@link include}. */
    exclude?: SceneSelector;
}

/** A {@link GlobalLayer}, or just its content when it applies to every scene. */
export type GlobalLayerConfig = GlobalLayer | Node | (() => Node);

/** Project theme: the visual design tokens — color tokens and typography presets. */
export interface Theme {
    /** Named color tokens (possibly grouped) for `fill`/`stroke` strings. */
    colors?: ColorTokens;
    /** Named text-style presets selected via a `Text`/`RichText` `variant`. */
    typography?: Typography;
}

/** Top-level project definition passed to the runtime and player. */
export interface ProjectConfig {
    /** Human-readable project name shown in the player UI. */
    name: string;
    /** Ordered list of scenes that make up the project. */
    scenes: Scene[];
    /** Output canvas dimensions in pixels. Defaults to 1920×1080. */
    viewport: Size2D;
    /** Target frame rate. Defaults to 60 fps. */
    fps: number;
    /** Visual design tokens (colors, typography) available to all scenes. */
    theme?: Theme;
    /** Arbitrary project constants read in scene generators via `stage.variables(...)`. */
    variables?: Variables;
    /**
     * Audio beds laid on the **project** timeline, independent of any scene —
     * a music track or room tone that plays straight through the cuts. See
     * {@link AudioTrack}.
     */
    audioTracks?: AudioTrack[];
    /**
     * Nodes drawn **over** every scene (after the scene's own children and
     * `overlay` fill), outside its camera transform — watermarks, letterboxing,
     * a grain pass. Narrow them to specific scenes with {@link GlobalLayer}'s
     * `include`/`exclude`.
     */
    overlays?: GlobalLayerConfig[];
    /**
     * Nodes drawn **under** every scene. A scene paints its own `fill` on top of
     * these, so a background is only visible where that fill is absent (the
     * default) or translucent. Same `include`/`exclude` filtering as
     * {@link ProjectConfig.overlays}.
     */
    backgrounds?: GlobalLayerConfig[];
}

/**
 * Creates a `ProjectConfig` with sensible defaults.
 * Only `name` is required; all other fields fall back to standard values.
 */
export function createProject(props: Partial<ProjectConfig> & { name: string }): ProjectConfig {
    return {
        name: props.name,
        fps: props.fps ?? 60,
        viewport: props.viewport ?? { width: 1920, height: 1080 },
        scenes: props.scenes ?? [],
        theme: props.theme,
        variables: props.variables,
        audioTracks: props.audioTracks,
        overlays: props.overlays,
        backgrounds: props.backgrounds,
    }
}
