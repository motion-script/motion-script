

import { Scene, createRef, Text, easeOutQuad, NormalizedColor, Rect, Grid, BuildStage, RichText, FX } from "@motion-script/core";



export class ComplexTextScene extends Scene {
    *build(stage: BuildStage) {
        this.set({ fill: 'bg' })
        const cardColor = 'card';

        const autoFitText = createRef<Text>();
        const variableFontText = createRef<Text>();
        const letterSpacingText = createRef<Text>();
        const cell = (label: string, content: any) => (
            <Rect height={'fill'} fill={cardColor} group={'column'} padding={20} gap={10} colSpan={1} cornerRadius={20} width={'fill'}>
                <Text text={label} fontSize={20} fill={'white'} opacity={0.4} align={'left'} width={'fill'} />
                <Rect cornerRadius={20} width={'fill'} height={'fill'} fill={cardColor} padding={20}>
                    {content}
                </Rect>
            </Rect>
        );

        this.add(<Grid columns={3} gap={40} padding={120} width={'fill'} height={'fill'}>
            {cell('Rich text', <RichText width={'fill'} spans={[{ text: 'Hello world this is ', fill: 'white', fontWeight: 200, fontSize: 30, }, { text: 'hello my name is', fill: 'white' }, { text: ' John', stroke: { fill: 'white', weight: 1.5 }, fontSize: 70, fontWeight: 600 },]} fontSize={40} />)}
            {cell('Autofit text', <Rect width={'fill'} height={'fill'} cornerRadius={20} stroke={{ fill: 'orange', weight: 10 }} padding={40}>
                <Text ref={autoFitText} fontStyle={'italic'} text={'Hello world! '} width={'fill'} fill={'white'} wrap={true} minFontSize={40} fontSize={'autofit'} align={'center'} />
            </Rect>)}
            {cell('Letter spacing', <Text ref={letterSpacingText} text={'Hello'} letterSpacing={10} fontWeight={100} fontSize={100} fill={'white'} />)}
            {cell('Variable font', <Text ref={variableFontText} text={'MS'} fontSize={200} stroke={{ weight: 2, fill: 'white', dash: 5 }} />)}
            {cell('Wrapping', <Text text={'Motion Script! This is a wonderful app filled with powerful tools for animation and video making.'} fontSize={'autofit'} minFontSize={40} fill={'white'} wrap={true} />)}
            {cell('Stroke', <Text text={'Stroke'} fontSize={80} fontWeight={700} fill={'white'} stroke={{ weight: 2, fill: 'orange' }} />)}
        </Grid>);
        yield* variableFontText().to({ fontWeight: 900 }, 2);
        yield* autoFitText().to({ text: 'Hello world! and this is cool' }, 2);
        yield* autoFitText().append(' Appending more text.', 2);
        yield* autoFitText().prepend('Prepended: ', 2);
        yield* letterSpacingText().to({ letterSpacing: 20 }, 2);


    }
};


