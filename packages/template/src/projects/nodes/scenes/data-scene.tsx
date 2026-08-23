

import {
    createScene,
    createRef,
    createContext,
    Context,
    ContextMap,
    Node2D,
    Node2DProps,
    Provider,
    DefaultTextStyle,
    Rect,
    Column,
    Text,
    easeInOut,
    wait,
} from "motion-script";
import { nodeCard } from "./node-card";

/** One row of the stat readout the custom node builds from context. */
interface Stat {
    label: string;
    value: string;
    color: string;
}

/**
 * A typed context token — the same primitive `createContext` gives for any data.
 * A `<Provider>` above supplies the list of stats; the `<StatBoard>` below reads
 * it in `resolveContext`, without the scene threading it in as a prop.
 */
const StatsContext: Context<Stat[]> = createContext<Stat[]>([], "stats");

/**
 * A custom composite node that draws nothing itself — it **pulls its data down
 * the tree**. Here the *structure* (how many tiles) is itself a context value, so
 * the tiles can't be built in the constructor (context isn't resolved yet). They
 * are built once in {@link Node2D.resolveContext}, the hook that runs after the node
 * is linked in and its ancestors' providers are resolved — it fires exactly once
 * per instance, so there's no accumulation and no `clearChildren`.
 *
 * Style flows the same way: the scene also wraps this board in a
 * `<DefaultTextStyle>`, and each `Text` inherits the font through the built-in
 * text-style context. The scene never hands the board its data directly; the
 * `<Provider>` and `<DefaultTextStyle>` ancestors do.
 */
class StatBoard extends Node2D<Node2DProps> {
    protected override resolveContext(ctx: ContextMap): void {
        const stats = ctx.get(StatsContext);

        this.add(
            <Column gap={24} align={{ x: -1, y: 0 }}>
                {stats.map((stat) => (
                    <Rect
                        width={520}
                        height={110}
                        fill={'card'}
                        cornerRadius={20}
                        flow={'horizontal'}
                        gap={28}
                        padding={{ horizontal: 36 }}
                        align={{ x: -1, y: 0 }}
                    >
                        <Rect width={20} height={64} fill={stat.color} cornerRadius={10} />
                        {/* No font props here — every Text inherits them from the
                            DefaultTextStyle the scene wraps this board in. */}
                        <Text text={stat.label} fill={'gray'} width={'fill'} textAlign={'start'} />
                        <Text text={stat.value} fill={stat.color} textAlign={'end'} />
                    </Rect>
                ))}
            </Column>
        );
    }
}

/**
 * Showcases **passing data through nodes via context** — the same idea as React's
 * `createContext`/`useContext`, resolved over the scene-node tree:
 *
 * 1. **Data via a Provider** — a `<Provider>` supplies the list of stats to
 *    {@link StatsContext}; the custom `<StatBoard>` reads it in `resolveContext`
 *    (never taking it as a prop) and builds one tile per stat. The scene wires the
 *    data in one place and the board picks it up down the tree.
 *
 * 2. **Style via a DefaultTextStyle** — one `<DefaultTextStyle>` sets `fontFamily`/
 *    `fontSize`/`fontWeight` once, and every `Text` beneath it inherits those props.
 *    The tiles' labels/values declare no font of their own yet render styled,
 *    because the default flows down the tree as a context value too.
 *
 * Both channels are resolved once, before the first frame — for wiring data in, not
 * per-frame animation. The visible motion here is a plain `to()` on the board itself.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const stats: Stat[] = [
        { label: 'Nodes', value: '1,204', color: '#6990DD' },
        { label: 'Frames', value: '3,600', color: '#E8617C' },
        { label: 'Scenes', value: '22', color: '#F5C26B' },
    ];

    const boardRef = createRef<StatBoard>();

    stage.add(
        nodeCard({
            label: 'Data',
            stage: 'freeform',
            children: (
                // Provider pushes the stats down; DefaultTextStyle pushes the shared
                // font down. StatBoard, nested below both, reads the data in
                // resolveContext and its Texts inherit the style.
                <Provider context={StatsContext} value={stats}>
                    <DefaultTextStyle
                        fontFamily={'Pixelify Sans'}
                        fontSize={44}
                        fontWeight={700}
                    >
                        <StatBoard ref={boardRef} opacity={0} y={-40} />
                    </DefaultTextStyle>
                </Provider>
            ),
        })
    );

    // Reveal the data-driven, style-inheriting board.
    yield* wait(0.3);
    yield* boardRef().to({ opacity: 1, y: 0 }, 0.9, easeInOut('quad'));
    yield* wait(0.6);
});
