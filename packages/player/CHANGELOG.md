# @motion-script/player

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
