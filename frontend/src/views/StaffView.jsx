import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading } from "../hooks/useUtils";
import { Btn } from "../components/Btn";
import { Spinner } from "../components/Spinner";
import { ConfirmDialog } from "../components/ConfirmDialog";

const useConfirm = () => {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);
  const confirm = opts => new Promise(res => { resolveRef.current = res; setState(opts); });
  const ok  = () => { setState(null); resolveRef.current?.(true); };
  const nok = () => { setState(null); resolveRef.current?.(false); };
  return { confirm, state, ok, nok, ConfirmUI: <ConfirmDialog state={state} onConfirm={ok} onCancel={nok} /> };
};

export default function StaffView({ config, user, toast, setView, logout }) {
  const [svc, setSvc]         = useState(null);
  const [queue, setQueue]     = useState([]);
  const [serving, setServing] = useState(null);
  const [transferTo, setTTo]  = useState('');
  const [apiErr, setApiErr]   = useState(null);
  const { is, wrap }          = useLoading();
  const { confirm, ConfirmUI }= useConfirm();
  const visibleServices = useMemo(() => (
    user?.permissions?.all
      ? (config?.services || [])
      : (config?.services || []).filter(s => s.id === user?.service_id)
  ), [config?.services, user?.permissions?.all, user?.service_id]);

  useEffect(() => {
    if (visibleServices.length) {
      const defaultSvc = user?.service_id
        ? visibleServices.find(s => s.id === user.service_id) || visibleServices[0]
        : visibleServices[0];
      setSvc(defaultSvc);
    }
  }, [visibleServices, user]);

  const loadQueue = useCallback(async (serviceId) => {
    if (!serviceId) return;
    try {
      const data = await apiFetch(`/api/services/${serviceId}/queue`);
      setQueue(data.queue.filter(p => p.status === 'waiting'));
      setServing(data.queue.find(p => p.status === 'serving') || null);
    } catch (e) { setApiErr(e.message); }
  }, []);

  useEffect(() => {
    if (svc) {
      loadQueue(svc.id);
      const t = setInterval(() => loadQueue(svc.id), 5000);
      return () => clearInterval(t);
    }
  }, [svc, loadQueue]);

  const callNext = wrap('callNext', async () => {
    if (!queue.length) { toast.warn('No hay pacientes en espera'); return; }
    const data = await apiFetch(`/api/services/${svc.id}/call-next`, { method: 'POST' });
    toast.success(`Llamando: ${data.patient.ticket_code}`);
    await loadQueue(svc.id);
  });

  const complete = wrap('complete', async () => {
    if (!serving) { toast.warn('Sin paciente en servicio'); return; }
    await apiFetch(`/api/services/${svc.id}/complete/${serving.id}`, { method: 'POST' });
    toast.success(`Completado: ${serving.ticketCode}`);
    await loadQueue(svc.id);
  });

  const markAbsent = async () => {
    if (!serving) return;
    const ok = await confirm({ msg: `Marcar ${serving.ticketCode} como ausente?`, detail: 'El paciente perdera su turno.', confirmLabel: 'Marcar Ausente' });
    if (!ok) return;
    await wrap('absent', async () => {
      await apiFetch(`/api/services/${svc.id}/absent/${serving.id}`, { method: 'POST' });
      toast.warn(`${serving.ticketCode} marcado como ausente`);
      await loadQueue(svc.id);
    })();
  };

  const transfer = async () => {
    if (!serving || !transferTo) { toast.warn('Selecciona servicio destino'); return; }
    const toSvc = config.services.find(s => s.id === parseInt(transferTo));
    const ok = await confirm({ msg: `Transferir ${serving.ticketCode} a ${toSvc?.name}?`, detail: 'El paciente ira al final de la cola destino.', confirmLabel: 'Transferir', danger: false });
    if (!ok) return;
    await wrap('transfer', async () => {
      await apiFetch(`/api/patients/${serving.id}/transfer`, {
        method: 'POST', body: JSON.stringify({ fromService: svc.id, toService: parseInt(transferTo) }),
      });
      toast.success(`Transferido a ${toSvc?.name}`);
      setTTo(''); await loadQueue(svc.id);
    })();
  };

  if (!svc) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Spinner size="lg" color="border-accent-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {ConfirmUI}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <span className="text-lg">👨‍⚕️</span>
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Consola del Personal</h2>
              <p className="text-xs text-gray-400">{user?.name || user?.username} &middot; {user?.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => loadQueue(svc.id)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition text-sm">🔄</button>
            <button onClick={() => setView('home')} className="text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-xl transition">← Volver</button>
            <button onClick={async () => { await logout(); setView('home'); }} className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl transition">Salir</button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {apiErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 flex items-center justify-between">
            <span>{apiErr}</span>
            <button onClick={() => setApiErr(null)} className="text-red-400 hover:text-red-600 ml-3 font-bold">×</button>
          </div>
        )}

        <div className="card p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleServices.map(s => {
              const cnt = s.id === svc.id ? queue.length : null;
              return (
                <button key={s.id} onClick={() => { setSvc(s); setApiErr(null); }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition border-2
                    ${svc.id === s.id ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-transparent bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                  {s.icon} {s.name} {cnt !== null && <span className="opacity-60 text-xs ml-1">({cnt})</span>}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Btn onClick={async () => { try { setApiErr(null); await callNext(); } catch (e) { setApiErr(e.message); toast.error(e.message); } }}
              loading={is('callNext')} disabled={!queue.length} className="w-full justify-center">📞 Llamar</Btn>
            <Btn onClick={() => complete().catch(e => toast.error(e.message))}
              loading={is('complete')} disabled={!serving} variant="success" className="w-full justify-center">✓ Completar</Btn>
            <Btn onClick={markAbsent}
              loading={is('absent')} disabled={!serving} variant="warning" className="w-full justify-center">⚠ Ausente</Btn>
          </div>
        </div>

        {serving ? (
          <div className="bg-gradient-to-br from-accent-500 to-accent-700 rounded-2xl p-5 text-white shadow-md">
            <p className="text-accent-100 text-xs uppercase tracking-widest mb-2">En Atencion</p>
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-3xl font-black text-white mb-1">{serving.ticketCode}</p>
                {serving.name && <p className="text-accent-200 text-xs mb-1 font-mono">{serving.name}</p>}
                <p className="text-accent-100 text-sm">
                  {svc.name}
                  {serving.typeLabel && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-white/20">{serving.typeLabel}</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-accent-200">Espero</p>
                <p className="text-2xl font-bold">{Math.round(serving.waitMinutes || 0)} min</p>
              </div>
            </div>
            <div className="flex gap-2">
              <select value={transferTo} onChange={e => setTTo(e.target.value)}
                className="flex-1 bg-white/15 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30">
                <option value="" className="text-gray-700">Transferir a...</option>
                {config?.services?.filter(s => s.id !== svc.id).map(s => <option key={s.id} value={s.id} className="text-gray-700">{s.icon} {s.name}</option>)}
              </select>
              <Btn onClick={transfer} loading={is('transfer')} disabled={!transferTo} variant="ghost" className="px-4 bg-white/20 hover:bg-white/30 text-white border-0">➜</Btn>
            </div>
          </div>
        ) : (
          <div className="card border-dashed border-2 p-6 text-center">
            <p className="text-3xl mb-2">🪑</p>
            <p className="text-sm text-gray-500">
              {queue.length > 0 ? `${queue.length} paciente(s) esperando — presiona "Llamar"` : 'Cola vacia'}
            </p>
          </div>
        )}

        <div className="card p-4">
          <p className="font-bold text-sm text-gray-700 mb-3">{svc.name} — {queue.length} en espera</p>
          {queue.length === 0
            ? <p className="text-gray-400 text-sm text-center py-4">Sin pacientes en espera</p>
            : <div className="space-y-2">
              {queue.map((p, i) => (
                <div key={p.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between hover:bg-gray-100 transition">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono text-xs w-4">{i + 1}</span>
                    <span className="font-bold text-gray-800">{p.ticketCode}</span>
                    {p.name && <span className="text-xs text-gray-500 font-mono">{p.name}</span>}
                    {p.typeLabel && (
                      <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: p.typeColor + 'cc' }}>
                        {p.typeIcon} {p.typeLabel}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-xs">{Math.round(p.waitMinutes || 0)} min</span>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </div>
  );
}
