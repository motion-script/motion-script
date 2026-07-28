---
"@motion-script/core": minor
"@motion-script/web": minor
"@motion-script/react": minor
"motion-script": minor
---

Add project-level content: `audioTracks`, `overlays` and `backgrounds` on `createProject`.

These describe what spans the whole project rather than one scene — a music bed that plays through the cuts, a watermark on every frame, one background shared by every scene.

```ts
createProject({
    name: 'Reel',
    scenes: [intro, demo, outro],

    // Laid straight on the project timeline. `startAt` places it, `trimStart`/
    // `trimEnd` crop the source; it runs until the crop or the project ends.
    audioTracks: [{ src: 'music.mp3', volume: 0.5, trimStart: 8, trimEnd: 40 }],

    // Drawn under every scene — a scene's own `fill` must be absent or
    // translucent for these to show.
    backgrounds: [() => <Image src="bg.jpg" width="fill" height="fill" />],

    // Drawn over every scene, outside its camera. `include`/`exclude` narrow a
    // layer to specific scenes, by name (matched loosely) or index.
    overlays: [
        { node: () => <Watermark />, exclude: 'outro' },
        { node: () => <Caption />, include: ['demo', 'outro'] },
    ],
});
```

A layer is its own viewport-sized frame outside the scene root, so it is untouched by the scene camera and by `Scene.reset` — declare it as a factory (`() => <Node/>`) rather than a bare node so its theme tokens resolve against the registered theme.

Beds and layers apply everywhere the project renders: preview, `ms screenshot`, `ms export` and the player's export dialog. Their assets are discovered by the same precomp pass that measures the scenes, so a watermark's font or a background video loads on schedule.

The player's timeline lists each background, overlay and audio bed as its own row above the scene's node tree — a layer's bar covers exactly the scenes its filter selects, and a bed's bar shows its waveform over its real span.
