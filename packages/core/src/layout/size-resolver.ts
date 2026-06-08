import { SizeInput } from "@/attributes/layout/size";

/**
 * Resolve a SizeInput (number | "fill" | "hug") to a concrete number.
 *
 * - number → returned as-is
 * - "fill" → fills the available parent size
 * - "hug"  → shrinks to the size of contents
 *
 * Pure: no node references, no rendering.
 */
export function resolveSize(input: SizeInput, availableSize: number, contentSize: number): number {
    if (typeof input === "number") return input;
    if (input === "fill") return availableSize;
    if (input === "hug") return contentSize;
    return availableSize;
}

export function isAutoSize(input: SizeInput): boolean {
    return typeof input !== "number";
}
