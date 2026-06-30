import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Code.append}: a new line is typed onto the end of an existing snippet. */
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
                    fontSize={18}
                    code={`function greet(name: string) {
  console.log(\`Hello, \${name}!\`);
}`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    yield* code().append('\ngreet("world");', 0.8);
    yield* holdTail(1.3);
});
