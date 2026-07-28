import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCanvasKit } from "@motion-script/web";
import type { PrecompCache, PrecompProfile } from "@motion-script/core";

type CanvasKitInstance = Awaited<ReturnType<typeof getCanvasKit>>;

type MotionScriptContextValue = {
    /** The loaded CanvasKit instance, or `null` until initialization completes. */
    canvasKit: CanvasKitInstance | null;
    /** Whether {@link CanvasKitInstance} has finished loading and is ready to use. */
    isInitialized: boolean;
    /** Optional store of previously-measured scene passes; see {@link Props.precompCache}. */
    precompCache?: PrecompCache;
    /** Optional timing sink for the precomp pass; see {@link Props.precompProfile}. */
    precompProfile?: PrecompProfile;
};

const MotionScriptContext = createContext<MotionScriptContextValue | null>(null);

type Props = {
    /** Optional URL to the CanvasKit `.wasm` binary, forwarded to `getCanvasKit`. */
    wsmUrl?: string;
    /**
     * Optional store letting an unchanged scene skip its precomp pass entirely.
     *
     * Measuring a scene means driving its generator to completion — tens of
     * thousands of frames on a long project, producing the same answer every time.
     * A host that can persist those answers and tell when they are stale (the Vite
     * dev server does, via a project-local file keyed on source hashes) can hand
     * one in here and make repeat startups nearly free.
     *
     * Supplied through the provider rather than as a `MotionPlayer` prop because
     * it is a shared runtime dependency, like the CanvasKit instance: every player
     * in a tree should share one store.
     */
    precompCache?: PrecompCache;
    /**
     * Optional timing sink recording where the precomp pass spends its time,
     * broken down by the per-frame phases it walks. Diagnostics only — nothing in
     * the engine reads it, and leaving it unset costs a never-taken branch.
     *
     * Build one with `createPrecompProfile()` and read `PrecompResult.timings`.
     */
    precompProfile?: PrecompProfile;
    children: ReactNode;
};

/**
 * Loads CanvasKit once and shares it with descendants via context.
 *
 * Must wrap any tree that renders {@link MotionPlayer}, since the player
 * reads its CanvasKit instance from this provider through {@link useMotionScript}.
 */
export function MotionScriptProvider({ wsmUrl, precompCache, precompProfile, children }: Props) {
    const [canvasKit, setCanvasKit] = useState<CanvasKitInstance | null>(null);

    useEffect(() => {
        let cancelled = false;
        getCanvasKit(wsmUrl)
            .then((ck) => {
                if (!cancelled) setCanvasKit(ck);
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [wsmUrl]);

    return (
        <MotionScriptContext.Provider value={{ canvasKit, isInitialized: canvasKit !== null, precompCache, precompProfile }}>
            {children}
        </MotionScriptContext.Provider>
    );
}

/**
 * Reads the CanvasKit instance and readiness state from the nearest
 * {@link MotionScriptProvider}.
 *
 * @throws If called outside a {@link MotionScriptProvider}.
 */
export function useMotionScript(): MotionScriptContextValue {
    const ctx = useContext(MotionScriptContext);
    if (!ctx) {
        throw new Error("useMotionScript must be used inside a MotionScriptProvider");
    }
    return ctx;
}
