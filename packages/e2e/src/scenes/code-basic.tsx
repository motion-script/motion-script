import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code, lines } from 'motion-script';
import { holdTail } from './_lib';

/** Code node with a TypeScript snippet in the default theme, highlighting a line. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const code = createRef<Code>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect cornerRadius={16} fill={'#0f121a'} height={'hug'} width={'hug'} clip={true}>
                <Code
                    ref={code}
                    theme={'vscode-dark'}
                    language={'typescript'}
                    padding={{ horizontal: 48, vertical: 36 }}
                    fontSize={16}
                    code={`function add(a: number, b: number) {
  return a + b;
}`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    yield* code().highlight(lines(1), 0.6);
    yield* holdTail(1.1);
});
