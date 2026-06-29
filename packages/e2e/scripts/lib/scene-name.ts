/**
 * Derive the scene name the headless bridge reports for a given scene id.
 *
 * The ?scene Vite transform names each scene by PascalCasing its filename
 * (packages/vite-plugin/src/scene-transform.ts → sceneNameFromFile). Our scene
 * files are named exactly `<id>.tsx`, so the bridge's `listScenes()` returns the
 * PascalCase of each id. The harness filters by that name (`--scenes <name>`),
 * so this MUST stay byte-for-byte identical to the transform's logic.
 */
export function pascalCase(id: string): string {
    const pascal = id
        .split(/[-_.\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return pascal || 'Scene';
}
