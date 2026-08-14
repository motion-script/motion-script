

import { createScene, createRef, Text, wait, sequence, easeInOut } from "motion-script";
import { textCard, textCell } from "./text-card";

const CREAM = '#F5ECD7';

/**
 * Exercises the three ways a {@link Text} node's `text` can change over time:
 * `append()` types new characters on at the end, `prepend()` types them on at
 * the start, and tweening `text` directly via `to()` uses `lerpText` to hold
 * the shared prefix/suffix fixed and rewrite just the differing middle —
 * an erase-and-retype effect rather than a cross-fade.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const typed = createRef<Text>();
    const front = createRef<Text>();
    const rewritten = createRef<Text>();

    stage.add(textCard({
        label: 'Typing & Erasing',
        stage: 'vertical',
        gap: 40,
        children: (
            <>
                {textCell({ caption: 'append()', children: <Text ref={typed} text={''} fontSize={56} fontWeight={500} fill={CREAM} /> })}
                {textCell({ caption: 'prepend()', children: <Text ref={front} text={'world'} fontSize={56} fontWeight={500} fill={CREAM} /> })}
                {textCell({ caption: 'to({ text }) — rewrites the differing middle', children: <Text ref={rewritten} text={'I like cats'} fontSize={56} fontWeight={500} fill={CREAM} /> })}
            </>
        ),
    }));

    yield* wait(0.3);

    yield* sequence(
        typed().append('Typing one character at a time...', 1.8),
        wait(0.4),
        front().prepend('hello, ', 1.2),
    );

    yield* wait(0.3);

    // Shared prefix "I like " and divergent middle "cats"/"dogs" — only the
    // middle erases and retypes, the prefix stays put the whole time.
    yield* rewritten().to({ text: 'I like dogs' }, 1.2, easeInOut('quad'));
    yield* wait(0.3);
    yield* rewritten().to({ text: 'I really like dogs a lot' }, 1.4, easeInOut('quad'));

    yield* wait(1);
});
