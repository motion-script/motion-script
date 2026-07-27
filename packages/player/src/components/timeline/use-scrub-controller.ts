import { useCallback, useEffect, useMemo, useRef } from "react";

import { useEditorStore, useEditorStoreApi } from "@/providers/editor-provider";

/**
 * Seek cost (ms) a project gets "for free" — below this the drag commits every
 * animation frame with no added delay, so a light project scrubs instantly.
 */
const FREE_BUDGET_MS = 40;
/** Ceiling on the adaptive cooldown, so the preview never feels abandoned. */
const MAX_COOLDOWN_MS = 200;
/** Weight of the newest sample in the seek-duration EWMA. */
const ALPHA = 0.3;

export type ScrubController = {
    /** Begin a drag at `clientX` (pointerdown on the ruler). */
    begin(clientX: number): void;
    /** Raw pointermove — coalesced to one update per animation frame internally. */
    move(clientX: number): void;
    /** End the drag, committing the exact frame under `clientX`. */
    end(clientX: number): void;
};

/**
 * Drives timeline scrubbing so a fast drag can't outrun the renderer.
 *
 * A backward seek is expensive: the engine resets the scene and replays it from
 * its first frame. Committing one per pointer move queues dozens of those, and
 * the UI freezes. Three things prevent that:
 *
 * 1. **rAF coalescing** — pointermove fires far faster than anything can be
 *    drawn, so only the newest position each frame is considered.
 * 2. **A latest-wins in-flight gate** — a new seek is issued only once the
 *    previous one has settled, so seeks can never queue up.
 * 3. **An adaptive cooldown** — the gate alone would still keep the main thread
 *    ~100% busy on a heavy project, starving the animation frames that move the
 *    playhead. Sized from a rolling average of real seek durations, it leaves
 *    the thread idle in proportion to how slow this project actually is, and
 *    stays at zero for projects fast enough not to need it.
 *
 * Throughout, the visual playhead (`scrubFrame`) keeps tracking the pointer at
 * full rate — only the rendered frame lags.
 *
 * The caller drives this from pointer-capture events rather than window
 * listeners (see the ruler's seek overlay). Capture guarantees every move and
 * the final up land on the same element no matter where the cursor goes, so the
 * drag can't be orphaned mid-way and leave the playhead pinned to a stale
 * `scrubFrame`.
 */
export function useScrubController(clientXToFrame: (clientX: number) => number): ScrubController {
    const storeApi = useEditorStoreApi();
    const beginScrub = useEditorStore(s => s.beginScrub);
    const updateScrub = useEditorStore(s => s.updateScrub);
    const endScrub = useEditorStore(s => s.endScrub);
    const setCurrentFrame = useEditorStore(s => s.setCurrentFrame);

    /** Latest pointer position, read on the next animation frame. */
    const pendingXRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const draggingRef = useRef(false);
    /** A commit was issued and hasn't settled yet. */
    const inFlightRef = useRef(false);
    /** When the in-flight commit started, for the duration sample. */
    const commitStartRef = useRef(0);
    /** Last frame handed to the renderer, so we don't re-commit the same one. */
    const committedRef = useRef<number | null>(null);
    /** Wall-clock of the last commit, for the cooldown. */
    const lastCommitAtRef = useRef(0);
    /** EWMA of recent seek durations (ms); 0 until the first sample. */
    const seekMsRef = useRef(0);
    /** Newest frame the pointer has reached, awaiting commit. */
    const pendingFrameRef = useRef<number | null>(null);

    // `clientXToFrame` closes over layout state that changes every render; hold
    // it in a ref so the drag always converts against the current geometry
    // without the callbacks below churning identity.
    const toFrameRef = useRef(clientXToFrame);
    useEffect(() => { toFrameRef.current = clientXToFrame; });

    const cooldownMs = () => {
        if (seekMsRef.current <= 0) return 0;
        return Math.max(0, Math.min(MAX_COOLDOWN_MS, seekMsRef.current - FREE_BUDGET_MS));
    };

    /** Issue a seek for `frame` if the gate and cooldown allow it right now. */
    const tryCommit = useCallback((frame: number) => {
        if (inFlightRef.current) return;
        if (committedRef.current === frame) return;
        if (performance.now() - lastCommitAtRef.current < cooldownMs()) return;
        inFlightRef.current = true;
        commitStartRef.current = performance.now();
        lastCommitAtRef.current = commitStartRef.current;
        committedRef.current = frame;
        setCurrentFrame(frame);
    }, [setCurrentFrame]);

    // Watch `isSeeking` for the settle edge. Subscribing imperatively rather than
    // selecting it keeps this component from re-rendering on every seek.
    useEffect(() => {
        let wasSeeking = storeApi.getState().isSeeking;
        return storeApi.subscribe((state) => {
            const seeking = state.isSeeking;
            if (wasSeeking === seeking) return;
            wasSeeking = seeking;
            if (seeking || !inFlightRef.current) return;

            // Settled: fold the observed cost into the average, then take the
            // newest pending position if the pointer has moved on since.
            const elapsed = performance.now() - commitStartRef.current;
            seekMsRef.current = seekMsRef.current === 0
                ? elapsed
                : ALPHA * elapsed + (1 - ALPHA) * seekMsRef.current;
            inFlightRef.current = false;

            if (!draggingRef.current) return;
            const pending = pendingFrameRef.current;
            if (pending !== null) tryCommit(pending);
        });
    }, [storeApi, tryCommit]);

    /** One animation frame's worth of drag: move the playhead, maybe commit. */
    const flush = useCallback(() => {
        rafRef.current = null;
        if (!draggingRef.current) return;
        // Convert here, not in the pointermove handler: clientXToFrame reads
        // getBoundingClientRect(), and doing that per raw event thrashes layout.
        const frame = toFrameRef.current(pendingXRef.current);
        pendingFrameRef.current = frame;
        updateScrub(frame);
        tryCommit(frame);
    }, [updateScrub, tryCommit]);

    const begin = useCallback((clientX: number) => {
        const frame = toFrameRef.current(clientX);
        draggingRef.current = true;
        pendingXRef.current = clientX;
        pendingFrameRef.current = frame;
        committedRef.current = null;
        inFlightRef.current = false;
        beginScrub(frame);
        tryCommit(frame);
    }, [beginScrub, tryCommit]);

    const move = useCallback((clientX: number) => {
        if (!draggingRef.current) return;
        pendingXRef.current = clientX;
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
    }, [flush]);

    const end = useCallback((clientX: number) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        // The final position is committed unconditionally — no gate, no cooldown.
        // You must always land exactly where you dropped the playhead, and the
        // engine's interruptible seek is what makes that last one cheap.
        const frame = toFrameRef.current(clientX);
        pendingFrameRef.current = null;
        committedRef.current = frame;
        inFlightRef.current = false;
        endScrub(frame);
    }, [endScrub]);

    useEffect(() => () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }, []);

    return useMemo(() => ({ begin, move, end }), [begin, move, end]);
}
