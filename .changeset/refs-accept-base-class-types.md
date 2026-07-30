---
"@motion-script/core": minor
---

A node's `ref` accepts a `Reference` declared as one of the node's base classes.

`createRef<ShapeNode>()` can now be attached to a `<Rect>` or an `<Ellipse>`, and
`createRef<Node>()` to anything — so one handle holds whichever node a factory
happened to build, instead of forcing a cast:

```tsx
const shape = createRef<ShapeNode>();

<Rect ref={shape} cornerRadius={24} />
<Ellipse ref={shape} />

shape().to({ fill: 'red' }, 0.4);   // typed as ShapeNode, so shape-level props
```

This direction is the sound one: the framework only ever *writes* into a ref and
the author only ever reads, so the write stores a subtype and the read yields the
base class that was asked for. The reverse — `createRef<Rect>()` on a `<Text>` —
stays a type error, since that ref would hold a `Text` at runtime while typing
every read as a `Rect`.

**API**

- New `RefTarget<T>` type: the slot a node's `ref` prop takes. `NodeMetadata.ref`
  is typed with it rather than `Reference<T>`. A plain setter function
  (`ref={n => …}`) satisfies it too, so React-style callback refs work.
- `Reference<T>` gains an `@internal` phantom `__accepts` field. It is never
  assigned or called; it exists so `T` sits in a contravariant position, which is
  what keeps the unsound direction an error. The call signatures alone can't
  decide it — the zero-arg getter `(): T` is assignable to any `(x) => void`.
