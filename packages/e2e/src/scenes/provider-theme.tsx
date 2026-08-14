import { createScene, ThemeProvider, Rect, Text, wait } from 'motion-script';
import { holdTail } from './_lib';

/** {@link ThemeProvider} merging custom color tokens onto the ambient theme: descendants referencing `'brand'`/`'brandText'` by name resolve to the values supplied here rather than the project's default theme. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    stage.add(
        <ThemeProvider theme={{ brand: '#ff6a3d', brandText: '#1a0d08' }}>
            <Rect width={360} height={220} cornerRadius={24} fill={'brand'} flow={'freeform'} align={{ x: 0, y: 0 }}>
                <Text text={'Custom Theme'} fontFamily={'Inter'} fontWeight={800} fontSize={40} fill={'brandText'} />
            </Rect>
        </ThemeProvider>,
    );

    yield* wait(1.2);
    yield* holdTail(1.2);
});
