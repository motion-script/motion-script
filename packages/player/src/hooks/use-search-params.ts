import { useCallback, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// useSearchParams
// ---------------------------------------------------------------------------
// Minimal, router-free replacement for react-router's useSearchParams. The
// player is a single page, so we don't need a router — we just need to read
// and write the URL query string (?node=, ?scene=) and re-render on change.
//
// API surface matches the subset of react-router we use:
//   const [params, setParams] = useSearchParams();
//   params.get("node");
//   setParams(p => { p.set("node", id); return p; }, { replace: true });

type SetSearchParams = (
  next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
  options?: { replace?: boolean },
) => void;

// Track in-app navigations (pushState/replaceState don't emit popstate) so the
// hook re-renders when we change the query string ourselves.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

function getSnapshot(): string {
  return window.location.search;
}

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const search = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const searchParams = new URLSearchParams(search);

  const setSearchParams = useCallback<SetSearchParams>((next, options) => {
    const current = new URLSearchParams(window.location.search);
    const updated =
      typeof next === "function" ? next(current) : next;
    const queryString = updated.toString();
    const url =
      window.location.pathname +
      (queryString ? `?${queryString}` : "") +
      window.location.hash;
    if (options?.replace) {
      window.history.replaceState(window.history.state, "", url);
    } else {
      window.history.pushState(window.history.state, "", url);
    }
    notify();
  }, []);

  return [searchParams, setSearchParams];
}
