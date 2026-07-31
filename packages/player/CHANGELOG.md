# @motion-script/player

## 2.13.0

### Minor Changes

- 84148d8: Add 3D graphics that uses Three js internally and provides graphics/pixijs inspired syntax. Also added a bunch of new effects along with some layout fixes.

### Patch Changes

- Updated dependencies [84148d8]
  - @motion-script/canvaskit@2.13.0

## 2.11.3

### Patch Changes

- f44d98c: fix: update exporter to be consistent among different OS
- Updated dependencies [f44d98c]
  - @motion-script/canvaskit@2.11.3

## 2.11.2

### Patch Changes

- f716f6b: feat: fix text align and add asset tracker into export
- Updated dependencies [f716f6b]
  - @motion-script/canvaskit@2.11.2

## 2.11.1

### Patch Changes

- 2177c70: fix rotation and scale rendering for text graphics
- Updated dependencies [2177c70]
  - @motion-script/canvaskit@2.11.1

## 2.11.0

### Minor Changes

- 89bb963: Fix support for cardinal cordinates

### Patch Changes

- Updated dependencies [89bb963]
  - @motion-script/canvaskit@2.11.0

## 2.10.1

### Patch Changes

- 89aae7f: Adjust tsconfig and create template
- Updated dependencies [89aae7f]
  - @motion-script/canvaskit@2.10.1

## 2.10.0

### Minor Changes

- a91a1a2: Create flagship motion-script package

### Patch Changes

- Updated dependencies [a91a1a2]
  - @motion-script/canvaskit@2.10.0

## 2.9.2

### Patch Changes

- 5dbf7d4: fix default layout from row to stack as it was supposed to
- Updated dependencies [5dbf7d4]
  - @motion-script/canvaskit@2.9.2

## 2.9.1

### Patch Changes

- 9b0cee6: make all easing functions parameters optional
- Updated dependencies [9b0cee6]
  - @motion-script/canvaskit@2.9.1

## 2.9.0

### Minor Changes

- dd2b8a4: Add overlay to nodes, add opacity string syntax colors, add many new easing functions

### Patch Changes

- Updated dependencies [dd2b8a4]
  - @motion-script/canvaskit@2.9.0

## 2.8.0

### Minor Changes

- 7d86215: Add prepareLayout and clipPath for media nodes
- f9442b6: Add number node and clean up github release action bundle

### Patch Changes

- Updated dependencies [7d86215]
- Updated dependencies [f9442b6]
  - @motion-script/canvaskit@2.8.0

## 2.7.0

### Minor Changes

- f038380: Bug fixes around text layouts and default self rendering methods for base nodes.

### Patch Changes

- Updated dependencies [f038380]
  - @motion-script/canvaskit@2.7.0

## 2.6.0

### Minor Changes

- refactor stage and fills

### Patch Changes

- Updated dependencies
  - @motion-script/canvaskit@2.6.0

## 2.3.0

### Minor Changes

- fix text align

### Patch Changes

- Updated dependencies
  - @motion-script/canvaskit@2.3.0

## 2.2.0

### Minor Changes

- fix player build

### Patch Changes

- Updated dependencies
  - @motion-script/canvaskit@2.2.0

## 2.1.1

### Patch Changes

- Fix unresolvable `zustand` import in the published player bundle. The
  `external` regex `/use-sync-external-store/` was unanchored, so it also matched
  zustand's pnpm peer-dep path (whose hash directory is named
  `zustand@..._use-sync-external-store@1.6.0_react@...`). On CI that made rolldown
  externalize zustand's absolute build-machine path, shipping an unresolvable
  `import { create } from "/home/runner/.../zustand/esm/index.mjs"`. The regex is
  now anchored to the bare specifier (`/^use-sync-external-store(\/|$)/`), so
  zustand is bundled as intended.

## 2.1.0

### Minor Changes

- 9bfe770: fix build issues
- 2713971: Fixed player build

### Patch Changes

- Updated dependencies [9bfe770]
- Updated dependencies [2713971]
  - @motion-script/canvaskit@2.1.0
