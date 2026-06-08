import { createContext, useContext, useRef, useEffect } from "react";
import type React from "react";
import { useStore, type StoreApi } from "zustand";

import { AssetManifest, ProjectConfig } from "@motion-script/core";
import type { FrameHandle } from "@motion-script/react";
import { createEditorStore, EditorState } from "@/stores/editor-store";

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
