import { Scene, createRef, Ellipse, FX, Text, Rect, wait } from "@motion-script/core";

export class SignalScene extends Scene {
    *build() {
        this.set({ fill: "bg" })
        const rect = createRef<Rect>();

        this.add(
            <>
                <Rect
                    ref={rect}
                    width={600}
                    height={300}
                    rotation={0}

                    fill={'#1F2129'}
                />
                <Rect
                    width={160}
                    height={160}
                    fill={'#4ac27e'}
                    rotation={() => rect().rotation}
                    // Try changing "right" to "top"
                    rightCenter={() => rect().leftCenter}
                />
                <Rect
                    width={300}
                    height={300}
                    fill={'#e13238'}
                    rotation={10}
                    bottomLeft={() => rect().bottomRight}
                />
            </>,
        );

        yield* rect().to({ rotation: 10 }, 2).to({ rotation: -10 }, 2);
        yield* wait(0.5);

    }
};
