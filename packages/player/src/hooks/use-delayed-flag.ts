import { useEffect, useRef, useState } from "react";

/**
 * Hysteresis for a transient busy flag, so brief activity never flashes UI.
 *
 * `active` here flips on and off once per seek, which during a scrub is many
 * times a second — bound directly to an overlay it would strobe. This waits
 * `delayInMs` before reporting true (a seek that finishes sooner is never shown
 * at all) and holds true for at least `minVisibleMs` once shown (so it can't
 * blink out immediately behind a fast one).
 *
 * @param active      The raw flag.
 * @param delayInMs   How long `active` must hold before this reports true.
 * @param minVisibleMs Minimum time to stay true once it has.
 */
export function useDelayedFlag(
    active: boolean,
    delayInMs = 120,
    minVisibleMs = 200,
): boolean {
    const [visible, setVisible] = useState(false);
    const shownAtRef = useRef(0);

    useEffect(() => {
        // Already settled in the requested state — nothing to schedule. Without
        // this the effect would re-arm a timer on its own state update and loop.
        if (active === visible) return;

        if (active) {
            const t = setTimeout(() => {
                shownAtRef.current = performance.now();
                setVisible(true);
            }, delayInMs);
            // Clearing this is what makes a sub-`delayInMs` seek show nothing.
            return () => clearTimeout(t);
        }

        const held = performance.now() - shownAtRef.current;
        const t = setTimeout(() => setVisible(false), Math.max(0, minVisibleMs - held));
        return () => clearTimeout(t);
    }, [active, visible, delayInMs, minVisibleMs]);

    return visible;
}
