export function handleRequest(input: string): string {
  if (input.length === 0) return "empty";
  return input.trim();
}
