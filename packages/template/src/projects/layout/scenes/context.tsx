import {
    createScene, createRef, createContext, ContextMap, Rect, Text, Provider,
    DefaultTextStyle, easeInOut,
} from "motion-script";
import { layoutCard } from "./layout-card";

/**
 * Demonstrates tree-inherited context — the same idea as React's
 * `createContext`/`useContext`, but resolved over the scene-node tree.
 *
 *  - **`<DefaultTextStyle>`** sets default text styling for the `<Text>` nodes
 *    below it. Each `<Text>` inherits any style prop it didn't set itself
 *    (here `fontFamily` and `fill`), while still overriding per node
 *    (the heading bumps `fontSize`, one row overrides `fill`).
 *
 *  - **`createContext` + `<Provider>`** is the general primitive: a typed token
 *    carries arbitrary author data down the tree. A node reads it in
 *    `resolveContext(ctx)` — the once-per-instance hook that runs after the node
 *    is linked in, so context is resolved (the constructor runs too early). Here a
 *    `LabelColor` token drives the swatch fill of a small custom node, with a
 *    nested `<Provider>` overriding it for one subtree (nearest-ancestor-wins).
 *    `<ThemeProvider>` (not shown) is the batteries-included wrapper over the same
 *    machinery for theme/data/seed.
 */

// A typed context token: the value flowing down is a color string.
const LabelColor = createContext<string>("#888", "label-color");

/** A tiny custom node that paints itself with whatever LabelColor it inherits.
 * A context *value* applied to a fixed structure (a leaf Rect), so it belongs in
 * resolveContext — which runs once, after context is resolved. */
class Swatch extends Rect {
    protected override resolveContext(ctx: ContextMap): void {
        this.fill = ctx.get(LabelColor);
    }
}

export default createScene(function* (stage) {
    stage.set({ fill: "bg" });

    const heading = createRef<Text>();

    stage.add(
        layoutCard({
            label: "DefaultTextStyle",
            stage: "column",
            gap: 20,
            children: (
                // One DefaultTextStyle sets the family + fill for everything below;
                // individual Text nodes only specify what differs.
                <DefaultTextStyle fontFamily={"Pixelify Sans"} height={"fill"} fill={"primary"} fontSize={64}>
                    <Rect width={"fill"} height={"fill"} group={"column"} gap={32} align={"topCenter"}>
                        <Text ref={heading} text={"inherits family + fill"} fontSize={96} />
                        <Text text={"so does this line"} />
                        {/* Nearest-wins: a nested DefaultTextStyle recolors just its subtree. */}
                        <DefaultTextStyle fill={"#F5C26B"}>
                            <Text text={"overridden fill, same family"} />
                        </DefaultTextStyle>

                        {/* Custom typed token: two swatches read LabelColor; the
                            second sits under a Provider that overrides it. */}
                        <Rect width={"fill"} height={200} group={"row"} gap={32} align={"center"}>
                            <Provider context={LabelColor} value={"#6990DD"}>
                                <Swatch width={200} height={200} cornerRadius={24} />
                            </Provider>
                            <Provider context={LabelColor} value={"#E8617C"}>
                                <Swatch width={200} height={200} cornerRadius={24} />
                            </Provider>
                        </Rect>
                    </Rect>
                </DefaultTextStyle>
            ),
        }),
    );

    // The inherited values are live, animatable props on each node like any other.
    yield* heading().to({ fontSize: 120 }, 0.8, easeInOut("quad"))
        .to({ fontSize: 96 }, 0.8, easeInOut("quad"));
});
