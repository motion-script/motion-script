import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCanvasKit } from "@motion-script/web";

type CanvasKitInstance = Awaited<ReturnType<typeof getCanvasKit>>;

type MotionScriptContextValue = {
    /** The loaded CanvasKit instance, or `null` until initialization completes. */
    canvasKit: CanvasKitInstance | null;
    /** Whether {@link CanvasKitInstance} has finished loading and is ready to use. */
    isInitialized: boolean;
};

const MotionScriptContext = createContext<MotionScriptContextValue | null>(null);

type Props = {
    /** Optional URL to the CanvasKit `.wasm` binary, forwarded to `getCanvasKit`. */
    wsmUrl?: string;
    children: ReactNode;
};

/**
 * Loads CanvasKit once and shares it with descendants via context.
 *
 * Must wrap any tree that renders {@link MotionPlayer}, since the player
 * reads its CanvasKit instance from this provider through {@link useMotionScript}.
 */
export function MotionScriptProvider({ wsmUrl, children }: Props) {
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
        <MotionScriptContext.Provider value={{ canvasKit, isInitialized: canvasKit !== null }}>
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
