
import { Scene, createRef, Rect, easeOutElastic, wait } from "@motion-script/core";

export class ExampleScene extends Scene {
  *build() {
    this.set({ fill: "#14161D" })

    const rectRef = createRef();


    this.add(
      <Rect ref={rectRef} y={-100} width={200} height={200} opacity={0} fill={'#4C68A0'} borderRadius={20} />
    );

    yield* rectRef().to({ y: 0, opacity: 1 }, 1, easeOutElastic(1, 0.4));

    yield* wait(0.5);
    yield* rectRef().to({ x: 500, borderRadius: 150, fill: 'white' }, 1.5, easeOutElastic(1, 0.5));
  }
};


