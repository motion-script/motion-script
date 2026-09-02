import { createRef, Rect } from 'motion-script';
import { scene } from './_chain';
import { Code } from '@/components/code';
import { holdTail } from './_lib';

/** {@link Code.showLineNumbers}: a gutter of line numbers appears alongside the snippet. */
export default scene((stage) => {
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
    code().set({ showLineNumbers: true });
}, [
    0.5,
    holdTail(0.5),
]);
