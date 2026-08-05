

import {
    SceneGenerator, createRef, Reference, Text, Rect, Ellipse, Polygram, Image,
    EffectChain, easeOut, parallel,
    Node,
    Effects,
} from "motion-script";

/**
 * Shared scaffolding for the per-effect showcase scenes.
 *
 * A single still frame should answer "what does this effect actually *do*?", and
 * one photo can't: a colour grade reads on a photo but says nothing about how the
 * effect treats glyph edges, hairline strokes, or a flat fill. So every demo
 * renders the same effect across the four {@link SAMPLES} content types side by
 * side — photo, text, stroke-only shape, solid fill — over two rows: an untouched
 * reference row on top, and the row that animates `from` → `to` beneath it.
 *
 * Each effect file declares its metadata via {@link EffectDemoSpec}; this module
 * builds the grid and runs the transition, so those files stay tiny, consistent
 * declarations rather than copy-pasted layout + tween boilerplate. Effects that
 * can't be shown as a static from → to (motion blur) build the same grid out of
 * {@link sampleRow} and drive it themselves.
 */
export interface EffectDemoSpec {
    /** Card heading shown above the samples. */
    label: string;
    /** Inert chain the samples start in (the effect "off"). */
    from: EffectChain;
    /** Active chain the samples animate to (the effect "on"). */
    to: EffectChain;
    /**
     * When true the effect rides an Ellipse lens layered *over* each sample instead
     * of the sample itself. Backdrop-reading effects (`backdrop`-flagged filters,
     * magnify) need content behind the affected node to be legible — they blur /
     * magnify whatever the lens is sitting on.
     */
    background?: boolean;
    /** Seconds for the from → to transition (default 3). */
    duration?: number;
}

/** Stage/card palette, shared by every effect demo so the grids read alike. */
export const STAGE = '#F1E2C3';
const HEADING = '#5a4a3a';
const CARD = '#2B2520';

/** Sample palette — vivid enough that colour grades (vintage, invert, …) read. */
const GLYPH = '#F6EBD6';
const STROKE = '#7FD1C1';
const FILL = '#E8617C';

/** Diameter of the backdrop lens in `background` mode. */
const LENS = 200;

/**
 * The content types every effect is demonstrated on. Each reacts differently:
 * the photo shows the effect on dense detail, the text on glyph edges, the
 * stroke on hairline geometry, and the ellipse on a flat area of colour.
 */
export type SampleKind = 'photo' | 'text' | 'stroke' | 'fill';
export const SAMPLES: SampleKind[] = ['photo', 'text', 'stroke', 'fill'];

/** How large each sample is drawn — see the presets below. */
export interface SampleStyle {
    /** Box for the stroke/fill shapes, in px. */
    shape: number;
    /** Text sample font size, in px. */
    font: number;
    /** Photo height in px, or `'fill'` to span the whole cell. */
    photo: number | 'fill';
}

/** Default sizing: samples as large as the cell allows. */
export const FULL_SAMPLE: SampleStyle = { shape: 180, font: 92, photo: 'fill' };

/**
 * Sizing for `background` mode: the shapes shrink so the lens fully contains
 * them. A lens sitting entirely inside a flat fill has nothing to magnify or
 * blur, so the effect would otherwise read as a no-op.
 */
const UNDER_LENS: SampleStyle = { shape: 130, font: 92, photo: 'fill' };

/** Sizing for samples that travel inside their cell (see `motion-blur`). */
export const TRAVELLING_SAMPLE: SampleStyle = { shape: 110, font: 56, photo: 130 };

/** The node a `SampleKind` draws, carrying `effects` (empty chain = untouched). */
function sample(kind: SampleKind, effects: EffectChain, style: SampleStyle, ref?: Reference<any>) {
    switch (kind) {
        case 'photo':
            return style.photo === 'fill'
                ? <Image ref={ref} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'} effects={effects} />
                : <Image ref={ref} src={'./cat.jpg'} fit={'fill'}
                    width={style.photo * 1.5} height={style.photo} effects={effects} />;
        case 'text':
            return <Text ref={ref} text={'Motion'} fontSize={style.font} fontWeight={700} fill={GLYPH} effects={effects} />;
        case 'stroke':
            return <Polygram ref={ref} sides={6} ratio={0.45} width={style.shape} height={style.shape}
                stroke={{ weight: 6, fill: STROKE }} effects={effects} />;
        case 'fill':
            return <Ellipse ref={ref} width={style.shape} height={style.shape} fill={FILL} effects={effects} />;
    }
}

/** Per-row knobs for {@link sampleRow}. */
export interface SampleRowOptions {
    /** Effects every sample in the row carries. Defaults to none (the reference row). */
    effects?: EffectChain;
    /** Sample sizing (default {@link FULL_SAMPLE}). */
    style?: SampleStyle;
    /**
     * One ref per {@link SAMPLES} entry, bound to whichever node carries the
     * effects — the sample itself, or the lens in `lens` mode. Omit for a row
     * nothing animates.
     */
    refs?: Reference<any>[];
    /**
     * Put the effects on an Ellipse lens over an untouched sample rather than on
     * the sample itself, so backdrop effects have something to read.
     */
    lens?: boolean;
}

/**
 * One grid cell: the sample centred on a card.
 *
 * In lens mode the lens keeps a hairline stroke whether or not its effect is
 * active, so the silhouette the effect is clipped to stays visible in both rows.
 */
function cell(kind: SampleKind, effects: EffectChain, options: SampleRowOptions, ref?: Reference<any>) {
    const { style = FULL_SAMPLE, lens = false } = options;
    return (
        <Rect width={'fill'} height={'fill'} group={'stack'} clip={true} cornerRadius={16} fill={CARD}>
            {lens
                ? sample(kind, new EffectChain(), UNDER_LENS)
                : sample(kind, effects, style, ref)}
            {lens
                ? <Ellipse ref={ref} width={LENS} height={LENS} effects={effects}
                    stroke={{ weight: 2, fill: 'rgba(255,255,255,0.55)' }} />
                : null}
        </Rect>
    );
}

/** A row holding every {@link SAMPLES} cell, captioned with what it shows. */
export function sampleRow(caption: string, options: SampleRowOptions = {}) {
    const effects = options.effects ?? new EffectChain();
    return (
        <Rect width={'fill'} height={'fill'} group={'column'} gap={10}>
            <Rect width={'fill'} height={'fill'} group={'row'} gap={28}>
                {SAMPLES.map((kind, i) => cell(kind, effects, options, options.refs?.[i]))}
            </Rect>
            <Text text={caption} fontSize={30} fill={HEADING} width={'fill'} textAlign={'center'} />
        </Rect>
    );
}

/** The labelled frame the {@link sampleRow}s sit in. */
export function sampleGrid(label: string, rows: any[]) {
    return (
        <Rect width={'fill'} height={'fill'} group={'column'} padding={48} gap={24}>
            <Text text={label} fontSize={44} fill={HEADING} width={'fill'} textAlign={'center'} />
            {rows}
        </Rect>
    );
}

/**
 * A parameterized scene generator: each per-effect `?scene` file calls this with
 * its {@link EffectDemoSpec} (e.g. `createScene(effectDemo({ label, from, to }))`).
 *
 * The reference row deliberately carries no effects rather than `from`. `from` is
 * only *meant* to be inert, and a foreground shader effect at its identity value
 * (e.g. `bulge(0)`) leaves the backend with no lens to build, which drops the
 * node's content — so a `from` reference row can come out blank.
 */
export const effectDemo = (spec: EffectDemoSpec): SceneGenerator => function* (stage) {
    const { label, from, to, background = false, duration = 3 } = spec;
    stage.set({ fill: STAGE });

    const refs: Reference<any>[] = SAMPLES.map(() => createRef<Node>());

    stage.add(sampleGrid(label, [
        sampleRow(`Without ${label}`, { lens: background }),
        sampleRow(`With ${label}`, { effects: from, lens: background, refs }),
    ]));

    yield* parallel(...refs.map(ref => ref().to({ effects: to }, duration, easeOut('quad'))));
};
