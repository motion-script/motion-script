import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code, lines } from '@/components/code';
import { holdTail } from './_lib';

/** {@link Code.replace}: an entire line swaps for a different implementation. */
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
                    code={`function double(n: number) {
  return n + n;
}`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    yield* code().replace(lines(2), '  return n * 2;', 0.7);
    yield* holdTail(1.2);
});
