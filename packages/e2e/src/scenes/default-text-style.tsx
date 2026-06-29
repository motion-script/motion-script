/** @jsxImportSource @motion-script/core/jsx */

import { createScene, DefaultTextStyle, Rect, Text, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link DefaultTextStyle} setting `fontFamily`/`fill` for every {@link Text} beneath it — descendants that don't set their own font inherit it, while one that overrides `fontFamily` locally keeps its own. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    stage.add(
        <DefaultTextStyle fontFamily={'Inter'} fontWeight={700} fill={'#f4f6ff'}>
            <Rect width={'fill'} height={'fill'} group={'column'} gap={20} align={{ x: 0, y: 0 }}>
                <Text text={'Inherits Inter'} fontSize={42} />
                <Text text={'Also inherits Inter'} fontSize={42} />
                <Text text={'Overrides to Fira Mono'} fontFamily={'Fira Mono'} fontSize={42} />
            </Rect>
        </DefaultTextStyle>,
    );

    yield* wait(1.2);
    yield* holdTail(1.2);
});
