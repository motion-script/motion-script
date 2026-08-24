import fs from 'node:fs';
import path from 'node:path';
import type { ComponentsConfig } from './schema.js';

export const COMPONENTS_CONFIG_FILENAME = 'components.json';

/** The registry bare (unnamespaced) component names resolve against, e.g. `ms add code`. */
export const DEFAULT_REGISTRY_URL = 'https://motionscript.dev/r';

export const DEFAULT_COMPONENTS_ALIAS = '@/components';
export const DEFAULT_COMPONENTS_PATH = 'src/components';

export function componentsConfigExists(projectRoot: string): boolean {
    return fs.existsSync(path.join(projectRoot, COMPONENTS_CONFIG_FILENAME));
}

/**
 * Load `components.json` from a project root. Returns null when absent,
 * mirroring how the vite-plugin/CLI probe for `src/project.ts` elsewhere —
 * presence, not requirement, since most commands treat this file as optional
 * context rather than something every project must have.
 */
export function loadComponentsConfig(projectRoot: string): ComponentsConfig | null {
    const configPath = path.join(projectRoot, COMPONENTS_CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as ComponentsConfig;
}

/** Write `components.json`, pretty-printed like the toolchain's other generated JSON files. */
export function writeComponentsConfig(projectRoot: string, config: ComponentsConfig): void {
    const configPath = path.join(projectRoot, COMPONENTS_CONFIG_FILENAME);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export function defaultComponentsConfig(overrides?: Partial<Pick<ComponentsConfig, 'project'>>): ComponentsConfig {
    return {
        $schema: 'https://motionscript.dev/schema/components.json',
        project: overrides?.project ?? 'src/project.ts',
        aliases: { components: DEFAULT_COMPONENTS_ALIAS },
        paths: { components: DEFAULT_COMPONENTS_PATH },
    };
}
