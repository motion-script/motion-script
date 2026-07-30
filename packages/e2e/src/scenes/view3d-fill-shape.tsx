import { createScene, createRef, createSignal, easeInOut, Ellipse, Graphics3D } from 'motion-script';
import { holdTail } from './_lib';

/**
 * 3D as a *fill*, painted through a non-rectangular path.
 *
 * This is the property that makes 3D composable rather than a special node: the
 * scene is rendered to a texture and used to shade an `Ellipse`'s own path, so it
 * clips to the ellipse and stacks with the other fill layers. A regression in the
 * fill/shader route shows up here and nowhere in `view3d-basic`, which paints
 * through an ordinary rect.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const spin = createSignal(0);
    const shape = createRef<Ellipse>();

    // A bare `Graphics3D` coerces to a view3D fill, the same way a CSS string
    // coerces to a solid one — so the fill prop takes an ordinary reactive
    // binding and re-evaluates when `spin` changes.
    stage.add(
        <Ellipse
            ref={shape}
            width={360}
            height={280}
            // The camera sits close enough that the box overflows the ellipse on
            // every side — otherwise the frame would look identical whether the
            // path clipped or not, and the scene would prove nothing.
            fill={() => new Graphics3D()
                .perspective({ position: [0, 0, 2.6], lookAt: 0, fov: 55 })
                .ambient({ intensity: 0.4 })
                .directional({ intensity: 2.4, position: [2, 4, 3] })
                .box({ width: 2.4, height: 2.4, depth: 2.4, color: '#4f8ef7', rotation: [spin() * 0.5, spin(), 0] })}
        />,
    );

    yield* spin(160, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
