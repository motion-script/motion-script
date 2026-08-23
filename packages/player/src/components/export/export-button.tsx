import { useEffect, useRef, useState } from "react";
import type { UseExportReturn } from "./use-export";

type ExportButtonProps = {
    exportState: UseExportReturn;
    onOpenDialog: () => void;
};

export function ExportButton({ exportState, onOpenDialog }: ExportButtonProps) {
    const { status, totalProgress } = exportState;
    const [showFinished, setShowFinished] = useState(false);
    const finishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (status === "finished") {
            setShowFinished(true);
            finishedTimerRef.current = setTimeout(() => {
                setShowFinished(false);
            }, 3000);
        } else {
            setShowFinished(false);
            if (finishedTimerRef.current) {
                clearTimeout(finishedTimerRef.current);
                finishedTimerRef.current = null;
            }
        }
        return () => {
            if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
        };
    }, [status]);

    const isExporting = status === "exporting";
    const pct = Math.round(totalProgress * 100);

    let label: string;
    if (showFinished) {
        label = "Finished";
    } else if (isExporting) {
        label = `${pct}%`;
    } else {
        label = "Export";
    }

    return (
        <button
            onClick={onOpenDialog}
            className="relative flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer overflow-hidden"
            style={{ minWidth: 64 }}
        >
            {/* Progress fill behind label */}
            {isExporting && (
                <div
                    className="absolute inset-0 bg-primary-foreground/20 transition-[width] duration-150"
                    style={{ width: `${pct}%` }}
                />
            )}


            <svg className="relative z-10 size-5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.5 19H17C19.7614 19 22 16.7614 22 14V9C22 6.23858 19.7614 4 17 4H7.5C4.73858 4 2.5 6.23858 2.5 9V10V14C2.5 16.7614 4.73858 19 7.5 19H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M2.5 10H10.5M22 10H17M17 10L13 4M17 10H10.5M10.5 10L6.5 4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12.5 20V13.5M9.5 16.5L12.5 13.5L15.5 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="relative z-10">{label}</span>
        </button>
    );
}
