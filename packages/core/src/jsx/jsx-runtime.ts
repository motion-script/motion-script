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
    export type Element = Node;
    export interface ElementClass extends Node<any> { }
    export interface ElementChildrenAttribute { children: {} }
    export interface IntrinsicAttributes { ref?: Reference<any> }
    export interface IntrinsicElements { }
}
