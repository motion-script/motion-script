import {
    ShapeNode, ShapeProps, NodeConfig, RenderContext, Graphics, PathBuilder,
    FillSpace, FillResolved, property,
    Anchor,
    resolveAnchor,
    lerpVector2,

} from "motion-script";


export interface TextDrawShapeProps extends ShapeProps {
    textAlignment: Anchor;

}


export class TextDrawShape extends ShapeNode<TextDrawShapeProps> {

    @property({ default: { x: 0, y: 0 }, mapper: (v: Anchor) => resolveAnchor(v), tween: lerpVector2 })
    declare textAlignment: Anchor;


    constructor(props: NodeConfig<TextDrawShape, TextDrawShapeProps>) {
        super(props);
        // The figure is self-sized to the design box; default to hugging it so a
        // bare <DrawnShape /> lays out at its natural size in any container.
    }



    protected renderSelf(draw: RenderContext): void {


        const g = new Graphics().text({
            fontSize: 32, text: 'Hello World',

            pivot: this.textAlignment,
            x: 0, y: 0, rotation: 45, scale: 2
            //bottomCenter: { x: 0, y: 0 },s
        }).fill(this.fill);


        draw.draw(g);
        const center = new Graphics().ellipse({
            width: 24, height: 24,
            pivot: 'center', x: 0, y: 0,
        }).stroke({ weight: 2, fill: '#c2c2c2' });

        draw.draw(center);
    }
}
