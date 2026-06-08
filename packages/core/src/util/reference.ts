/**
 * A callable reference that acts as both getter and setter.
 * - `ref()` → returns the current value (throws if not yet assigned)
 * - `ref(value)` → sets the current value
 */
export interface Reference<T> {
    (): T;
    (node: T | null): void;
}

/**
 * Creates a typed reference holder — analogous to React's `createRef`,
 * but expressed as a single overloaded function rather than a `{ current }` object.
 */
export function createRef<T>(): Reference<T> {
    let current: T | null = null;

    function ref(): T;
    function ref(node: T | null): void;
    function ref(node?: T | null): T | void {
        if (node !== undefined) {
            current = node;
        } else {
            if (current === null) {
                throw new Error("Reference not assigned yet");
            }
            return current;
        }
    }

    return ref;
}
