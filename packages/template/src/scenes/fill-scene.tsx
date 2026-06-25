import { createScene, createRef, Grid, Rect, Ellipse, Polygon, Polygram, Path, Line, Text, parallel, sequence, wait, easeInOutQuad, easeOutBack, easeOutQuad, Fills } from "@motion-script/core";



export default createScene(function* (stage) {
    stage.set({ fill: "#e8c584", padding: 80, group: 'row', gap: 20 });

    const fillRef = createRef<Polygon>();
    const w = 400;
    const h = 400;
    stage.add(<Polygon stroke={{ weight: 12, fill: 'red' }} height={h} width={w} cornerRadius={20} />);
    stage.add(<Polygon fill={'red'} height={h} width={w} cornerRadius={20} />);
    stage.add(<Polygon shadow={{ fill: 'black', offset: { x: 20, y: -20 }, blur: 20 }} fill={Fills.color('red', { opacity: 0.4 })} height={h} width={w} cornerRadius={20} />);
    stage.add(<Polygon shadow={[{ fill: 'black', offset: { x: 20, y: -20 }, blur: 10 }, { fill: 'black', offset: { x: 40, y: 20 }, blur: 10 }]} stroke={[{ weight: 2, fill: 'red' }, { weight: 8, fill: 'red', dash: 20, align: 'center' }]} height={h} width={w} cornerRadius={20} />);

    yield* wait(0.5);
});
