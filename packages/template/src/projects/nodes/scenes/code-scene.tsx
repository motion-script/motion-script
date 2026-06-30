

import { createScene, createRef, Rect, wait } from "motion-script";
import { Code, lines } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Code} node.
 * A syntax-highlighted TypeScript snippet, with {@link Code.highlight} used
 * to draw focus to a single line and then release it.
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
                            code={`function total(items: number[]) {
  const sum = items.reduce((a, b) => a + b, 0);
  return sum;
}`}
                        />
                    </Rect>
                ),
            })
        );

        yield* wait(0.6);
        yield* code().highlight(lines(2), 0.6);
        yield* wait(1.1);
        yield* code().resetHighlight(0.6);
        yield* wait(0.4);
});
