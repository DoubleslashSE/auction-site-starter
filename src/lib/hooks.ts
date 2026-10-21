import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { isSignedIn, onAuthChange } from "./auth";

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  /** Replaces the data without a request (live updates). */
  set: (update: (current: T | undefined) => T | undefined) => void;
}

/** Runs `load` when `deps` change; keeps the last data while reloading so pages do not flicker. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key?: string; data?: T; error?: unknown }>({});
  const key = JSON.stringify([...deps, version]);
  // Always the latest `load`, without making it a dependency (it is a new function every render).
  const run = useEffectEvent(() => load());

  useEffect(() => {
    let current = true;
    run().then(
      (data) => current && setResult({ key, data }),
      (error: unknown) => current && setResult((previous) => ({ key, data: previous.data, error })),
    );
    return () => {
      current = false;
    };
  }, [key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const set = useCallback((update: (current: T | undefined) => T | undefined) => setResult((r) => ({ ...r, data: update(r.data) })), []);
  return { data: result.data, error: result.error, loading: result.key !== key, reload, set };
}

/** Whether someone is signed in, kept current across sign-in and sign-out. */
export function useSignedIn(): boolean {
  return useSyncExternalStore(onAuthChange, isSignedIn, () => false);
}

/** The current time, every `ms` (for countdowns). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** Runs a command (a POST/PUT/DELETE), keeping its error and pending state for the form. */
export function useCommand() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const run = useCallback(async (command: () => Promise<unknown>): Promise<boolean> => {
    setPending(true);
    setError(undefined);
    try {
      await command();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setPending(false);
    }
  }, []);
  const clear = useCallback(() => setError(undefined), []);
  return { pending, error, run, clear };
}
