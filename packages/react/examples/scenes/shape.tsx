/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Polygram } from "@motion-script/core";



export class ShapeScene extends Scene {
  *build() {
    this.set({ fill: { type: 'image', src: './background.jpg', mode: 'fill' } })
    const poly = createRef<Polygram>();

    this.add(
      <Polygram ref={poly} stroke={{ weight: 15, fill: 'white', dash: 20 }} cornerRadius={20} sides={5} width={650} height={650} />


    );

    yield* poly().to({ x: 200, stroke: { dashOffset: 200 } }, 1.5);


  }
};
