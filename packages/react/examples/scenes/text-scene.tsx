
/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Text, Rect, RichText } from "@motion-script/core";



export class TextScene extends Scene {
    *build() {
        this.set({ fill: 'bg', group: 'column', gap: 20, padding: 40 })
        const cardColor = 'card';

        const autoFitText = createRef<Text>();
        this.add(<Rect gap={40} width={'fill'} height={'fill'} group={'column'}>
            <Rect width={'fill'} height={'fill'} gap={40}>
                <Rect cornerRadius={20} width={'fill'} height={'fill'} fill={cardColor} padding={20}>
                    <RichText spans={[{ text: 'hello' }, { text: ' world', fill: 'red', fontSize: 60 }]} fontSize={40} fill={'white'} />
                </Rect>
                <Rect cornerRadius={20} width={'fill'} height={'fill'} fill={cardColor} >
                    <Rect width={400} height={400} cornerRadius={20} stroke={{ fill: 'orange', weight: 10 }} padding={40}>
                        <Text ref={autoFitText} text={'Hello world!'} fill={'white'} fontSize={'autofit'} wrap={true} minFontSize={40} />
                    </Rect>
                </Rect>
            </Rect>
            <Rect width={'fill'} height={'fill'} gap={40}>
                <Rect cornerRadius={20} width={'fill'} height={'fill'} group={'column'} gap={20} fill={cardColor} padding={20}>
                    <Text text={'Hello'} fontSize={100} stroke={{ weight: 2, fill: 'white' }} />
                    <Text text={'World'} fontSize={200} stroke={{ weight: 2, fill: 'white', dash: 5 }} />

                </Rect>
                <Rect cornerRadius={20} width={'fill'} height={'fill'} fill={cardColor} padding={20}>
                    <Text text={'Motion Script! This is a wonderful app filled with powerful tools for animation and video making.'} fontSize={'autofit'} minFontSize={40} fill={'white'} wrap={true} />
                </Rect>
            </Rect>
        </Rect>);
        yield* this.playSound('./song.mp3', { volume: 0.5, trimEnd: 4 });
        yield* autoFitText().to({ text: 'Hello world! and this is cool' }, 2);
        yield* autoFitText().append(' Appending more text.', 2);
        yield* autoFitText().prepend('Prepended: ', 2);


    }
};


