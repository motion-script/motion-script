import { ManifestAssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import type { AttachScope, Node } from "./node";

/** An empty manifest — enough to attach a tree that declares no assets. */
const EMPTY_CATALOG = new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} });

/**
 * The {@link AttachScope} a bare unit test needs: an empty catalog, the root
 * context, and a clock at `time`.
 *
 * Assembling a tree and attaching it is what the runtime does at the start of
 * every pass, and it is the precondition for measuring, laying out, rendering or
 * animating anything — so most node tests need one line of it.
 */
export function attachScope(time = 0): AttachScope {
    return { assets: EMPTY_CATALOG, context: ContextMap.EMPTY, time };
}

/** Attach `node` as the root of a live tree and hand it back. */
export function attached<T extends Node>(node: T, time = 0): T {
    node.attach(attachScope(time));
    return node;
}
