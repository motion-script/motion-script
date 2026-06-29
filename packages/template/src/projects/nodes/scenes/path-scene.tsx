/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Path, Rect, easeInOut, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Path} node.
 * Three SVG paths with `end` animated from 0→1 to draw them on.
 * Left: a triangle. Center: a wave. Right: a heart.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const triRef = createRef<Path>();
    const waveRef = createRef<Path>();
    const catRef = createRef<Path>();

    stage.add(
        nodeCard({
            label: 'Path',
            stage: 'row',
            gap: 64,
            children: (
                <>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <Path
                            ref={triRef}
                            data={'M 0 -100 L 87 50 L -87 50 Z'}
                            fill={'#6990DD'}
                            end={0}
                        />
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <Path
                            ref={waveRef}
                            data={'M -120 0 C -80 -80 -40 80 0 0 C 40 -80 80 80 120 0'}
                            stroke={{ fill: '#F5C26B', weight: 8 }}
                            end={0}
                        />
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <Path
                            ref={catRef}
                            fill={'blue'}
                            data={'M 151.34904,307.20455 L 264.34904,307.20455 C 264.34904,291.14096 263.2021,287.95455 236.59904,287.95455 C 240.84904,275.20455 258.12424,244.35808 267.72404,244.35808 C 276.21707,244.35808 286.34904,244.82592 286.34904,264.20455 C 286.34904,286.20455 323.37171,321.67547 332.34904,307.20455 C 345.72769,285.63897 309.34904,292.21514 309.34904,240.20455 C 309.34904,169.05135 350.87417,179.18071 350.87417,139.20455 C 350.87417,119.20455 345.34904,116.50374 345.34904,102.20455 C 345.34904,83.30695 361.99717,84.403577 358.75805,68.734879 C 356.52061,57.911656 354.76962,49.23199 353.46516,36.143889 C 352.53959,26.857305 352.24452,16.959398 342.59855,17.357382 C 331.26505,17.824992 326.96549,37.77419 309.34904,39.204549 C 291.76851,40.631991 276.77834,24.238028 269.97404,26.579549 C 263.22709,28.901334 265.34904,47.204549 269.34904,60.204549 C 275.63588,80.636771 289.34904,107.20455 264.34904,111.20455 C 239.34904,115.20455 196.34904,119.20455 165.34904,160.20455 C 134.34904,201.20455 135.49342,249.3212 123.34904,264.20455 C 82.590696,314.15529 40.823919,293.64625 40.823919,335.20455 C 40.823919,353.81019 72.349045,367.20455 77.349045,361.20455 C 82.349045,355.20455 34.863764,337.32587 87.995492,316.20455 C 133.38711,298.16014 137.43914,294.47663 151.34904,307.20455 z'}
                            stroke={{ weight: 8, fill: '#E8617C/50', align: 'outside', dash: 10 }}
                            end={0}
                        />
                    </Rect>
                </>
            ),
        })
    );

    yield* parallel(
        triRef().to({ end: 1 }, 1.2, easeInOut('quad')),
        waveRef().to({ end: 1 }, 1.6, easeInOut('quad')),
        catRef().to({ end: 1 }, 1.4, easeInOut('quad')),
    );
    yield* wait(0.8);
    yield* parallel(
        triRef().to({ end: 0 }, 1.0, easeInOut('quad')),
        waveRef().to({ end: 0 }, 1.2, easeInOut('quad')),
        catRef().to({ end: 0 }, 1.0, easeInOut('quad')),
    );
    yield* wait(0.3);
});
