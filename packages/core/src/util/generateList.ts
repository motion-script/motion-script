/**
 * Generates an array of size `n` populated by a generator function.
 * Mirrored after Dart's List.generate.
 */
export const generateList = <T>(n: number, generator: (index: number) => T): T[] => {
  // Use a traditional loop for maximum performance inside animation/render cycles
  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = generator(i);
  }
  return result;
};
