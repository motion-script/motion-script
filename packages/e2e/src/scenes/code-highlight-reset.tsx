import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code } from '@/components/code';
import { lines } from '@motion-script/code';
import { holdTail } from './_lib';

/** {@link Code.resetHighlight}: a dimmed highlight restores to full opacity across every line. */
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

    yield* code().highlight(lines(2), 0);
    yield* wait(0.4);
    yield* code().resetHighlight(0.6);
    yield* holdTail(1.0);
});
