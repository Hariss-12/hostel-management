import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';

// GET a URL and keep { data, loading, error, reload } in state
export default function useFetch(url, params, enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const key = JSON.stringify(params || {});

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(url, { params: JSON.parse(key) });
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [url, key, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
