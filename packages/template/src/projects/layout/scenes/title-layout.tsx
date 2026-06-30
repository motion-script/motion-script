import {
    Clip,
    Effects,
    Ellipse,
    Fills,
    Image,
    ImageFilters,
    Polygon,
    Rect,
    SceneGenerator,
    Text,
    createRef,
    createScene,
    easeOut,
    parallel,
    wait,
} from "motion-script";


/** Colour tokens for a chapter title card. All optional — sensible defaults match the Catan deck. */
export interface ChapterTheme {
    /** Page background. */
    background: string;
    /** The eyebrow dot and the oversized chapter number. */
    accent: string;
    /** The eyebrow label (e.g. "PART II"). */
    eyebrow: string;
    /** The chapter title (e.g. "The Board"). */
    title: string;
    /** The descriptive subtitle beneath the title. */
    subtitle: string;
}

/** Content + styling for a single chapter title card. */
export interface ChapterPageOptions {
    /** Eyebrow label, drawn after the accent dot (e.g. "PART II"). */
    part: string;
    /** The oversized chapter number (e.g. "02"). */
    number: string;
    /** The chapter title (e.g. "The Board"). */
    title: string;
    /** Supporting sentence(s) under the title. Wraps within {@link textWidth}. */
    subtitle: string;
    /** Colour overrides; any omitted key falls back to {@link DEFAULT_CHAPTER_THEME}. */
    theme?: Partial<ChapterTheme>;
    /** Left edge of the text column, in scene px (origin-centred). Default -880. */
    left?: number;
    /** Wrap width for the subtitle, in px. Default 720. */
    textWidth?: number;
}

/** Warm-sand / green palette matching the chapter card in the deck. */
export const DEFAULT_CHAPTER_THEME: ChapterTheme = {
    background: "#e7ddc3",
    accent: "#3f7d4e",
    eyebrow: "#8a8067",
    title: "#2b2419",
    subtitle: "#5f5848",
};

export function chapterPage(opts: ChapterPageOptions): SceneGenerator {
    const theme = { ...DEFAULT_CHAPTER_THEME, ...opts.theme };


    return function* (stage) {
        stage.set({ fill: Fills.color(theme.background), padding: 80, align: 'center' });

        const eyebrow = createRef<Text>();
        const dot = createRef<Ellipse>();
        const number = createRef<Text>();
        const title = createRef<Text>();
        const subtitle = createRef<Text>();
        const column = createRef<Rect>();



        stage.add(<Rect ref={column} width={400} group={'column'} padding={20}  >

            <Ellipse
                ref={dot}
                width={14}
                height={14}
                y={20}
                fill={theme.accent}
                opacity={1}
            />
            <Text
                ref={eyebrow}
                text={opts.part.toUpperCase()}
                fontSize={26}
                fontWeight={600}
                letterSpacing={8}

                fill={theme.eyebrow}
                opacity={1}
            />

            <Text
                ref={number}
                text={opts.number}
                fontSize={300}
                fontWeight={800}
                letterSpacing={-6}

                fill={theme.accent}
                opacity={1}
            />

            <Text
                ref={title}
                text={opts.title}
                fontSize={130}
                fontWeight={800}
                lineHeight={0.8}
                letterSpacing={-2}

                fill={theme.title}
                opacity={1}
            />


            <Text
                ref={subtitle}


                text={opts.subtitle}
                fontSize={34}
                fontWeight={400}
                width={700}
                height={220}
                lineHeight={1.35}
                wrap={true}

                fill={theme.subtitle}
                opacity={1}
            />

        </Rect>);




        yield* wait(0.6);
    };
}
export default createScene(
    chapterPage({
        part: "Part II",
        number: "02",
        title: "The Board",
        subtitle:
            "Probability becomes production through two numbers: how many pips a " +
            "tile carries, and how rare its resource is.",
    }),
);