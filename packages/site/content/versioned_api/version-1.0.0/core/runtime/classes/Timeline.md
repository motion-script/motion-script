# Class: Timeline

Imperative animation timeline (version **1.0.0** only).

`Timeline` was removed after `1.0.0` — animations are now driven directly by
`yield*` inside the scene generator, so this class has **no equivalent in the
latest API**.

## Constructors

### new Timeline()

```ts
new Timeline(): Timeline
```

## Methods

### add()

```ts
add(animation: ThreadGenerator): this
```

Queues an animation onto the timeline.

### play()

```ts
play(): ThreadGenerator
```

Plays all queued animations in sequence. `yield*` this from a scene.
