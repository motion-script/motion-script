# Class: Node

The base class for every node in the scene graph (version **1.0.0**).

In `1.0.0`, nodes were added to the scene via `view.add(...)` and positioned
with the `x` / `y` props directly.

## Constructors

### new Node()

```ts
new Node(props?: NodeProps): Node
```

#### Parameters

| Parameter | Type        | Description                |
| --------- | ----------- | -------------------------- |
| `props?`  | `NodeProps` | Initial property values.   |

## Properties

| Property | Type     | Description                              |
| -------- | -------- | ---------------------------------------- |
| `x`      | `number` | Horizontal position in pixels.           |
| `y`      | `number` | Vertical position in pixels.             |

## See also

- [Timeline](../../runtime/classes/Timeline.md) — drives node animations in 1.0.0
