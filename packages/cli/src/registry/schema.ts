// Types for the Motion Script component registry protocol: the shape a
// `components.json` file and a fetched registry's JSON responses take.
// Modeled directly on shadcn/ui's registry protocol (registries are
// namespace-keyed remote sources of copyable component source), verified
// against their published schema.

/** A single entry in a registry's index (`registry.json`). */
export interface RegistryIndexEntry {
    name: string;
    type: 'registry:component';
    description?: string;
}

/** One file belonging to a registry item, with its content inlined. */
export interface RegistryFile {
    /** Path relative to the component's own directory, e.g. "node.ts". */
    path: string;
    content: string;
}

/** A single installable component, as returned by `<registry>/<name>.json`. */
export interface RegistryItem {
    name: string;
    type: 'registry:component';
    description?: string;
    /** npm dependencies this item needs, as "pkg@range" strings. */
    dependencies?: string[];
    /** Other registry item names this item depends on, resolved recursively. */
    registryDependencies?: string[];
    files: RegistryFile[];
}

/** A single configured registry: a URL template plus optional auth. */
export interface RegistryConfig {
    /** URL template containing a literal "{name}" placeholder. */
    url: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
}

/** The `components.json` file written to a project's root. */
export interface ComponentsConfig {
    $schema?: string;
    project: string;
    aliases: { components: string };
    paths: { components: string };
    /**
     * Additional/private registries, keyed by "@namespace" (e.g. "ms add
     * @acme/button" looks up `registries["@acme"]`). The default
     * (unnamespaced) registry is never configured here — see
     * DEFAULT_REGISTRY_URL in ./config.ts — matching shadcn's own
     * components.json, whose `registries` field is schema-constrained to
     * "^@"-prefixed keys only.
     */
    registries?: Record<string, string | RegistryConfig>;
}
