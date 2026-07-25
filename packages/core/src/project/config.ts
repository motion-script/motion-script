import { Size2D } from "@/attributes/layout/size";
import { Color } from "@/attributes/shape/fill/color/parser";
import { Scene } from "@/nodes/scene/scene-node";
import type { TextDefaults } from "@/runtime/builtin-context";

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
export type TypographyPreset = TextDefaults;

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
    }
}
