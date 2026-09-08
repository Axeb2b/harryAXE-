import { useEffect, useRef, useState } from "react";

// Lightweight polling hook with live syncing state indicators.
// Mirrors the pure panel's setInterval polling with real-time feedback.
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 3000,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      if (document.hidden) return; // pause in background
      if (alive) setIsSyncing(true);
      try {
        const d = await fnRef.current();
        if (alive) {
          setData(d);
          setError(null);
          setLastSyncTime(Date.now());
        }
      } catch (e: any) {
        if (alive) setError(e?.message || "fetch failed");
      } finally {
        if (alive) {
          setLoading(false);
          // Keep the live pulse active briefly so users visually notice the sync pulse
          setTimeout(() => {
            if (alive) setIsSyncing(false);
          }, 900);
        }
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
    setIsSyncing(true);
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
      setLastSyncTime(Date.now());
    } catch (e: any) {
      setError(e?.message || "fetch failed");
    } finally {
      setTimeout(() => setIsSyncing(false), 900);
    }
  };

  return { data, error, loading, isSyncing, lastSyncTime, refetch };
}

