/**
 * Lerp between two strings by holding the longest common prefix and suffix
 * fixed, then shrinking the differing middle of `from` to empty and growing
 * it back as the middle of `to`. Degenerates to a single phase for pure
 * append/prepend/truncate cases.
 */
export function lerpText(from: string, to: string, t: number): string {
    if (t <= 0) return from;
    if (t >= 1) return to;

    let pre = 0;
    const maxPre = Math.min(from.length, to.length);
    while (pre < maxPre && from.charCodeAt(pre) === to.charCodeAt(pre)) pre++;

    let suf = 0;
    const maxSuf = Math.min(from.length - pre, to.length - pre);
    while (
        suf < maxSuf &&
        from.charCodeAt(from.length - 1 - suf) === to.charCodeAt(to.length - 1 - suf)
    ) suf++;

    const removeLen = from.length - pre - suf;
    const addLen = to.length - pre - suf;
    const totalLen = removeLen + addLen;
    if (totalLen === 0) return to;

    const prefix = from.substring(0, pre);
    const suffix = from.substring(from.length - suf);
    const split = removeLen / totalLen;

    if (t < split) {
        const localT = split === 0 ? 1 : t / split;
        const midLen = Math.round(removeLen * (1 - localT));
        return prefix + from.substring(pre, pre + midLen) + suffix;
    }
    const localT = split === 1 ? 1 : (t - split) / (1 - split);
    const midLen = Math.round(addLen * localT);
    return prefix + to.substring(pre, pre + midLen) + suffix;
}
