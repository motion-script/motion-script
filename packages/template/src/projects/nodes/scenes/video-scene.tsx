/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Video, Rect, Text, easeInOut, wait } from "@motion-script/core";

/**
 * Showcases the {@link Video} node.
 * A looping clip fills the frame. The clip is cropped to fit and plays its
 * audio track automatically. Corner radius animates in to demonstrate that
 * Video inherits all Rect layout and corner props.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const videoRef = createRef<Video>();

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'stack'}>
                <Video
                    ref={videoRef}
                    src={'video.mp4'}
                    fit={'fill'}
                    loop={'forward'}
                    muted={true}
                    width={'fill'}
                    height={'fill'}
                    cornerRadius={0}
                    group={'column'}
                    padding={80}
                    align={{ x: -1, y: 1 }}
                >
                    <Text
                        fontFamily={'Pixelify Sans'}
                        text={'Video node'}
                        fontSize={80}
                        fill={'white'}
                        opacity={0.9}
                    />
                </Video>
            </Rect>
        );

        yield* wait(1.0);
        yield* videoRef().to({ cornerRadius: 48 }, 1.2, easeInOut('quad'));
        yield* wait(2.0);
        yield* videoRef().to({ cornerRadius: 0 }, 0.8, easeInOut('quad'));
        yield* wait(0.5);
});
