import { Effects as FX } from "motion-script";
import { createScene } from "motion-script";
import { effectDemo } from "./effect-demo";

// `standard` is plain ASCII, so it renders in any Latin font. The `blocks` and
// `braille` ramps look better but need a font that actually covers those
// Unicode ranges — this project registers none, and the effect warns when a
// glyph is missing rather than drawing tofu.
//
// The cell shrinks rather than the effect fading: `ascii` has no neutral
// setting, and a cell under ~2px is skipped, which is the closest it has to off.
export default createScene(effectDemo({
    label: 'ASCII',
    from: FX.ascii({ size: 2, charset: 'standard', ink: '#7dff9b', }),
    to: FX.ascii({ size: 11, charset: 'standard', ink: '#7dff9b', }),
    compare: true,
}));
