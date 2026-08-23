import type { Node } from "../nodes/base/node";
import type { Reference } from "../util/reference";

export function jsx(type: any, props: any) {
    // Fragment support
    if (type === Fragment) {
        const children = props?.children ?? [];
        // Wrap single child in array if it's not already an array
        return Array.isArray(children) ? children : [children];
    }

    // Class-based node
    if (typeof type === "function") {
        return new type(props);
    }

    throw new Error(
        "JSX element must be a SceneNode class (e.g. <Circle />)"
    );
}

export const jsxs = jsx;
export const Fragment = Symbol.for("motion.fragment");

export namespace JSX {
    // The dimension-agnostic base, so both trees are valid JSX. Which children a
    // node will actually accept is a runtime check (`Node.acceptsChild`) rather
    // than a type-level one: `children` is one prop shared by every node, and
    // splitting JSX by dimension would mean two runtimes for one syntax.
    export type Element = Node;
    export interface ElementClass extends Node<any> { }
    export interface ElementChildrenAttribute { children: {} }
    export interface IntrinsicAttributes { ref?: Reference<any> }
    export interface IntrinsicElements { }
}
