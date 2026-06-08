import { Scene, createRef, Image, Ellipse, FX, Rect, Fill, Polygon, easeOutElastic, easeOutQuad, wait } from "@motion-script/core";

export class ShapeScene extends Scene {
  *build() {
    this.set({ fill: "#0D0F15" })

    const lens = createRef<Ellipse>();


    this.add(
      <>

        <Polygon width={600} height={600} fill={Fill.image('boston1x.png', { mode: 'crop' })} borderRadius={20} />
        <Ellipse
          ref={lens}
          x={-600}
          y={200}
          fill={Fill.color('white', { opacity: 0.1 })}
          stroke={{ fill: { type: 'color', opacity: 0.4, color: 'white' }, weight: 4 }}
          effects={FX.backgroundBlur(20)}

          width={350}
          height={350}


        />
      </>
    );


    yield* wait(1);
    // Sweep the lens from a strong bulge through flat to a strong pinch.
    yield* lens().to({ x: 0, y: 0 }, 3, easeOutQuad);
    yield* lens().to({ x: -600, y: 200 }, 3, easeOutQuad);

  }
};
