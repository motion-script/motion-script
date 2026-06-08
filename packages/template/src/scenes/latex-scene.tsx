import { Scene, createRef, wait, Rect } from "@motion-script/core";
import { Latex } from "@motion-script/latex";

export class LatexScene extends Scene {
    *build() {
        this.set({ fill: 'bg', group: 'column', gap: 60 });

        const intro = createRef<Latex>();
        const integral = createRef<Latex>();

        this.add(
            <Rect group={'column'} gap={20} padding={32} fill={'card'} borderRadius={16}>
                <Latex ref={intro} latex="F = ma" fontSize={72} fill={'white'} opacity={0} x={-100} />
                <Rect width={'fill'} height={3} fill={'#4f80ff'} />
                <Latex latex="E = mc^2" fontSize={72} fill={'#4f80ff'} />
            </Rect>
        );

        this.add(
            <Latex
                ref={integral}
                latex="$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$"
                fontSize={64}
                fill={'white'}
                opacity={0}
            />
        );

        yield* intro().to({ opacity: 1, x: 0 }, 0.6);
        yield* wait(0.4);
        yield* intro().to({ latex: 'a^2 + b^2 = c^2' }, 0.5);
        yield* wait(0.4);

        yield* integral().to({ opacity: 1 }, 0.6);
        yield* wait(1);
    }
};
