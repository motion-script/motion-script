
import { MotionScriptProvider } from '@motion-script/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from './providers/theme-provider';
import { EditorStoreProvider } from './providers/editor-provider';
import { AssetManifest, ProjectConfig } from '@motion-script/core';
import { EditorLayout } from '@/components/layout/editor-layout';



export function PlayerApp(props: { config: ProjectConfig, wasmUrl: string, assets?: AssetManifest }) {

  return (
    <MotionScriptProvider
      wsmUrl={props.wasmUrl}
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
