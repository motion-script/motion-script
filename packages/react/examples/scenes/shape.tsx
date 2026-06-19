/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Polygram } from "@motion-script/core";

const ShapeScene = createScene(function* (stage) {
  stage.set({ fill: { type: 'image', src: './background.jpg', fit: 'fill' } });
  const poly = createRef<Polygram>();

  stage.add(
    <Polygram ref={poly} stroke={{ weight: 15, fill: 'white', dash: 20 }} cornerRadius={20} sides={5} width={650} height={650} />
  );

  yield* poly().to({ x: 200, stroke: { dashOffset: 200 } }, 1.5);
});
export default ShapeScene;