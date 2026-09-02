import { createRef, Rect } from 'motion-script';
import { scene } from './_chain';
import { Code } from '@/components/code';
import { holdTail } from './_lib';

/** {@link Code.append}: a new line is typed onto the end of an existing snippet. */
const code = createRef<Code>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect cornerRadius={16} fill={'#0f121a'} height={'hug'} width={'hug'} clip={true}>
                <Code
                    ref={code}
                    theme={'vscode-dark'}
                    language={'typescript'}
                    padding={{ horizontal: 48, vertical: 36 }}
                    fontSize={18}
                    code={`function greet(name: string) {
  console.log(\`Hello, \${name}!\`);
}`}
                />
            </Rect>
        </Rect>,
    );
}, [
    0.5,
    () => code().append('\ngreet("world");', 0.8),
    holdTail(1.3),
]);
