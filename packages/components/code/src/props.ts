import { PaddingProps, NodeProps } from '@motion-script/core';

export interface CodeProps extends NodeProps {
    code: string;
    language: string;
    fontSize: number;
    fontFamily: string;
    theme: string;
    lineHeight: number;
    letterSpacing: number;
    showLineNumbers: boolean;
    lineNumberGap: number;
    padding: PaddingProps;
}
