import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import type { ComponentsConfig, RegistryItem } from './schema.js';
import { fetchRegistryItem } from './fetch.js';

/**
 * Resolve a list of requested component names into an ordered, deduped
 * install list, recursively pulling in each item's `registryDependencies`
 * before the item itself (so a dependency's files land first).
 */
export async function resolveComponents(
    names: string[],
    config: ComponentsConfig | null,
    defaultRegistryUrl: string | undefined,
): Promise<RegistryItem[]> {
    const resolved: RegistryItem[] = [];
    const seen = new Set<string>();

    async function visit(name: string): Promise<void> {
        if (seen.has(name)) return;
        seen.add(name);
        const item = await fetchRegistryItem(name, config, defaultRegistryUrl);
        for (const dep of item.registryDependencies ?? []) {
            await visit(dep);
        }
        resolved.push(item);
    }

    for (const name of names) {
        await visit(name);
    }
    return resolved;
}

export interface WriteResult {
    written: string[];
    skipped: string[];
}

/**
 * Write every file in `item` under `<paths.components>/`, at whatever path
 * each file itself declares — prompting before overwriting an existing file
 * unless `force` is set.
 *
 * Deliberately does *not* nest every item under its own `<item.name>/`
 * subfolder: a simple single-file component declares one file at
 * `"code.ts"` and lands flat (`src/components/code.ts`), while a component
 * that genuinely needs several files declares them nested
 * (`"line-chart/chart.ts"`, `"line-chart/axis.ts"`) and lands in a real
 * subfolder. The registry item's own file paths are the only thing that
 * decides the shape — this function just joins them onto the components root.
 */
export async function writeComponentFiles(
    item: RegistryItem,
    config: ComponentsConfig,
    projectRoot: string,
    options: { force?: boolean } = {},
): Promise<WriteResult> {
    const targetDir = path.resolve(projectRoot, config.paths.components);
    const written: string[] = [];
    const skipped: string[] = [];

    for (const file of item.files) {
        const dest = path.join(targetDir, file.path);
        if (fs.existsSync(dest) && !options.force) {
            const { overwrite } = await prompts({
                type: 'confirm',
                name: 'overwrite',
                message: `${path.relative(projectRoot, dest)} already exists. Overwrite?`,
                initial: false,
            });
            if (!overwrite) {
                skipped.push(dest);
                continue;
            }
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, file.content);
        written.push(dest);
    }
    return { written, skipped };
}

/** Merge every installed item's npm `dependencies` ("pkg@range" strings) into one deduped map. */
export function collectDependencies(items: RegistryItem[]): Record<string, string> {
    const deps: Record<string, string> = {};
    for (const item of items) {
        for (const spec of item.dependencies ?? []) {
            const at = spec.lastIndexOf('@');
            // A spec always has a version after the last "@" (a scoped package
            // has an earlier "@" too, e.g. "@lezer/javascript@^1.5.4") — bail
            // rather than silently mis-splitting an unexpected shape.
            if (at <= 0) throw new Error(`Invalid dependency spec (expected "pkg@range"): ${spec}`);
            deps[spec.slice(0, at)] = spec.slice(at + 1);
        }
    }
    return deps;
}
