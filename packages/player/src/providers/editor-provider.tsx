import { createContext, useContext, useRef, useEffect } from "react";
import type React from "react";
import { useStore, type StoreApi } from "zustand";

import { AssetManifest, ProjectConfig, Scene } from "@motion-script/core";
import type { FrameHandle } from "@motion-script/react";
import { createEditorStore, EditorState } from "@/stores/editor-store";

declare global {
    interface Window {
        /**
         * Installed by the player; called by the dev-server `?scene` HMR wrapper
         * with a freshly-edited scene instance to swap in place. Absent outside
         * the player (e.g. headless export).
         */
        __motionScriptSceneHot?: (scene: Scene) => void;
    }
}

const EditorStoreContext = createContext<StoreApi<EditorState> | null>(null);

export function EditorStoreProvider({
    config,
    assets,
    children,
}: {
    config: ProjectConfig;
    assets?: AssetManifest;
    children: React.ReactNode;
}) {
    const storeRef = useRef<StoreApi<EditorState> | null>(null);

    if (!storeRef.current) {
        storeRef.current = createEditorStore(config, assets);
    }

    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        storeRef.current!.getState().resetConfig(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    // Expose the per-scene hot-reload entry point to the dev-server `?scene`
    // wrapper. Editing a scene file calls window.__motionScriptSceneHot(scene),
    // which routes the fresh instance to the store's in-place swap.
    useEffect(() => {
        const store = storeRef.current!;
        window.__motionScriptSceneHot = (scene) => store.getState().hotReplaceScene(scene);
        return () => { delete window.__motionScriptSceneHot; };
    }, []);

    return (
        <EditorStoreContext.Provider value={storeRef.current}>
            {children}
        </EditorStoreContext.Provider>
    );
}

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
    const store = useContext(EditorStoreContext);
    if (!store) {
        throw new Error("useEditorStore must be used within EditorStoreProvider");
    }
    return useStore(store, selector);
}

const FrameHandleRefContext = createContext<React.RefObject<FrameHandle | null> | null>(null);

export function FrameHandleProvider({
    frameRef,
    children,
}: {
    frameRef: React.RefObject<FrameHandle | null>;
    children: React.ReactNode;
}) {
    return (
        <FrameHandleRefContext.Provider value={frameRef}>
            {children}
        </FrameHandleRefContext.Provider>
    );
}

export function useFrameHandleRef(): React.RefObject<FrameHandle | null> | null {
    return useContext(FrameHandleRefContext);
}
