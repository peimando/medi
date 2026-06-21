const API_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(msg, status, code) { super(msg); this.status = status; this.code = code; }
}

export const apiFetch = async (path, opts = {}, retries = 1) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('mq_token') : null;
  try {
    const isFormData = opts.body instanceof FormData;
    const res = await fetch(`${API_URL}${path}`, {
      ...opts, signal: ctrl.signal,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('mq_token');
        window.dispatchEvent(new Event('auth:expired'));
      }
      throw new ApiError(body.error || 'Error del servidor', res.status, body.code || 'ERROR');
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('Tiempo de espera agotado', 408, 'TIMEOUT');
    if (retries > 0 && !(err instanceof ApiError)) {
      await new Promise(r => setTimeout(r, 1000));
      return apiFetch(path, opts, retries - 1);
    }
    throw err;
  } finally { clearTimeout(timer); }
};
