

import { createScene, createRef, Rect, wait } from "motion-script";
import { Code, lines } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Code} node.
 *
 * `to({ code })` is the headline: state the source the listing becomes and the
 * node diffs it against what is on screen — tokens that survived the edit travel
 * to their new columns, what is gone fades first, and only then does what is new
 * arrive. {@link Code.highlight} then draws focus to a single line.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const code = createRef<Code>();

    stage.add(
        nodeCard({
            label: 'Code',
            children: (
                <Rect cornerRadius={16} fill={'#0f121a'} height={'hug'} width={'hug'} clip={true}>
                    <Code
                        ref={code}
                        theme={'vscode-dark'}
                        language={'typescript'}
                        padding={{ horizontal: 48, vertical: 36 }}
                        fontSize={28}
                        showLineNumbers={true}
                        code={`function total(items) {
  let sum = 0;
  for (const item of items) {
    sum += item.price;
  }
  return sum;
}`}
                    />
                </Rect>
            ),
        })
    );

    yield* wait(0.6);
    // `function` and `return sum` stay put; the loop collapses into one line.
    yield* code().to({
        code: `function total(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}`,
    }, 1.4);
    yield* wait(0.8);
    yield* code().highlight(lines(2), 0.6);
    yield* wait(1.1);
    yield* code().resetHighlight(0.6);
    yield* wait(0.4);
});
