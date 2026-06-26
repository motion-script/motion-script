import { createScene, createRef, Rect, easeOut, wait } from "@motion-script/core";

export default createScene(function* (stage) {
  stage.set({ fill: "#14161D" });

  const rectRef = createRef<Rect>();

  stage.add(
    <Rect ref={rectRef} y={-100} width={200} height={200} fill={'#4C68A0'} cornerRadius={20} />
  );

  yield* rectRef().to({ y: 0 }, 1, easeOut({ type: 'elastic', amplitude: 1, period: 0.4 }));

  yield* wait(0.5);
  yield* rectRef().to({ x: 500, cornerRadius: 150, fill: 'white' }, 1.5, easeOut({ type: 'elastic', amplitude: 1, period: 0.5 }));
});
