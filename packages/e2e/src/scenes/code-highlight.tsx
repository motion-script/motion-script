import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code, lines } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Code.highlight}: the rest of the snippet dims so a single line stands out. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const code = createRef<Code>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect cornerRadius={16} fill={'#0f121a'} height={'hug'} width={'hug'} clip={true}>
                <Code
                    ref={code}
                    theme={'vscode-dark'}
                    language={'typescript'}
                    padding={{ horizontal: 48, vertical: 36 }}
                    fontSize={18}
                    code={`function total(items: number[]) {
  const sum = items.reduce((a, b) => a + b, 0);
  return sum;
}`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    yield* code().highlight(lines(2), 0.6);
    yield* holdTail(1.1);
});
