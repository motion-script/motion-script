import { Scene, createRef, wait, easeOutQuad, Rect, Fills, Ellipse } from "@motion-script/core";
import { Code, lines, word } from "@motion-script/code";

export class CodeScene extends Scene {
    *build() {
        this.set({ fill: Fills.image('background.jpg', { mode: 'fill' }).color('#0f121a', { opacity: 0.24 }), padding: 120 });

        const code = createRef<Code>();

        this.add(
            <Rect cornerRadius={32} fill={'#0f121a'} height={'hug'} group={'column'} clip={true} >
                <Rect fill={'#191C24'} gap={24} padding={{ horizontal: 36, vertical: 32 }} width={'fill'} alignment={{ x: -1, y: 1 }}>
                    <Ellipse width={32} height={32} fill={'#FF5252'} />
                    <Ellipse width={32} height={32} fill={'#FFD70A'} />
                    <Ellipse width={32} height={32} fill={'#29EC71'} />

                </Rect>
                <Code
                    ref={code}
                    language={'typescript'}
                    padding={{ horizontal: 72, vertical: 42 }}
                    code={`function getUser(id: number) {
  const user = db.find(id);
  return user.name;
}`}
                    fontSize={64}
                    showLineNumbers={true}
                />
            </Rect>
        );

        yield* wait(0.5);

        // Highlight line 2
        yield* code().highlight(lines(2), 0.5);
        yield* wait(0.6);

        // Highlight a specific word
        yield* code().highlight(word(3, 10, 9), 0.4);
        yield* wait(0.6);

        // Clear highlight
        yield* code().resetHighlight(0.4);
        yield* wait(0.3);

        // Replace a token
        yield* code().replace(word(1, 22, 6), 'string', 0.3, easeOutQuad);
        yield* wait(0.5);

        // Remove a line
        yield* code().remove(lines(2), 0.4);
        yield* wait(1);
    }
};
