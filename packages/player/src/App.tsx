
import { MotionScriptProvider } from '@motion-script/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from './providers/theme-provider';
import { EditorStoreProvider } from './providers/editor-provider';
import { AssetManifest, ProjectConfig, PrecompCache, PrecompProfile } from '@motion-script/core';
import { EditorLayout } from '@/components/layout/editor-layout';



export function PlayerApp(props: {
  config: ProjectConfig,
  wasmUrl: string,
  assets?: AssetManifest,
  /**
   * Optional store of previously-measured scene passes, letting an unchanged
   * scene skip its precomp entirely. Supplied by the dev server; absent when the
   * player is embedded without one.
   */
  precompCache?: PrecompCache,
  /** Optional timing sink for the precomp pass. Diagnostics only. */
  precompProfile?: PrecompProfile,
}) {

  return (
    <MotionScriptProvider
      wsmUrl={props.wasmUrl}
      precompCache={props.precompCache}
      precompProfile={props.precompProfile}
    >
      <EditorStoreProvider config={props.config} assets={props.assets} >
        <TooltipProvider>
          <ThemeProvider defaultTheme={'dark'} storageKey="motion-script-theme">
            <EditorLayout />
          </ThemeProvider>
        </TooltipProvider>
      </EditorStoreProvider>
    </MotionScriptProvider>

  );
}
