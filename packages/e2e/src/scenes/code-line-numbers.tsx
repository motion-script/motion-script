import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Code.showLineNumbers}: a gutter of line numbers appears alongside the snippet. */
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
                    showLineNumbers={false}
                    code={`type Point = { x: number; y: number };

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    code().set({ showLineNumbers: true });
    yield* holdTail(0.5);
});
