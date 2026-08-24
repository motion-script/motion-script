import { createScene, createRef, Rect, wait } from 'motion-script';
import { Code, lines } from '@/components/code';
import { holdTail } from './_lib';

/** Code node rendered with the github-dark theme; highlights a line mid-scene. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const code = createRef<Code>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect cornerRadius={16} fill={'#0d1117'} height={'hug'} width={'hug'} clip={true}>
                <Code
                    ref={code}
                    theme={'github-dark'}
                    language={'typescript'}
                    padding={{ horizontal: 48, vertical: 36 }}
                    fontSize={20}
                    code={`// fetch a user record
const user = await db.find(42);
return user?.name ?? "guest";`}
                />
            </Rect>
        </Rect>,
    );

    yield* wait(0.4);
    yield* code().highlight(lines(2), 0.6);
    yield* holdTail(1.0);
});
