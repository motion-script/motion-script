import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { Code } from '@/components/code';
import { holdTail } from './_lib';

/** {@link Code.padding}: the inset between the code text and its frame growing from tight to spacious. */
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
                    padding={{ horizontal: 12, vertical: 12 }}
                    fontSize={18}
                    code={'const ready = true;'}
                />
            </Rect>
        </Rect>,
    );

    yield* code().to({ padding: { horizontal: 80, vertical: 64 } }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
