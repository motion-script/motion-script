/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text, FX, easeOutQuart, parallel, wait } from "@motion-script/core";

export class ChromaticAberrationScene extends Scene {
    *build() {
        this.set({ fill: "#0a0a0f" });

        const title = createRef<Text>();
        const box = createRef<Rect>();

        this.add(<>
            <Text ref={title} y={-180} text="IMPACT" fontSize={120} fontWeight={900} fill="#ffffff" letterSpacing={12} effects={FX.chromaticAberration(0, 0)} />
            <Rect ref={box} y={80} width={400} height={400} borderRadius={12}
                fill={{ type: 'linear-gradient', colors: ['#ffffff', '#cccccc'], start: { x: 0, y: -1 }, end: { x: 0, y: 1 } }}
                effects={FX.chromaticAberration(0, 0)}
            />
        </>);
        yield* wait(0.5);
        //throw new Error("This scene is a demo of the chromatic aberration effect. It is not meant to be a polished animation. The code is intentionally verbose to show how the effect can be used.");

        // slam in
        yield* parallel(
            title().to({ effects: FX.chromaticAberration(24, 0) }, 0.06),
            box().to({ effects: FX.chromaticAberration(20, 45) }, 0.06),
        );

        // settle
        yield* parallel(
            title().to({ effects: FX.chromaticAberration(4, 0) }, 0.6, easeOutQuart),
            box().to({ effects: FX.chromaticAberration(3, 45) }, 0.6, easeOutQuart),
        );

        yield* wait(1.0);

        // angle sweep
        yield* parallel(
            title().to({ effects: FX.chromaticAberration(6, 180) }, 1.5),
            box().to({ effects: FX.chromaticAberration(5, 225) }, 1.5),
        );

        yield* wait(0.4);

        // clear
        yield* parallel(
            title().to({ effects: FX.chromaticAberration(0, 0) }, 0.5),
            box().to({ effects: FX.chromaticAberration(0, 0) }, 0.5),
        );

        yield* wait(0.5);
    }
}
