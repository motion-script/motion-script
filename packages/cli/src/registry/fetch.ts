import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComponentsConfig, RegistryConfig, RegistryIndexEntry, RegistryItem } from './schema.js';
import { DEFAULT_REGISTRY_URL } from './config.js';

function isRemote(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

/** Expand `${VAR}` references in a string against `process.env`, e.g. in a header value. */
function interpolateEnv(value: string): string {
    return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (match, name: string) => process.env[name] ?? match);
}

function interpolateHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!headers) return undefined;
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, interpolateEnv(value)]));
}

function joinRegistryPath(base: string, file: string): string {
    return isRemote(base) ? `${base.replace(/\/$/, '')}/${file}` : path.join(base, file);
}

/** Split "@acme/button" into its namespace and item name; a bare "code" returns null. */
function splitNamespacedName(name: string): { namespace: string; itemName: string } | null {
    const match = /^(@[^/]+)\/(.+)$/.exec(name);
    return match ? { namespace: match[1], itemName: match[2] } : null;
}

function lookupNamespacedRegistry(namespace: string, config: ComponentsConfig | null): RegistryConfig {
    const entry = config?.registries?.[namespace];
    if (!entry) {
        throw new Error(`Unknown registry namespace "${namespace}" — add it under "registries" in components.json.`);
    }
    const registryConfig: RegistryConfig = typeof entry === 'string' ? { url: entry } : entry;
    if (!registryConfig.url.includes('{name}')) {
        throw new Error(`Registry "${namespace}" URL must contain a literal "{name}" placeholder.`);
    }
    return registryConfig;
}

export interface ResolvedRegistryTarget {
    url: string;
    headers?: Record<string, string>;
    /** The bare item name with any namespace prefix stripped. */
    itemName: string;
}

/**
 * Resolve a (possibly namespaced) component name to its item URL, headers,
 * and bare item name. Exported (not just used internally by
 * {@link fetchRegistryItem}) so URL templating and `${VAR}` header
 * interpolation can be unit-tested without a real network call.
 */
export function resolveItemUrl(
    name: string,
    config: ComponentsConfig | null,
    defaultRegistryUrl: string = DEFAULT_REGISTRY_URL,
): ResolvedRegistryTarget {
    const namespaced = splitNamespacedName(name);
    if (!namespaced) {
        return { url: joinRegistryPath(defaultRegistryUrl, `${name}.json`), itemName: name };
    }
    const registryConfig = lookupNamespacedRegistry(namespaced.namespace, config);
    return {
        url: registryConfig.url.replace('{name}', namespaced.itemName),
        headers: interpolateHeaders(registryConfig.headers),
        itemName: namespaced.itemName,
    };
}

/**
 * Read a registry URL's JSON content. Remote (`http(s)://`) URLs are
 * fetched; anything else is treated as a local filesystem path (a bare path
 * or a `file:` URL) and read directly. This isn't just a testing
 * convenience — it's genuinely how a private/unpublished registry is
 * served, and it's how this monorepo's own template/e2e packages populate
 * themselves from a locally-built `packages/site/public/r` without needing
 * a deployed site.
 */
export async function readRegistrySource(url: string, headers?: Record<string, string>): Promise<unknown> {
    if (isRemote(url)) {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    const filePath = url.startsWith('file:') ? fileURLToPath(url) : url;
    if (!fs.existsSync(filePath)) {
        throw new Error(`Registry source not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function assertRegistryItem(data: unknown, name: string): asserts data is RegistryItem {
    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as { files?: unknown }).files)
    ) {
        throw new Error(`Malformed registry item for "${name}" (expected an object with a "files" array).`);
    }
}

export async function fetchRegistryIndex(defaultRegistryUrl: string = DEFAULT_REGISTRY_URL): Promise<RegistryIndexEntry[]> {
    const data = await readRegistrySource(joinRegistryPath(defaultRegistryUrl, 'registry.json'));
    if (!Array.isArray(data)) {
        throw new Error('Malformed registry index (expected an array).');
    }
    return data as RegistryIndexEntry[];
}

export async function fetchRegistryItem(
    name: string,
    config: ComponentsConfig | null,
    defaultRegistryUrl: string = DEFAULT_REGISTRY_URL,
): Promise<RegistryItem> {
    const { url, headers, itemName } = resolveItemUrl(name, config, defaultRegistryUrl);
    const data = await readRegistrySource(url, headers);
    assertRegistryItem(data, itemName);
    return data;
}
