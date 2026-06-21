import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "./useApi";

export default function useConfig() {
  const [config, setConfig]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch('/api/config/public');
      setConfig(data);
    } catch (e) {
      setError(e.message);
      setConfig({ services: [], patientTypes: [], hospitalName: 'Hospital', _fallback: true });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { config, loading, error, reload: load };
}
