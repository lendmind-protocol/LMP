export function classify(value: number): string {
  if (value < 0) return "negative";
  if (value === 0) return "zero";
  if (value < 10) return "small";
  if (value < 100) return "medium";
  return "large";
}
