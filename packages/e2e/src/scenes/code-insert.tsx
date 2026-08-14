import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Code.insert}: a parameter is typed into the middle of an existing line, not just appended. */
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
                    code={'function greet() {\n  return "hi";\n}'}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    yield* code().insert([1, 15], 'name: string', 0.7);
    yield* holdTail(1.2);
});
