import { createAnimationScene } from "@motion-script/core";

/**
 * A scene as **data**: an `add` that brings the node into being, and a `to` that
 * animates it.
 *
 * There is no function body to run. Every frame is `at + duration` arithmetic
 * over this list, so the scene can be asked what it looks like at 1.2s without
 * having drawn 0s first.
 */
const ShapeScene = createAnimationScene({
  kind: "animation",
  root: { fill: { type: "image", src: "./background.jpg", fit: "fill" } },
  commands: [
    {
      id: "add-poly",
      type: "add",
      target: null,
      at: 0,
      params: {
        node: {
          id: "poly",
          type: "polygram",
          parent: null,
          order: 0,
          props: {
            stroke: { weight: 15, fill: "white", dash: 20 },
            cornerRadius: 20,
            sides: 5,
            width: 650,
            height: 650,
          },
        },
      },
    },
    {
      id: "slide",
      type: "to",
      target: "poly",
      at: 0,
      duration: 1.5,
      params: { props: { x: 200, stroke: { dashOffset: 200 } } },
    },
  ],
});

export default ShapeScene;
