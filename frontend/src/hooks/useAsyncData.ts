import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: string;
}

interface UseAsyncDataOptions {
  /** Delay before firing, useful for search-as-you-type. */
  debounceMs?: number;
  /** Skip fetching entirely, e.g. until a prerequisite id is known. */
  enabled?: boolean;
}

/**
 * Loads data on mount and whenever `deps` change, tracking loading and error
 * state. Responses from superseded requests are discarded, so a slow reply to
 * an old search term can never overwrite a newer one.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  { debounceMs = 0, enabled = true }: UseAsyncDataOptions = {},
) {
  const [state, setState] = useState<AsyncDataState<T>>({
    data: null,
    loading: enabled,
    error: '',
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const requestId = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);

  const run = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setState((previous) => ({ ...previous, loading: true, error: '' }));

    try {
      const data = await fetcherRef.current();
      if (currentRequest !== requestId.current) return;
      setState({ data, loading: false, error: '' });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Something went wrong.',
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: '' });
      return;
    }

    if (debounceMs <= 0) {
      void run();
      return;
    }

    const handle = window.setTimeout(() => void run(), debounceMs);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, enabled, debounceMs, reloadToken, ...deps]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const setData = useCallback((updater: (current: T | null) => T | null) => {
    setState((previous) => ({ ...previous, data: updater(previous.data) }));
  }, []);

  return { ...state, reload, setData };
}
