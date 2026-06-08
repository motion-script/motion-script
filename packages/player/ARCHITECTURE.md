# Player architecture

The player is a React app that wraps a `@motion-script/react` `MotionPlayer`
in an editor shell: scene list, video preview with pan/zoom, export, and a
timeline/inspector.

## App shell

`App.tsx` (`PlayerApp`) wires up providers in order:

```
MotionScriptProvider (loads CanvasKit wasm)
  EditorStoreProvider (creates the per-project zustand store)
    TooltipProvider
      ThemeProvider
        EditorLayout
```

`EditorLayout` (`components/layout/editor-layout.tsx`) is the top-level grid:
a fixed-width scene panel on the left, and a resizable vertical split on the
right between the video preview (top) and the timeline (bottom), built with
`react-resizable-panels`. The timeline panel is collapsible, its collapsed
state is mirrored both ways with `editorStore.timelineCollapsed` so the
toolbar arrow and the panel's own drag handle stay in sync.

## Editor store (`stores/editor-store.ts`)

A zustand store created per-project via `createEditorStore(config, assets)`
and provided through React context (`providers/editor-provider.tsx`,
`EditorStoreProvider` / `useEditorStore`). One instance exists per loaded
`ProjectConfig`; reloading a project (e.g. HMR) calls `resetConfig` rather
than recreating the store, which preserves UI state (zoom, pan, playback
position) across reloads where possible.

Key invariants and behaviors to know before touching this file:

- **Frame is canonical.** `currentFrame` is the integer source of truth;
  `currentTime` is always `currentFrame / fps`. Always go through
  `setCurrentFrame` / `setCurrentTime` (which derive the other) rather than
  setting either field directly.
- **`sceneStartFrames`** is derived once duration data comes back from the
  player (`setSceneDurations`, called from `VideoPreview.handleLoadingChange`)
  and gives the absolute frame each scene starts at — used everywhere to map
  a global frame to "which scene is active".
- **`resetConfig` preserves the active scene across reloads.** It looks up
  the currently-active scene by name in the new config (falling back to the
  same index) and stores the target as `_pendingSceneIndex`. Because the new
  config's scene durations aren't known yet, the actual frame jump happens
  later inside `setSceneDurations` once `_pendingSceneIndex` resolves to a
  concrete start frame. Don't short-circuit this — setting `currentFrame`
  directly in `resetConfig` would race the not-yet-computed durations.
- **`requestSnapshot`/`completeSnapshot`** form a request/ack pair consumed
  by `VideoPreview`, which owns the actual `MotionPlayer` ref and performs the
  screenshot + download.

## Video preview (`components/layout/video-preview.tsx`)

Hosts the `MotionPlayer` and layers pan/zoom interaction on top:

- **Ctrl+scroll** zooms toward the cursor (keeps the point under the cursor
  fixed), plain scroll/shift-scroll pans, **middle-mouse drag** pans, and
  **Shift+F** resets to fit-and-center. All pan values are clamped
  (`clampPan`) so at least `PAN_MARGIN` px of video stays on-screen.
- Renders ruler tick marks along the top/left edges in viewport units,
  computed from the current zoom and the video's displayed (CSS) size.
- `handleFrameChange` is the player's per-frame callback: it updates
  `currentFrame`/`rootNode` and additionally implements **scene looping**
  (`isLooping`) by seeking back to the active scene's start just before its
  last frame, and stops playback once the timeline runs out.

## Timeline (`components/timeline/`)

`TimelineRuler` (in `timeline.tsx`) is the main component; it composes:

- `EditorToolbar` — playback transport, mute, speed, loop, snapshot, and the
  timeline zoom slider/buttons.
- A **ruler header** (canvas-drawn tick marks + an HTML playhead overlay) that
  also acts as a seek control (click/drag).
- A **scene row** showing each scene as a clickable bar sized to its frame
  span, highlighting the active one.
- A **node tree body** split into two virtualized, scroll-synced columns:
  `NodeNamesColumn` (names/collapse/select) and `TrackRows` (per-node bars +
  audio waveforms + grid lines + playhead), both windowed by
  `useRowVirtualizer`.
- A **horizontal scrollbar** strip that drives `scrollLeft`.

### Zoom model

`timelineZoom` is a normalized `[0, 1]` value. It's interpolated
**geometrically** (not linearly) between two pixels-per-frame extremes
`FRAME_PX_AT_MIN_ZOOM` (densest, zoom = 0) and "fit the whole duration into
the visible track width" (zoom = 1) so the slider feels linear in
perceived zoom across orders of magnitude. `pickMajorStep` then picks a
nice round tick interval (1/2/5/10…) given the resulting px-per-unit, and
`FRAME_MODE_PX_THRESHOLD` decides whether ruler labels show frames ("55f")
or timecodes ("0:01.8").

### Auto-follow lock (playhead scrolling while playing)

While playing, once the playhead reaches `rightLimit` (a fixed px distance
from the right edge), the view "locks" `scrollLeft` is pinned so the
playhead stays at that edge and the *content* scrolls underneath it instead.
This is computed **synchronously every render** (not via effects/state) so
the playhead position and the scroll offset can never disagree an earlier
effects-based version visibly vibrated because the two could fall a frame out
of sync. If you need to change this logic, keep it derived in a single place
per render; don't split the playhead-position and scroll-position
calculations across separate effects.

### Row virtualization (`use-row-virtualizer.ts`, `flatten.ts`)

The node tree is flattened into a positional list (`flattenTree`, skipping
collapsed subtrees) and then windowed: only rows within the visible scroll
range (plus `ROW_OVERSCAN`) are mounted to the DOM. The names column and
track column scroll in lockstep (`onNamesScroll`/`onTrackScroll` mirror each
other's `scrollTop`, guarded by `syncingScrollRef` to avoid feedback loops),
and both feed the same shared `scrollTop` into the virtualizer so their
windows always match.

### Track bars (`track-rows.tsx`)

Each node renders a bar spanning `[startFrame, endFrame]` (its on-timeline
lifespan). Nodes that own audio clips (`node.waveform`) instead render one
`AudioWaveformBar` per clip — clip times are scene-local, so they're shifted
by the owning node's `startFrame` (the scene's global offset) to land in the
right place on the global timeline.

`AudioWaveformBar` decodes each audio URL **once** via a module-level cache
(`peaksCache`/`resolvedPeaks`) decoding is the expensive part (fetch +
`decodeAudioData`), and the timeline remounts/resizes bars constantly while
scrolling/zooming, so every later render of the same clip reuses cached PCM
peaks and repaints instantly.


## Scene panel (`components/layout/scene-panel.tsx`)

Lists scenes as clickable buttons that jump the playhead to the scene's start
frame, and surfaces per-scene `buildErrors` (from `editorStore.buildErrors`,
populated via `MotionPlayer`'s `onBuildErrors`) with a dialog
(`ErrorsDialog`) for full error details.

## Export (`components/export/`)

`useExport` wraps `@motion-script/web`'s `exportScenesAsVideo`, tracking
overall and per-scene progress, and supports two modes: a single combined
video, or one file per scene (`exportIndividually`). Progress callbacks
differ between the two — combined export reports one global `0..1` value that
`useExport` distributes evenly across scenes for the per-scene progress UI;
individual export reports real per-scene progress directly.
