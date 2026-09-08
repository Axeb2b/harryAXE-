import { useEffect, useRef, useState } from "react";

// Lightweight polling hook — plain setInterval + console-visible pause.
// Mirrors the pure panel's setInterval polling (no react-query, no websockets).
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 3000,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      if (document.hidden) return; // pause in background
      try {
        const d = await fnRef.current();
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(e?.message || "fetch failed");
      } finally {
        if (alive) setLoading(false);
      }
    };
    tick();
    timer = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  const refetch = async () => {
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "fetch failed");
    }
  };

  return { data, error, loading, refetch };
}
