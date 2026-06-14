/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Video, Rect, Text, easeInOutQuad, wait } from "@motion-script/core";

/**
 * Showcases the {@link Video} node.
 * A looping clip fills the frame. The clip is cropped to fit and plays its
 * audio track automatically. Corner radius animates in to demonstrate that
 * Video inherits all Rect layout and corner props.
 */
export class VideoScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const videoRef = createRef<Video>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'stack'}>
                <Video
                    ref={videoRef}
                    src={'video.mp4'}
                    fit={'crop'}
                    loop={'forward'}
                    muted={true}
                    width={'fill'}
                    height={'fill'}
                    cornerRadius={0}
                    group={'column'}
                    padding={80}
                    alignment={{ x: -1, y: 1 }}
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
        yield* videoRef().to({ cornerRadius: 48 }, 1.2, easeInOutQuad);
        yield* wait(2.0);
        yield* videoRef().to({ cornerRadius: 0 }, 0.8, easeInOutQuad);
        yield* wait(0.5);
    }
}
