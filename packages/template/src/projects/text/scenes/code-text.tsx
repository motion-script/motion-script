

import { createScene, createRef, Rect, Text, wait, easeOut } from "motion-script";
import { Code } from "motion-script";

/**
 * The {@link Code} node is a specialized text renderer with its own
 * syntax-highlighting-aware editing API: `append`/`prepend` type code in at
 * either end, and `insert` splices new code at a (line, col) position with
 * the surrounding lines reflowing around it.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const code = createRef<Code>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={'Code — typing & insert'} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                <Code
                    ref={code}
                    theme={'github-dark'}
                    language={'typescript'}
                    code={''}
                    fontSize={48}
                    showLineNumbers={true}
                />
            </Rect>
        </Rect>
    );

    yield* wait(0.3);

    yield* code().append('function add(a: number, b: number) {\n  return a + b;\n}', 1.8);
    yield* wait(0.5);

    // Splice a guard clause in at the top of the function body.
    yield* code().insert([2, 3], 'if (a < 0) return b;\n  ', 1, easeOut('quad'));
    yield* wait(0.5);

    yield* code().prepend('// add two numbers safely\n', 1);
    yield* wait(1);
});
