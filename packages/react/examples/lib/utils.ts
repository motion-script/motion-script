

export function formatNumber(x: number): string {
    return Number.isInteger(x)
        ? x.toString()
        : x.toFixed(2).replace(/\.?0+$/, "");
}

export function formatPercent(x: number): string {
    return formatNumber(x * 100) + "%";
}

export function formatAngle(x: number): string {
    return formatNumber(x) + "°";
}