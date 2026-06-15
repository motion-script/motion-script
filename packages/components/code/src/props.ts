import { PaddingProps, NodeProps } from '@motion-script/core';
import { CodeTheme } from './style';

export interface CodeProps extends NodeProps {
    code: string;
    language: string;
    fontSize: number;
    fontFamily: string;
    /** A built-in/registered theme name (e.g. `'github-dark'`), or a {@link CodeHighlightStyle} object. */
    theme: CodeTheme;
    lineHeight: number;
    letterSpacing: number;
    showLineNumbers: boolean;
    lineNumberGap: number;
    padding: PaddingProps;
}
