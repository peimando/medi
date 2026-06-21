import { useState, useEffect } from "react";
import { apiFetch } from "../hooks/useApi";
import { PageSkeleton } from "../components/Spinner";

export default function AnalyticsView({ config, toast, setView, logout }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/analytics/daily');
      setData(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totals = data ? {
    total:     data.reduce((a, s) => a + parseInt(s.total || 0), 0),
    waiting:   data.reduce((a, s) => a + parseInt(s.waiting || 0), 0),
    serving:   data.reduce((a, s) => a + parseInt(s.serving || 0), 0),
    completed: data.reduce((a, s) => a + parseInt(s.completed || 0), 0),
    absent:    data.reduce((a, s) => a + parseInt(s.absent || 0), 0),
  } : null;

  const noShowPct = totals && totals.total > 0 ? ((totals.absent / totals.total) * 100).toFixed(1) : '0.0';
  const avgWait   = data?.length ? (data.reduce((a, s) => a + parseFloat(s.avg_wait_min || 0), 0) / data.filter(s => s.avg_wait_min).length || 0).toFixed(0) : '—';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center">
              <span className="text-lg">📊</span>
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Dashboard Gerencial</h2>
              <p className="text-xs text-gray-400">{config?.hospitalName} &middot; {new Date().toLocaleDateString('es-CL')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('home')} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-800 transition flex items-center gap-1">← Volver</button>
            <button onClick={load} disabled={loading} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm transition disabled:opacity-50">{loading ? '...' : '🔄'}</button>
            <button onClick={async () => { await logout(); setView('home'); }} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 transition">Salir</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {loading && <PageSkeleton />}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
        )}

        {totals && !loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { l: 'Total hoy',   v: totals.total,     c: 'bg-accent-500' },
                { l: 'En espera',   v: totals.waiting,   c: 'bg-amber-500' },
                { l: 'En servicio', v: totals.serving,   c: 'bg-sky-500' },
                { l: 'Completados', v: totals.completed, c: 'bg-emerald-600' },
                { l: 'Ausentes',    v: totals.absent,    c: 'bg-red-500' },
              ].map(k => (
                <div key={k.l} className={`${k.c} text-white rounded-2xl p-4 shadow-sm`}>
                  <p className="text-3xl font-black">{k.v}</p>
                  <p className="text-xs opacity-80 mt-1">{k.l}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-5">
                <p className="font-bold text-gray-700 mb-4">Por Servicio</p>
                <div className="space-y-3">
                  {data?.map(s => {
                    const pct = totals.total > 0 ? (parseInt(s.total) / totals.total * 100) : 0;
                    return (
                      <div key={s.service_id} className="flex items-center gap-3">
                        <span className="text-sm w-28 text-gray-600 truncate">{s.icon} {s.service}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                        </div>
                        <span className="text-sm font-bold text-gray-700 w-6 text-right">{s.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card p-5">
                <p className="font-bold text-gray-700 mb-4">Indicadores Clave</p>
                <div className="space-y-3">
                  {[
                    { l: 'No-Show',     v: `${noShowPct}%`, ok: parseFloat(noShowPct) < 10, t: '< 10%' },
                    { l: 'Espera prom', v: `${avgWait} min`, ok: parseInt(avgWait) < 20 || avgWait === '—', t: '< 20 min' },
                  ].map(k => (
                    <div key={k.l} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                      <span className="text-sm text-gray-600">{k.l}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{k.v}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${k.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {k.ok ? '✓' : '✗'} {k.t}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {data?.filter(s => parseInt(s.total) > 0).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="font-bold text-gray-700 mb-2 text-sm">Detalle por Servicio</p>
                    <div className="space-y-2">
                      {data?.filter(s => parseInt(s.total) > 0).map(s => (
                        <div key={s.service_id} className="text-xs flex justify-between text-gray-500">
                          <span>{s.icon} {s.service}</span>
                          <span>{s.avg_wait_min ? `~${s.avg_wait_min} min prom` : '— sin datos'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
