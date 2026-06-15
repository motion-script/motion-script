/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Camera, Rect, LineGrid, Text, Fills, easeInOutQuad, parallel, wait } from "@motion-script/core";

/**
 * Showcases the {@link Camera} node.
 * The camera pans, zooms, and rotates over a world containing a grid and
 * coloured shapes, demonstrating the viewport transform in action.
 */
export class CameraScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const camRef = createRef<Camera>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'stack'}>
                <Camera
                    ref={camRef}
                    width={'fill'}
                    height={'fill'}
                    zoom={1}
                    centerOn={{ x: 0, y: 0 }}
                    heading={0}
                >
                    {/* World content */}
                    <LineGrid
                        width={3000}
                        height={3000}
                        divisions={10}
                        subdivisions={2}
                        fill={Fills.color('bg')}
                        stroke={{ weight: 2, fill: '#6990DD', opacity: 0.4 }}
                        subStroke={{ weight: 1, fill: '#6990DD', opacity: 0.2 }}
                    />
                    <Rect width={200} height={200} fill={'#6990DD'} cornerRadius={24} x={-400} y={-200} />
                    <Rect width={200} height={200} fill={'#E8617C'} cornerRadius={24} x={300} y={150} />
                    <Rect width={200} height={200} fill={'#F5C26B'} cornerRadius={24} x={-100} y={300} />
                    <Text text={'Camera'} fontSize={80} fontWeight={800} fill={'white'} opacity={0.15} />
                </Camera>
                {/* HUD label */}
                <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={16} alignment={{ x: -1, y: -1 }}>
                    <Text fontFamily={'Pixelify Sans'} text={'Camera'} fontSize={80} fill={'gray'} />
                </Rect>
            </Rect>
        );

        yield* camRef().to({ zoom: 2.5, centerOn: { x: 300, y: 150 } }, 2.0, easeInOutQuad);
        yield* camRef().to({ heading: 20 }, 1.0, easeInOutQuad);
        yield* camRef().to({ centerOn: { x: -400, y: -200 } }, 1.5, easeInOutQuad);
        yield* camRef().to({ zoom: 1, centerOn: { x: 0, y: 0 }, heading: 0 }, 1.8, easeInOutQuad);
        yield* wait(0.5);
    }
}
