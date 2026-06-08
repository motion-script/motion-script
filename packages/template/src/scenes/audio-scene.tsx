import { Scene, createRef, Rect, Text, Grid, wait } from "@motion-script/core";

const COLORS = ["#e07b54", "#5ea8d8", "#6bcc8a", "#c97dd4", "#e8c84a", "#d45e6e"];

export class AudioScene extends Scene {
    *build() {
        this.set({ fill: "#0D0F15", padding: 80 });

        const grid = createRef<Grid>();

        this.add(
            <Grid
                ref={grid}
                columns={3}
                gap={16}
                width={'fill'}
            >
                {/* Full-width header row */}
                <Rect colSpan={3} height={80} fill="#1e2430" borderRadius={12}>
                    <Text
                        text="Audio Scene"
                        fontSize={28}
                        fill="white"
                        fontFamily="Inter"
                    />
                </Rect>

                {/* Three equal cells */}
                <Rect height={160} fill={COLORS[0]} borderRadius={12} />
                <Rect height={160} fill={COLORS[1]} borderRadius={12} />
                <Rect height={160} fill={COLORS[2]} borderRadius={12} />

                {/* Wide + narrow */}
                <Rect colSpan={2} height={120} fill={COLORS[3]} borderRadius={12} />
                <Rect height={120} fill={COLORS[4]} borderRadius={12} />

                {/* Full-width footer */}
                <Rect colSpan={3} height={60} fill={COLORS[5]} borderRadius={12} />
            </Grid>
        );
        yield* wait(2);
        yield* this.playSound('song.mp3',);
        yield* wait(1);


    }
}
