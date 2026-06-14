/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Reference, Text, Rect, Ellipse, Image,
    EffectChain, SceneEffect, easeOutQuad, parallel,
    Polygon,
    Node,
    Grid,
    range,
} from "@motion-script/core";

/**
 * Shared scaffolding for the per-effect showcase scenes.
 *
 * Every effect demo follows the same shape: a labelled card holding the sample
 * `cat.jpg` image (or, for backdrop-reading effects, an Ellipse layered over
 * that image), which animates from an inert starting chain to an active one.
 * Subclasses declare the metadata via {@link EffectDemoScene.spec}; this base
 * builds the card and runs the transition, so each effect file stays a tiny,
 * consistent declaration rather than copy-pasted layout + tween boilerplate.
 *
 * Backdrop-capable effects can opt into {@link EffectDemoSpec.compare} mode,
 * which splits the card into two samples: the effect applied *directly* to the
 * node's own content on the left, and the same effect applied to the *backdrop*
 * (the content beneath the node, clipped to its silhouette) on the right.
 */
export interface EffectDemoSpec {
    /** Card heading shown above the sample. */
    label: string;
    /** Inert chain the sample starts in (the effect "off"). */
    from: EffectChain;
    /** Active chain the sample animates to (the effect "on"). */
    to: EffectChain;
    /**
     * When true the effect rides an Ellipse layered *over* the image instead of
     * the image itself. Backdrop-reading effects (`backdrop`-flagged filters,
     * magnify) need content behind the affected node to be legible — they blur /
     * magnify the image beneath the ellipse.
     */
    background?: boolean;
    /**
     * When true, show a side-by-side comparison: the effect applied directly to
     * the node's content (left) vs. the same effect applied to the backdrop
     * (right). Only meaningful for backdrop-capable effects; ignored when
     * {@link background} is set.
     */
    compare?: boolean;
    /** Seconds for the from → to transition (default 3). */
    duration?: number;
}

/**
 * Re-flag every effect in `chain` as a backdrop effect (the right-side variant).
 * Only called on backdrop-capable chains, so the `backdrop` flag is always valid
 * on the underlying effect — the cast just collapses the per-member spread union.
 */
function toBackdrop(chain: EffectChain): EffectChain {
    return new EffectChain(chain.list.map((e) => ({ ...e, backdrop: true }) as SceneEffect));
}

export abstract class EffectDemoScene extends Scene {
    /** Declared by each concrete effect scene. */
    abstract readonly spec: EffectDemoSpec;

    *build() {
        this.set({ fill: '#F1E2C3' });

        const { label, from, to, background = false, compare = false, duration = 3 } = this.spec;

        if (compare && !background) {
            yield* this.buildComparison(label, from, to, duration);
            return;
        }

        if (background) {
            yield* this.buildBackground(label, from, to, duration);
            return;
        }

        yield* this.buildDirect(label, from, to, duration);
    }

    /** Single centred card: the effect applied directly to a cat.jpg image. */
    private *buildDirect(label: string, from: EffectChain, to: EffectChain, duration: number) {
        const imgRef: Reference<any> = createRef<Node>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={120} gap={40}>
                <Text text={label} fontSize={48} fill={'#5a4a3a'} width={'fill'} align={'center'} />
                <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={20}>
                    <Image ref={imgRef} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'} effects={from} />
                </Rect>
            </Rect>
        );

        yield* imgRef().to({ effects: to }, duration, easeOutQuad);
    }

    /**
     * Backdrop-mode card: a cat.jpg behind an Ellipse that carries the effect,
     * so backdrop-reading effects (blur backdrop, magnify) have visible content
     * beneath the affected node.
     */
    private *buildBackground(label: string, from: EffectChain, to: EffectChain, duration: number) {
        const overlayRef: Reference<any> = createRef<Node>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={120} gap={40}>
                <Text text={label} fontSize={48} fill={'#5a4a3a'} width={'fill'} align={'center'} />
                <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={20} group={'stack'}>
                    <Image src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'} />
                    <Ellipse ref={overlayRef} width={400} height={400} effects={from} />
                </Rect>
            </Rect>
        );

        yield* overlayRef().to({ effects: to }, duration, easeOutQuad);
    }

    /**
     * Two side-by-side cells over the same `cat.jpg`: the effect applied directly
     * to the node's content (left) and to the backdrop beneath the node (right),
     * both animating from → to in lock-step.
     */
    private *buildComparison(label: string, from: EffectChain, to: EffectChain, duration: number) {
        const directRef: Reference<any> = createRef<Node>();
        const backdropRef: Reference<any> = createRef<Node>();
        const backdropFrom = toBackdrop(from);
        const backdropTo = toBackdrop(to);

        this.add(
            <Rect width={'fill'} height={'fill'} group={'row'} padding={120} gap={120}>
                {/* Left — effect applied directly to the node's own content. */}
                <Rect width={'fill'} height={'fill'} group={'column'} gap={24}>
                    <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={20} group={'stack'}>
                        <Image src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'} effects={from} />
                    </Rect>
                    <Text text={`Without ${label}`} fontSize={36} fill={'#5a4a3a'} />
                </Rect>
                <Rect width={'fill'} height={'fill'} group={'column'} gap={24}>
                    <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={20} group={'stack'}>
                        <Image ref={directRef} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'} effects={from} />
                    </Rect>
                    <Text text={`With ${label}`} fontSize={36} fill={'#5a4a3a'} />
                </Rect>
                {/* Right — same effect applied to the backdrop beneath an inset,
                        centred rect, so the effect is confined to its silhouette and the
                        sharp surround makes the difference from the direct version legible. */}
                {/* <Rect width={'fill'} height={'fill'} clip={true} group={'stack'} cornerRadius={20}>
                    <Image src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'}>
                        <Rect ref={backdropRef} effects={backdropFrom} width={360} height={360} stroke={{ weight: 1, fill: 'white' }} />
                    </Image>
                </Rect> */}
            </Rect>

        );

        yield* parallel(
            directRef().to({ effects: to }, duration, easeOutQuad),
            //backdropRef().to({ effects: backdropTo }, duration, easeOutQuad),
        );
    }
}
