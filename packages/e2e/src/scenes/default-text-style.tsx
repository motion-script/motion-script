import { DefaultTextStyle, Rect, Text } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link DefaultTextStyle} setting `fontFamily`/`fill` for every {@link Text} beneath it — descendants that don't set their own font inherit it, while one that overrides `fontFamily` locally keeps its own. */
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <DefaultTextStyle fontFamily={'Inter'} fontWeight={700} fill={'#f4f6ff'}>
            <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={20} align={{ x: 0, y: 0 }}>
                <Text text={'Inherits Inter'} fontSize={42} />
                <Text text={'Also inherits Inter'} fontSize={42} />
                <Text text={'Overrides to Fira Mono'} fontFamily={'Fira Mono'} fontSize={42} />
            </Rect>
        </DefaultTextStyle>,
    );
}, [
    1.2,
    holdTail(1.2),
]);
