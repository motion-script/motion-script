import React, { useId } from 'react';

export interface StripePatternProps extends React.SVGProps<SVGSVGElement> {
    /** * Tailwind classes to control size, color, and positioning.
     * Example: "w-full h-full text-slate-800 absolute inset-0"
     */
    className?: string;
    /** * Distance between each stripe in pixels. Default is 8. 
     */
    size?: number;
    /** * Thickness of the stripes in pixels. Default is 1. 
     */
    strokeWidth?: number;
    /** * Rotation angle of the stripes. Default is -45 (bottom-left to top-right).
     */
    angle?: number;
}

export function StripePattern({
    className = '',
    size = 8,
    strokeWidth = 1,
    angle = -45,
    ...props
}: StripePatternProps) {
    // useId ensures unique pattern IDs if multiple instances render on the same page
    const patternId = useId();

    // Offset the stroke by half its width to prevent SVG clipping at the pattern edges
    const offset = strokeWidth / 2;

    return (
        <svg
            className={`pointer-events-none ${className}`}
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            <defs>
                <pattern
                    id={patternId}
                    width={size}
                    height={size}
                    patternUnits="userSpaceOnUse"
                    patternTransform={`rotate(${angle})`}
                >
                    <line
                        x1={offset}
                        y1="0"
                        x2={offset}
                        y2={size}
                        // currentColor allows you to color the stripes via Tailwind text-* classes
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                    />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        </svg>
    );
}
