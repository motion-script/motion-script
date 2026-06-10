import { Scene, createRef, Grid, Rect, Ellipse, Polygon, Polygram, Path, Line, Text, parallel, sequence, wait, easeInOutQuad, easeOutBack, easeOutQuad, Fill } from "@motion-script/core";



export class FillScene extends Scene {
  *build() {
    this.set({ fill: "#e8c584", padding: 80, group: 'row', gap: 20 });

    const fillRef = createRef<Polygon>();
    const w = 400;
    const h = 400;
    this.add(<Polygon stroke={{ weight: 12, fill: 'red' }} height={h} width={w} borderRadius={20} />);
    this.add(<Polygon fill={'red'} height={h} width={w} borderRadius={20} />);
    this.add(<Polygon shadow={{ fill: 'black', dx: 20, dy: -20, blur: 20 }} fill={Fill.color('red', { opacity: 0.4 })} height={h} width={w} borderRadius={20} />);
    this.add(<Polygon shadow={[{ fill: 'black', dx: 20, dy: -20, blur: 10 }, { fill: 'black', dx: 40, dy: 20, blur: 10 }]} stroke={[{ weight: 2, fill: 'red' }, { weight: 8, fill: 'red', dash: 20, align: 'center' }]} height={h} width={w} borderRadius={20} />);

    yield* wait(0.5);
  }
};
