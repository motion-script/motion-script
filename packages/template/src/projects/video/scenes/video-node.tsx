/** @jsxImportSource @motion-script/core/jsx */

import { Scene, Video, Text, wait } from "@motion-script/core";
import { SAMPLE_VIDEO } from "./video-fill";

/**
 * The {@link Video} node — a `Rect` that paints a *playing* clip and plays the
 * clip's own audio track on the scene's timeline. Unlike a bare `video` fill,
 * the node ties picture and sound together: trim/speed/loop apply to both, and
 * `muted` drops the audio while keeping the picture.
 *
 * (The bundled `band.mp4` ships without an audio track, so this scene is silent;
 * point `src` at a clip that has audio and the node plays it in sync with no
 * other wiring.)
 */
export class VideoNodeScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        this.add(
            <Video
                src={SAMPLE_VIDEO}
                fit={'crop'}
                loop={'forward'}
                volume={0.8}
                width={'fill'}
                height={'fill'}
                group={'column'}
                padding={80}
                alignment={{ x: -1, y: 1 }}
            >
                <Text
                    fontFamily={'Pixelify Sans'}
                    text={'Video node — picture + audio'}
                    fontSize={72}
                    fill={'white'}
                />
            </Video>
        );

        yield* wait(4);
    }
}
