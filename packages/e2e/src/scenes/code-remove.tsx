/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, wait } from '@motion-script/core';
import { Code, lines } from '@motion-script/code';
import { holdTail } from './_lib';

/** {@link Code.remove}: a debug line is deleted from the snippet, collapsing the surrounding lines. */
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
                    code={`function process(data: number[]) {
  console.log("debug:", data);
  return data.filter((n) => n > 0);
}`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    yield* code().remove(lines(2), 0.7);
    yield* holdTail(1.2);
});
