import { useState, useMemo } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading } from "../hooks/useUtils";

export default function KioskView({ config, toast, setView, kioskSlug }) {
  const [step, setStep] = useState('welcome');
  const [selectedService, setSelectedService] = useState(null);
  const [docType, setDocType] = useState('rut');
  const [docValue, setDocValue] = useState('');
  const [ticket, setTicket] = useState(null);
  const [apiErr, setApiErr] = useState(null);
  const { is, wrap } = useLoading();

  const cleanRut = (rut) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
  const formatRut = (rut) => {
    const c = cleanRut(rut);
    if (!c || c.length < 2) return c;
    const body = c.slice(0, -1);
    const dv = c.slice(-1);
    return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  };

  const validateDoc = () => {
    if (!docValue.trim()) return 'Ingresa tu número de identificación';
    if (docType === 'rut') {
      const c = cleanRut(docValue);
      if (c.length < 7 || c.length > 9) return 'RUT inválido (debe tener 7-8 dígitos + DV)';
    }
    if (docType === 'pasaporte') {
      const c = docValue.replace(/[^a-zA-Z0-9]/g, '');
      if (c.length < 4 || c.length > 20) return 'Pasaporte inválido (debe tener entre 4 y 20 caracteres)';
    }
    return null;
  };

  const getDocPrefix = () => docType === 'rut' ? 'RUT' : 'PAS';

  const handleKeyPress = (char) => { setDocValue(v => v + char); setApiErr(null); };
  const handleBackspace = () => { setDocValue(v => v.slice(0, -1)); setApiErr(null); };

  const availableServices = useMemo(() => {
    if (!kioskSlug || !config?.kioskConfigs) return config?.services || [];
    const kiosk = config.kioskConfigs.find(k => k.slug === kioskSlug);
    if (!kiosk) return config?.services || [];
    return (config?.services || []).filter(s => kiosk.service_ids.includes(s.id));
  }, [config?.services, config?.kioskConfigs, kioskSlug]);

  const hospitalName = config?.hospitalName || 'HOSPITAL';
  const kioskName = kioskSlug ? config?.kioskConfigs?.find(k => k.slug === kioskSlug)?.name : null;

  const handleServiceSelect = (svc) => { setSelectedService(svc); setStep('document'); };

  const handleSubmit = wrap('register', async () => {
    const err = validateDoc();
    if (err) { setApiErr(err); return; }
    setApiErr(null);
    try {
      const docLabel = docType === 'rut' ? formatRut(docValue) : docValue.trim().toUpperCase();
      const data = await apiFetch('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          name: getDocPrefix() + ': ' + docLabel,
          serviceId: selectedService.id,
          type: 'walkin',
          documentType: docType === 'rut' ? 'RUT' : 'PAS',
          documentNumber: docType === 'rut' ? cleanRut(docValue) : docValue.trim().toUpperCase(),
        }),
      });
      const ticketData = { ...data.patient, serviceName: selectedService.name, docLabel };
      setTicket(ticketData);
      setStep('ticket');
      toast.success(`Ticket ${data.patient.ticketCode} generado`);
      setTimeout(() => printTicket(ticketData), 500);
    } catch (err) {
      setApiErr(err.message);
    }
  });

  const printTicket = (ticketData) => {
    const docLabelText = ticketData.docLabel || (docType === 'rut' ? formatRut(docValue) : docValue.trim().toUpperCase());
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin:0; size:80mm auto; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:72mm; padding:3mm 4mm;
    font-family:'Courier New',monospace; font-size:10pt;
    color:#000; text-align:center;
  }
  .title { font-size:12pt; font-weight:bold; margin:0 0 1mm; }
  .kiosk { font-size:10pt; margin-bottom:1mm; }
  .divider { border-top:1px dashed #333; margin:2mm 0; }
  .label { font-size:9pt; font-weight:bold; text-transform:uppercase; letter-spacing:1pt; }
  .service { font-size:11pt; font-weight:bold; margin:2mm 0 1mm; }
  .code { font-size:28pt; font-weight:bold; letter-spacing:3pt; margin:3mm 0; }
  .patient { font-size:10pt; margin:1mm 0; }
  .datetime { font-size:8pt; color:#666; margin:0; }
  .wait { font-size:8pt; margin:1mm 0 0; }
</style>
</head>
<body>
  <div class="title">${hospitalName}</div>
  ${kioskName ? `<div class="kiosk">${kioskName}</div>` : ''}
  <div class="divider"></div>
  <div class="label">TICKET DE ATENCIÓN</div>
  <div class="divider"></div>
  <div class="service">${ticketData.serviceName}</div>
  <div class="code">${ticketData.ticketCode}</div>
  <div class="divider"></div>
  <div class="patient">${getDocPrefix()}: ${docLabelText}</div>
  <div class="divider"></div>
  <div class="datetime">${new Date().toLocaleString('es-CL')}</div>
  ${ticketData.estimatedWait > 0 ? `<div class="wait">Espera estimada: ~${ticketData.estimatedWait} min</div>` : ''}
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const handleReset = () => {
    setStep('service');
    setSelectedService(null);
    setDocType('rut');
    setDocValue('');
    setTicket(null);
    setApiErr(null);
  };

  if (!availableServices.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-900 flex flex-col items-center justify-center p-8">
        <p className="text-white text-xl">Cargando servicios...</p>
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-900 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-lg">
          <div className="w-24 h-24 mx-auto mb-6 bg-white/15 rounded-3xl flex items-center justify-center backdrop-blur-sm">
            <span className="text-5xl">🏥</span>
          </div>
          <h1 className="text-4xl font-black text-white mb-2">{hospitalName}</h1>
          {kioskName && <p className="text-xl text-blue-200 mb-8">{kioskName}</p>}
          <p className="text-lg text-blue-100 mb-10">Bienvenido, presiona el botón para obtener tu ticket de atención</p>
          <button onClick={() => setStep('service')}
            className="bg-accent-500 hover:bg-accent-600 text-white text-2xl font-bold px-12 py-5 rounded-2xl shadow-2xl active:scale-95 transition-all">
            Obtener Ticket 🎫
          </button>
        </div>
      </div>
    );
  }

  if (step === 'service') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-900 flex flex-col p-6">
        <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">Selecciona tu servicio</h2>
            <p className="text-blue-200">{hospitalName}{kioskName ? ` · ${kioskName}` : ''}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 flex-1 content-start">
            {availableServices.map(s => (
              <button key={s.id} onClick={() => handleServiceSelect(s)}
                className="bg-white/10 backdrop-blur-sm border-2 rounded-3xl p-6 text-center
                  hover:bg-white/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-3"
                style={{ borderColor: s.color + '66' }}>
                <span className="text-5xl">{s.icon}</span>
                <span className="text-xl font-bold text-white">{s.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setStep('welcome')}
            className="mt-4 text-blue-200 hover:text-white text-sm py-2 self-center transition">
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  if (step === 'document') {
    const letters = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','R','S','T','V','W','X','Y','Z'];
    const displayVal = docType === 'rut' ? (formatRut(docValue) || '') : docValue;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-900 flex flex-col items-center justify-center p-4">
        <div className="card p-5 w-full max-w-sm animate-slide-up">
          <div className="text-center mb-4">
            <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-2xl">{selectedService?.icon}</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">{selectedService?.name}</h2>
            <p className="text-gray-400 text-xs">{hospitalName}</p>
          </div>

          {apiErr && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-2 mb-3">{apiErr}</div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { key: 'rut', label: 'RUT', icon: '🆔' },
              { key: 'pasaporte', label: 'Pasaporte', icon: '🌎' },
            ].map(t => (
              <button key={t.key} type="button" onClick={() => { setDocType(t.key); setDocValue(''); setApiErr(null); }}
                className={`py-2.5 px-2 rounded-xl text-sm font-semibold transition border-2
                  ${docType === t.key ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <span className="block text-lg mb-0.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4 text-center min-h-[3.5rem] flex items-center justify-center border-2 border-dashed border-gray-200">
            {displayVal ? (
              <p className="text-2xl font-black font-mono tracking-widest text-gray-900">{displayVal}</p>
            ) : (
              <p className="text-gray-400 text-sm">Ingresa tu {docType === 'rut' ? 'RUT' : 'Pasaporte'}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => handleKeyPress(String(n))}
                className="h-14 text-2xl font-bold bg-gray-100 hover:bg-gray-200 active:bg-accent-100 rounded-xl transition active:scale-95">
                {n}
              </button>
            ))}
            <button onClick={() => setDocValue('')}
              className="h-14 text-sm font-bold bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition active:scale-95">
              C
            </button>
            <button onClick={() => handleKeyPress('0')}
              className="h-14 text-2xl font-bold bg-gray-100 hover:bg-gray-200 active:bg-accent-100 rounded-xl transition active:scale-95">
              0
            </button>
            <button onClick={handleBackspace}
              className="h-14 text-2xl font-bold bg-gray-100 hover:bg-gray-200 active:bg-accent-100 rounded-xl transition active:scale-95">
              ⌫
            </button>
          </div>

          {docType === 'rut' && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => handleKeyPress('-')}
                className="h-12 text-xl font-bold bg-gray-100 hover:bg-gray-200 active:bg-accent-100 rounded-xl transition active:scale-95">-</button>
              <button onClick={() => handleKeyPress('K')}
                className="h-12 text-xl font-bold bg-gray-100 hover:bg-gray-200 active:bg-accent-100 rounded-xl transition active:scale-95">K</button>
            </div>
          )}

          {docType === 'pasaporte' && (
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 snap-x snap-mandatory scrollbar-thin">
              {letters.map(l => (
                <button key={l} onClick={() => handleKeyPress(l)}
                  className="snap-start shrink-0 w-11 h-11 text-sm font-bold bg-gray-100 hover:bg-gray-200 active:bg-accent-100 rounded-xl transition active:scale-95">
                  {l}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setStep('service'); setSelectedService(null); setApiErr(null); }}
              className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition">
              ← Atrás
            </button>
            <button onClick={handleSubmit} disabled={is('register') || !docValue.trim()}
              className="py-3 bg-accent-500 hover:bg-accent-600 disabled:bg-accent-300 text-white rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2">
              {is('register') ? 'Registrando...' : 'Continuar →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'ticket' && ticket) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center p-6">
        <div className="card p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">🎫</span>
          </div>
          <h2 className="text-xl font-bold text-emerald-700 mb-1">Registro Exitoso</h2>
          <p className="text-gray-400 text-xs mb-6">{hospitalName} · {ticket.serviceName}</p>

          <div className="bg-gray-50 rounded-2xl p-6 mb-5 border-2 border-dashed border-gray-200">
            <p className="text-gray-400 text-xs mb-1 uppercase tracking-widest">Tu Turno</p>
            <p className="text-5xl font-black text-gray-800 mb-2">{ticket.ticketCode}</p>
            <p className="text-gray-600 font-semibold">{ticket.serviceName}</p>
          </div>

          <div className="space-y-2 text-sm text-left mb-5">
            {ticket.estimatedWait > 0 && (
              <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-3">
                <span className="text-xl">⏱️</span>
                <div>
                  <p className="font-semibold text-blue-800">Espera estimada</p>
                  <p className="text-blue-600">~{ticket.estimatedWait} minutos</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 bg-purple-50 rounded-xl p-3">
              <span className="text-xl">🖨️</span>
              <div>
                <p className="font-semibold text-purple-800">Imprime tu ticket</p>
                <button onClick={() => printTicket(ticket)} className="text-purple-600 underline text-xs">Reimprimir</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleReset}
              className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition">
              + Nuevo Ticket
            </button>
            <button onClick={() => setView('home')}
              className="py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-semibold text-sm transition">
              Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
