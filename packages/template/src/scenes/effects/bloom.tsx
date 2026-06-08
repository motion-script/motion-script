/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Ellipse, Text, FX, easeOutQuart, parallel, wait } from "@motion-script/core";

export class BloomScene extends Scene {
    *build() {
        this.set({ fill: "#060810" });

        const orb1 = createRef<Ellipse>();
        const orb2 = createRef<Ellipse>();
        const orb3 = createRef<Ellipse>();
        const label = createRef<Text>();

        this.add(<>
            <Ellipse ref={orb1} x={-260} width={180} height={180} fill="#ff4d6d" effects={FX.bloom(0.55, 30, 0)} />
            <Ellipse ref={orb2} x={0} y={-60} width={220} height={220} fill="#a29bfe" effects={FX.bloom(0.55, 30, 0)} />
            <Ellipse ref={orb3} x={260} width={160} height={160} fill="#00cec9" effects={FX.bloom(0.55, 30, 0)} />
            <Text ref={label} y={-300} text="BLOOM" fontSize={96} fontWeight={800} fill="#ffffff" letterSpacing={24} opacity={0} effects={FX.bloom(0.6, 20, 0)} />
        </>);

        yield* parallel(
            label().to({ opacity: 1, effects: FX.bloom(0.6, 20, 1.5) }, 1.2),
            orb1().to({ effects: FX.bloom(0.55, 60, 2.5) }, 1.6, easeOutQuart),
            orb2().to({ effects: FX.bloom(0.5, 70, 3.0) }, 1.8, easeOutQuart),
            orb3().to({ effects: FX.bloom(0.5, 55, 2.2) }, 1.5, easeOutQuart),
        );

        yield* wait(0.8);

        yield* parallel(
            orb1().to({ effects: FX.bloom(0.75, 15, 0.5) }, 1.0),
            orb2().to({ effects: FX.bloom(0.7, 15, 0.5) }, 1.0),
            orb3().to({ effects: FX.bloom(0.75, 15, 0.5) }, 1.0),
        );

        yield* wait(0.5);
    }
}
