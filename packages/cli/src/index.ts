// @motion-script/cli — headless command-line exporter.
//
// The `ms` / `motion-script` binary lives in ./cli.ts. This barrel exposes the
// underlying driver for programmatic use (e.g. a custom build script that wants
// to render scenes without the CLI's argument parsing).
export {
    HeadlessDriver,
    resolveProjectRoot,
    type ExportFile,
    type DriverExportOptions,
} from './driver.js';
