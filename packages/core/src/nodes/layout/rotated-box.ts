import { property } from "@/attributes/properties/decorator";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Measurer2D } from "@/render/measurer";
import { Size2D } from "@/attributes/layout/size";
import { Node2D, NodeConfig, Node2DProps } from "@/nodes/2d/node2d";

// Adjust this import path if needed

export interface RotatedBoxProps extends Node2DProps {
    /** 
     * Visual rotation angle in degrees. Unlike standard `rotation`, 
     * animating this ALSO dynamically calculates a new bounding box 
     * for the flex/layout engine. 
     */
    angle: number;
}

export class RotatedBox extends Node2D<RotatedBoxProps> {
    @property({ default: -90 }) declare angle: number;

    constructor(props?: NodeConfig<RotatedBox, RotatedBoxProps>) {
        super(props);

        // Clever trick: Automatically bind the inherited visual `rotation` prop to our `angle`.
        // This ensures the engine's built-in `applyTransform` pass physically rotates 
        // the canvas just like a normal Node2D, while we handle the layout box math below.
        this._writeProp('rotation', () => this.angle);
    }

    override measure(constraints: SizeConstraints, scope: Measurer2D): Partial<Size2D> {
        this.lastMeasure = { constraints, measurer: scope };

        // Calculate the projection scalars for the current angle.
        // Works perfectly for 90/-90, but also scales bounds smoothly for arbitrary angles.
        const rad = this.angle * (Math.PI / 180);
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));

        // 1. Map the parent constraints into the child's un-rotated coordinate space.
        // If orthogonal (90/-90), this cleanly swaps maxWidth and maxHeight.
        const isOrthogonal = Math.abs(this.angle % 180) === 90;
        const childConstraints: SizeConstraints = {
            maxWidth: (constraints.maxWidth !== undefined && constraints.maxHeight !== undefined)
                ? (constraints.maxWidth * cos + constraints.maxHeight * sin)
                : (isOrthogonal ? constraints.maxHeight : constraints.maxWidth),
            maxHeight: (constraints.maxWidth !== undefined && constraints.maxHeight !== undefined)
                ? (constraints.maxWidth * sin + constraints.maxHeight * cos)
                : (isOrthogonal ? constraints.maxWidth : constraints.maxHeight),
        };

        // 2. Measure all children stack-style against the rotated constraints
        let maxChildW = 0;
        let maxChildH = 0;

        for (const child of this.flowChildren()) {
            const size = child.measure(childConstraints, scope);
            if ((size.width ?? 0) > maxChildW) maxChildW = size.width ?? 0;
            if ((size.height ?? 0) > maxChildH) maxChildH = size.height ?? 0;
        }

        // 3. Project the child's intrinsic size back into our rotated layout bounding box.
        const rotatedW = maxChildW * cos + maxChildH * sin;
        const rotatedH = maxChildW * sin + maxChildH * cos;

        // Resolve against "hug" / "fill" / strict author sizes
        return {
            width: this.resolveSizeInput(this.width, constraints.maxWidth ?? 0, rotatedW),
            height: this.resolveSizeInput(this.height, constraints.maxHeight ?? 0, rotatedH),
        };
    }

    protected override layoutChildren(rect: BoxBounds, scope: Measurer2D): void {
        const rad = this.angle * (Math.PI / 180);
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));

        // Project the allocated parent bounding box back into the child's un-rotated space.
        // If we are rotated 90 degrees, the child's width space is allocated our height, 
        // and the child's height space is allocated our width.
        const childRect: BoxBounds = {
            x: rect.x,
            y: rect.y,
            width: rect.width * cos + rect.height * sin,
            height: rect.width * sin + rect.height * cos,
        };

        // Let the base Node2D class center the children inside this un-rotated rect.
        // When `applyTransform` executes the rotation, the child will visually pivot perfectly 
        // inside the original `rect` space without overflowing.
        super.layoutChildren(childRect, scope);
    }
}