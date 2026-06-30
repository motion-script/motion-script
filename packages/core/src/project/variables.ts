/**
 * Project variables registry — arbitrary, flat project constants (corner radii,
 * durations, counts, feature flags, …) read in scene generators via
 * `stage.variables(...)`.
 *
 * These are distinct from the visual {@link Theme} (colors, typography): they
 * have no string-resolution channel of their own, so a generator reads them
 * explicitly. Like the color/typography registries, the map lives on a
 * `globalThis` key so multiple bundled copies of this module (the prebuilt
 * player bundle and the user's Vite-compiled code) share one registry —
 * {@link setVariables} (called once per build at the player/headless entry
 * points) populates it before any scene generator runs.
 */

const _g = globalThis as Record<string, unknown>;
if (!_g.__msVariablesMap) _g.__msVariablesMap = new Map<string, unknown>();
const VARIABLES_MAP = _g.__msVariablesMap as Map<string, unknown>;

/**
 * Register the project's variables, keyed by their (lowercased) name. Call with
 * no argument (or an empty object) to clear the registry.
 */
/** @internal */
export function setVariables(variables: Record<string, unknown> = {}): void {
    VARIABLES_MAP.clear();
    for (const [key, value] of Object.entries(variables)) {
        VARIABLES_MAP.set(key.toLowerCase(), value);
    }
}

/**
 * @internal
 * Looks up a registered variable by name (case-insensitive); `undefined` if
 * none is registered. Backs `stage.variables(...)`.
 */
export function getVariable(key: string): unknown {
    return VARIABLES_MAP.get(key.toLowerCase());
}
