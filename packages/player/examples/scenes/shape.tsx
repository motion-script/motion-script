/** @jsxImportSource @motion-script/core/jsx */


import { Scene, createRef, Ellipse, FX, Text, Rect, wait, BuildStage, parallel, easeOutQuad } from "@motion-script/core";

export class LayoutScene extends Scene {
  *build(stage: BuildStage) {
    this.set({ fill: "#0D0F15", padding: 80 });
    const colA = createRef<Rect>();
    const colB = createRef<Rect>();
    const rowA = createRef<Rect>();
    const rowB = createRef<Rect>();

    this.add(
      <>
        <Rect gap={20} group={'row'} padding={10} width={1000} height={600}>
          <Rect ref={colA} width={'fill'} flex={1} fill={'#161a21'} cornerRadius={8} />
          <Rect group={'column'} gap={20} height={'fill'} width={'fill'} flex={2} >
            <Rect ref={rowA} height={'fill'} width={'fill'} flex={2} cornerRadius={4} stroke={{ fill: 'white', weight: 12 }} fill={'#FF6470'} >

              <Ellipse width={32} height={32} fill={'white'} />

            </Rect>
            <Rect ref={rowB} height={'fill'} flex={1} fill={'#161a21'} cornerRadius={8} />

          </Rect>
          {/* flex implies width 'fill'; this column takes 1 share like the red one */}
          <Rect ref={colB} flex={2} fill={'#161a21'} cornerRadius={8} />
        </Rect>
      </>,
    );
    yield* parallel(
      colA().to({ flex: 2 }, 0.5, easeOutQuad),

      colB().to({ flex: 1 }, 0.5, easeOutQuad),

    );
    yield* rowA().to({ flex: 1 }, 0.5, easeOutQuad);
    yield* parallel(
      colA().to({ flex: 1 }, 0.5, easeOutQuad),

      colB().to({ flex: 2 }, 0.5, easeOutQuad),

    );

    yield* rowA().to({ flex: 2 }, 0.5, easeOutQuad);



  }
};

