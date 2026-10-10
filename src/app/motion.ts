/** Reduce-motion: the OS setting, overridable with ?motion=reduced / ?motion=full. */
export function prefersReducedMotion(): boolean {
  const q = new URLSearchParams(location.search).get('motion');
  if (q === 'reduced') return true;
  if (q === 'full') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
