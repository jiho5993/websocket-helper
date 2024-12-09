export function isArray(t: unknown, minimalItemCount = 0): boolean {
  return Array.isArray(t) && t.length >= minimalItemCount;
}

export function isFullArray(t: unknown): boolean {
  return isArray(t, 1);
}
