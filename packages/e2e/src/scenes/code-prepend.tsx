/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, wait } from '@motion-script/core';
import { Code } from '@motion-script/code';
import { holdTail } from './_lib';

/** {@link Code.prepend}: an import line is typed in above the existing snippet, pushing it down. */
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
                    code={`export function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.5);
    yield* code().prepend('import { clamp as builtin } from "./math";\n\n', 0.8);
    yield* holdTail(1.3);
});
