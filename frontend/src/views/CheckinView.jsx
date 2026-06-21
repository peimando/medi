import { useState, useEffect } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading } from "../hooks/useUtils";
import { Btn } from "../components/Btn";

export default function CheckinView({ config, toast, setView, kioskSlug }) {
  const [form, setForm]     = useState({ name: '', phone: '', serviceId: '', type: 'walkin', smsConsent: false });
  const [errors, setErrors] = useState({});
  const [done, setDone]     = useState(null);
  const [apiErr, setApiErr] = useState(null);
  const { is, wrap }        = useLoading();

  const availableServices = (() => {
    if (!kioskSlug || !config?.kioskConfigs) return config?.services || [];
    const kiosk = config.kioskConfigs.find(k => k.slug === kioskSlug);
    if (!kiosk) return config?.services || [];
    return (config?.services || []).filter(s => kiosk.service_ids.includes(s.id));
  })();

  useEffect(() => {
    if (availableServices.length && !form.serviceId) {
      setForm(f => ({ ...f, serviceId: String(availableServices[0].id) }));
    }
  }, [availableServices]);

  const validate = () => {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 3) e.name = 'Minimo 3 caracteres';
    if (form.phone && !/^\+?[0-9]{8,15}$/.test(form.phone.replace(/\s/g, ''))) e.phone = 'Telefono invalido';
    if (form.phone && !form.smsConsent) e.smsConsent = 'Debes aceptar el uso del telefono';
    return e;
  };

  const submit = wrap('register', async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({}); setApiErr(null);
    const data = await apiFetch('/api/patients', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone || null,
        serviceId: parseInt(form.serviceId),
        type: form.type,
        smsConsent: form.smsConsent,
      }),
    });
    const svc = availableServices.find(s => s.id === parseInt(form.serviceId));
    setDone({ ...data.patient, serviceName: svc?.name, serviceColor: svc?.color, serviceIcon: svc?.icon });
    toast.success(`Ticket ${data.patient.ticketCode} generado`);
  });

  if (done) return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center p-4">
      <div className="card p-8 max-w-sm w-full text-center animate-slide-up">
        <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-2xl flex items-center justify-center">
          <span className="text-3xl">🎫</span>
        </div>
        <h2 className="text-xl font-bold text-emerald-700 mb-4">Registro Exitoso</h2>
        <div className="bg-gray-50 rounded-2xl p-6 mb-5 border-2 border-dashed border-gray-200">
          <p className="text-gray-400 text-xs mb-1 uppercase tracking-widest">Tu Turno</p>
          <p className="text-5xl font-black text-gray-800 mb-2">{done.ticketCode}</p>
          <p className="text-gray-600 font-semibold">{done.serviceName}</p>
        </div>
        <div className="space-y-2 text-sm text-left mb-5">
          {done.estimatedWait > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-3">
              <span className="text-xl">⏱️</span>
              <div>
                <p className="font-semibold text-blue-800">Espera estimada</p>
                <p className="text-blue-600">~{done.estimatedWait} minutos</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 bg-purple-50 rounded-xl p-3">
            <span className="text-xl">💡</span>
            <p className="text-purple-700 text-xs">Te avisaremos cuando sea tu turno en la pantalla.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setDone(null); setForm({ name: '', phone: '', serviceId: String(config.services?.[0]?.id || ''), type: 'walkin', smsConsent: false }); }}
            className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition">
            + Nuevo
          </button>
          <button onClick={() => setView('home')}
            className="py-2.5 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-semibold text-sm transition">
            Inicio
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setView('home')} className="text-gray-400 hover:text-gray-600 p-1">←</button>
            <div>
              <h2 className="font-bold text-gray-900">{kioskSlug ? 'Kiosko' : 'Registro de Paciente'}</h2>
              <p className="text-xs text-gray-400">{config?.hospitalName}{kioskSlug ? ` · ${config?.kioskConfigs?.find(k => k.slug === kioskSlug)?.name || ''}` : ''}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4">
        <div className="card p-6">
          {apiErr && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4 flex items-start gap-2">
              <span className="mt-0.5">✕</span>
              <span>{apiErr}</span>
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-4">
            <div>
              <label className="label">Nombre Completo</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Juan Garcia"
                className={`input ${errors.name ? 'input-error' : ''}`} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="label">Telefono (opcional)</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+56 9 1234 5678"
                className={`input ${errors.phone ? 'input-error' : ''}`} />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="label">Servicio</label>
              <select value={form.serviceId} onChange={e => setForm(f => ({ ...f, serviceId: e.target.value }))}
                className="input">
                {availableServices.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Tipo de Consulta</label>
              <div className="grid grid-cols-3 gap-2">
                {config?.patientTypes?.map(t => (
                  <button key={t.code} type="button" onClick={() => setForm(f => ({ ...f, type: t.code }))}
                    className={`border-2 rounded-xl py-2.5 px-1 text-xs font-semibold transition`}
                    style={form.type === t.code
                      ? { borderColor: t.color, backgroundColor: t.color + '15', color: t.color }
                      : { borderColor: '#e5e7eb', color: '#9ca3af' }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {form.phone && (
              <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition
                ${errors.smsConsent ? 'border-red-300 bg-red-50' : 'border-accent-200 bg-accent-50 hover:bg-accent-100'}`}>
                <input type="checkbox" checked={form.smsConsent}
                  onChange={e => setForm(f => ({ ...f, smsConsent: e.target.checked }))}
                  className="mt-0.5 accent-accent-500" />
                <span className="text-xs text-accent-800 leading-relaxed">
                  Acepto usar mi telefono para notificaciones de turno (Ley 21.719)
                </span>
              </label>
            )}
            {errors.smsConsent && <p className="text-xs text-red-500 -mt-2">{errors.smsConsent}</p>}

            <Btn type="submit" loading={is('register')} className="w-full justify-center py-3">
              Obtener Ticket 🎫
            </Btn>
          </form>
        </div>
      </div>
    </div>
  );
}
