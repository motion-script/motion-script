import { createRef, Rect } from 'motion-script';
import { scene } from './_chain';
import { Code } from '@/components/code';
import { lines } from '@motion-script/code';
import { holdTail } from './_lib';

/** Code node rendered with the github-light theme; highlights a line mid-scene. */
const code = createRef<Code>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect cornerRadius={16} fill={'#ffffff'} height={'hug'} width={'hug'} clip={true}>
                <Code
                    ref={code}
                    theme={'github-light'}
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
}, [
    0.4,
    () => code().highlight(lines(2), 0.6),
    holdTail(1.0),
]);
