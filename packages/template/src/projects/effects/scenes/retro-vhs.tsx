import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "../../../shared/effect-demo";

/**
 * Composed look: the full VHS recipe, now that the glitch cluster exists.
 *
 * Order is the whole trick. The tape damage (`blockDisplace`) has to land
 * before the colour separation, so the torn bands carry their own fringing
 * rather than the fringe being painted over an already-broken image; the
 * scanlines and grain go last because a CRT adds them to whatever it is
 * displaying, however mangled.
 */
export default createScene(effectDemo({
        label: 'Retro VHS',
        from: FX
            .vintage({ amount: 0, warmth: 0 })
            .blockDisplace({ amount: 0, size: 20, density: 0.4, seed: 7 })
            .rgbShift(0)
            .scanlines({ darkness: 0, spacing: 5 })
            .grain({ amount: 0, animated: true }),
        to: FX
            .vintage({ amount: 0.5, warmth: -0.2 })
            .blockDisplace({ amount: 40, size: 20, density: 0.4, seed: 7 })
            .rgbShift({ red: { x: 7, y: 0 }, blue: { x: -5, y: 2 } })
            .scanlines({ darkness: 0.55, spacing: 5 })
            .grain({ amount: 0.22, animated: true }),
    }));
