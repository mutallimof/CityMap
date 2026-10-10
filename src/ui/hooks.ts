import { useEffect, useState } from 'react';

/** Re-render every `ms` (live countdowns, clock). */
export function useTicker(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
