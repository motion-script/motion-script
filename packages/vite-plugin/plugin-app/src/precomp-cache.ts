import storedEntries from '~precomp-cache'
import {
    deserializeScenePrecomp,
    serializeScenePrecomp,
    type PrecompCache,
    type ScenePrecomp,
} from '@motion-script/core'

/**
 * The browser half of the dev server's precomp cache.
 *
 * Measuring a scene means driving its generator to completion — for a ten-minute
 * project that is tens of thousands of frames, redone on every page load, and it
 * yields the identical answer each time. The plugin persists finished passes to
 * `<project>/.motion-script/precomp.json` and hands back, through the
 * `~precomp-cache` virtual module, only the ones whose recorded source
 * dependencies still hash the same.
 *
 * So there is deliberately no validity logic here: everything this module
 * receives has already been checked in Node, where the file hashes live. Its only
 * jobs are to revive entries and to report new ones.
 */

/** Where the plugin listens for finished passes. Must match `PRECOMP_ENDPOINT`. */
const ENDPOINT = '/__motion-script/precomp'

export function createDevPrecompCache(): PrecompCache {
    // Revived lazily and memoized: a project may hold entries for scenes this
    // session never reaches, and parsing those would be wasted work on startup.
    const revived = new Map<string, ScenePrecomp | null>()

    return {
        get(sceneKey: string): ScenePrecomp | undefined {
            if (revived.has(sceneKey)) return revived.get(sceneKey) ?? undefined

            const raw = (storedEntries as Record<string, unknown>)[sceneKey]
            // `deserializeScenePrecomp` validates every field and returns null for
            // anything malformed, so a corrupt or hand-edited file costs one
            // measurement rather than producing a plausible-but-wrong timeline.
            const entry = raw === undefined ? null : deserializeScenePrecomp(raw)
            revived.set(sceneKey, entry)
            return entry ?? undefined
        },

        put(sceneKey: string, precomp: ScenePrecomp): void {
            // Returns null when the pass holds something that cannot round-trip
            // (a loader's live closure, a curve-valued audio filter). Not an
            // error — that scene just measures every time.
            const wire = serializeScenePrecomp(precomp)
            if (!wire) return

            revived.set(sceneKey, precomp)
            // Fire-and-forget: persisting is an optimization for the *next* run and
            // must never delay or fail this one. A dev server that isn't listening
            // (a production build of the player, say) simply gets a rejected fetch.
            void fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sceneId: sceneKey, precomp: wire }),
            }).catch(() => { })
        },
    }
}
