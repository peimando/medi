import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal } from "../components/AdminShared";

const LAYOUT_DEFAULTS = {
  background_color: '#1a1a2e',
  background_fit: 'cover',
  columns: 5,
  font_size: 'text-4xl',
  show_hospital_name: true,
  show_screen_name: true,
  show_clock: true,
  show_patient_names: false,
  banner: {
    enabled: false,
    type: 'text',
    text: '',
    image_url: '',
    video_url: '',
    position: 'top',
    height: 'md',
    margin: 'md',
    sidebar_width: 'w-72',
    sidebar_position: 'right',
    bg_color: 'rgba(0,0,0,0.3)',
    text_color: '#ffffff',
    opacity: 30,
  },
  alert_enabled: false,
  alerts: [],
};

const FONT_OPTIONS = [
  { value: 'text-lg',  label: 'Pequeño' },
  { value: 'text-2xl', label: 'Mediano' },
  { value: 'text-4xl', label: 'Grande' },
  { value: 'text-6xl', label: 'Extra grande' },
  { value: 'text-7xl', label: 'Titular' },
];

const FIT_OPTIONS = [
  { value: 'cover',   label: 'Cubrir' },
  { value: 'contain', label: 'Contener' },
  { value: 'fill',    label: 'Rellenar' },
  { value: 'none',    label: 'Ninguno' },
];

function ServiceCheckboxes({ services, selected, onChange }) {
  if (!services.length) return <p className="text-xs text-gray-400">No hay servicios disponibles</p>;
  return (
    <div className="grid grid-cols-2 gap-1.5 mt-1">
      {services.map(s => (
        <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={(selected || []).includes(s.id)}
            onChange={e => {
              const current = selected || [];
              const next = e.target.checked ? [...current, s.id] : current.filter(id => id !== s.id);
              onChange('service_ids', next);
            }}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-xs font-mono bg-gray-100 px-1 rounded">{s.code}</span>
          {s.name}
        </label>
      ))}
    </div>
  );
}

function Toggle({ label, value, onChange, name }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={!!value}
        onChange={e => onChange(name, e.target.checked)}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
      {label}
    </label>
  );
}

export default function AdminDisplays({ toast }) {
  const [data, setData] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const bannerFileRef = useRef(null);
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [dc, sv] = await Promise.all([
      apiFetch('/api/config/display-configs').catch(() => []),
      apiFetch('/api/config/services').catch(() => []),
    ]);
    setData(dc); setServices(sv);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const handleLayoutChange = (name, value) => setFormVals(f => ({
    ...f,
    layout: { ...(typeof f.layout === 'object' && f.layout ? f.layout : {}), [name]: value },
  }));

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !modal?.mode === 'edit') return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const result = await apiFetch(`/api/config/display-configs/${formValues.id}/upload`, {
        method: 'POST',
        body: fd,
        headers: {},
      });
      setFormVals(f => ({ ...f, background_image: result.background_image }));
      toast.success('Imagen subida');
    } catch (err) {
      toast.error(err.message || 'Error al subir imagen');
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleRemoveImage = async () => {
    await apiFetch(`/api/config/display-configs/${formValues.id}`, {
      method: 'PUT',
      body: JSON.stringify({ background_image: null }),
    });
    setFormVals(f => ({ ...f, background_image: null }));
    toast.success('Imagen eliminada');
  };

  const handleBannerChange = (name, value) => setFormVals(f => ({
    ...f,
    layout: {
      ...(typeof f.layout === 'object' && f.layout ? f.layout : {}),
      banner: { ...(f.layout?.banner || LAYOUT_DEFAULTS.banner), [name]: value },
    },
  }));

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || modal?.mode !== 'edit') return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('media', file);
      const result = await apiFetch(`/api/config/display-configs/${formValues.id}/upload-media`, {
        method: 'POST',
        body: fd,
        headers: {},
      });
      const field = curBanner.type === 'video' ? 'video_url' : 'image_url';
      handleBannerChange(field, result.url);
      toast.success('Archivo subido');
    } catch (err) {
      toast.error(err.message || 'Error al subir archivo');
    } finally {
      setUploading(false);
      if (bannerFileRef.current) bannerFileRef.current.value = '';
    }
  };

  const handleAlertAdd = () => setFormVals(f => ({
    ...f,
    layout: {
      ...f.layout,
      alerts: [...(f.layout?.alerts || []), { text: '', severity: 'info', active: true, start_time: '08:00', end_time: '20:00' }],
    },
  }));

  const handleAlertChange = (index, field, value) => setFormVals(f => {
    const alerts = [...(f.layout?.alerts || [])];
    alerts[index] = { ...alerts[index], [field]: value };
    return { ...f, layout: { ...f.layout, alerts } };
  });

  const handleAlertRemove = (index) => setFormVals(f => {
    const alerts = [...(f.layout?.alerts || [])];
    alerts.splice(index, 1);
    return { ...f, layout: { ...f.layout, alerts } };
  });

  const cols = [
    { key: 'name', label: 'Nombre' },
    { key: 'slug', label: 'URL', render: (v) => {
      const url = `/display/${v}`;
      return <span className="inline-flex items-center gap-1.5"><a href={url} target="_blank" className="text-blue-600 hover:underline font-mono text-xs">{url}</a><button onClick={() => { navigator.clipboard.writeText(window.location.origin + url).catch(() => {}); }} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Copiar URL">📋</button></span>;
    }},
    { key: 'service_ids', label: 'Servicios', render: (v) => {
      if (!Array.isArray(v) || !v.length) return '—';
      return v.map(id => services.find(s => s.id === id)?.code || id).join(', ');
    }},
    { key: 'active', label: 'Activa', render: v => v ? '✅' : '❌' },
    { key: 'background_image', label: 'Fondo', render: v => v ? '🖼️' : '—' },
  ];
  const fields = [
    { name: 'name', label: 'Nombre', placeholder: 'Pantalla Urgencias' },
    { name: 'slug', label: 'Slug (URL)', placeholder: 'urgencias' },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    const body = { ...formValues };
    if (!Array.isArray(body.service_ids)) body.service_ids = [];
    if (body.layout && typeof body.layout === 'object') {
      body.layout = JSON.stringify(body.layout);
    }
    if (modal.mode === 'create') {
      await apiFetch('/api/config/display-configs', { method: 'POST', body: JSON.stringify(body) });
      toast.success('Pantalla creada');
    } else {
      await apiFetch(`/api/config/display-configs/${body.id}`, { method: 'PUT', body: JSON.stringify(body) });
      toast.success('Pantalla actualizada');
    }
    setModal(null); setFormVals({}); load();
  });

  const handleEdit = (row) => {
    const layout = typeof row.layout === 'string' ? JSON.parse(row.layout || '{}') : (row.layout || {});
    setFormVals({ ...row, layout: { ...LAYOUT_DEFAULTS, ...layout } });
    setModal({ mode: 'edit' });
  };

  const curLayout = (typeof formValues.layout === 'object' && formValues.layout) ? formValues.layout : LAYOUT_DEFAULTS;
  const curBanner = curLayout.banner || LAYOUT_DEFAULTS.banner;

  return (
    <>
      <ConfigList title="Pantallas Digitales" icon="📺" desc="Cartelería digital por piso/sector"
        columns={cols} data={data} loading={loading}
        onAdd={() => { setFormVals({ name: '', slug: '', service_ids: [], layout: { ...LAYOUT_DEFAULTS }, background_image: null }); setModal({ mode: 'create' }); }}
        onEdit={handleEdit}
        onDelete={async (row) => {
          const ok = await confirm({ msg: `¿Desactivar "${row.name}"?`, confirmLabel: 'Desactivar' });
          if (!ok) return;
          await apiFetch(`/api/config/display-configs/${row.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
          toast.success('Pantalla desactivada'); load();
        }} />
      {modal && <CrudModal title={modal.mode === 'create' ? 'Nueva Pantalla' : 'Editar Pantalla'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')}>
        <div className="pt-3 border-t border-gray-100 mt-3">
          <label className="label">Servicios en esta pantalla</label>
          <ServiceCheckboxes services={services} selected={formValues.service_ids} onChange={handleFieldChange} />
        </div>
        {modal.mode === 'edit' && <>
          <div className="pt-3 border-t border-gray-100 mt-3">
            <label className="label">🎨 Apariencia</label>
            <div className="mt-2 space-y-3">
              {/* Imagen de fondo */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Imagen de fondo</label>
                {formValues.background_image ? (
                  <div className="relative inline-block">
                    <img src={formValues.background_image} alt="Fondo" className="h-24 rounded-lg border object-cover" />
                    <button onClick={handleRemoveImage} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600">×</button>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Sin imagen</div>
                )}
                <div className="mt-1">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} disabled={uploading}
                    className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
              </div>
              {/* Color de fondo */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500">Color fondo</label>
                <input type="color" value={curLayout.background_color} onChange={e => handleLayoutChange('background_color', e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer border" />
                <span className="text-xs font-mono text-gray-400">{curLayout.background_color}</span>
              </div>
              {/* Ajuste fondo */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500">Ajuste</label>
                <select value={curLayout.background_fit} onChange={e => handleLayoutChange('background_fit', e.target.value)}
                  className="text-xs border rounded px-2 py-1 text-gray-700">
                  {FIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {/* Columnas */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500">Columnas</label>
                <select value={curLayout.columns} onChange={e => handleLayoutChange('columns', Number(e.target.value))}
                  className="text-xs border rounded px-2 py-1 text-gray-700">
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {/* Tamaño ticket */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500">Tamaño ticket</label>
                <select value={curLayout.font_size} onChange={e => handleLayoutChange('font_size', e.target.value)}
                  className="text-xs border rounded px-2 py-1 text-gray-700">
                  {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {/* Toggles */}
              <div className="space-y-1">
                <Toggle name="show_hospital_name" label="Mostrar nombre del hospital" value={curLayout.show_hospital_name} onChange={handleLayoutChange} />
                <Toggle name="show_screen_name" label="Mostrar nombre de la pantalla" value={curLayout.show_screen_name} onChange={handleLayoutChange} />
                <Toggle name="show_clock" label="Mostrar reloj" value={curLayout.show_clock} onChange={handleLayoutChange} />
              </div>
            </div>
          </div>

          {/* Mostrar nombres de pacientes */}
          <div className="pt-3 border-t border-gray-100 mt-3">
            <label className="label">👤 Pacientes</label>
            <div className="mt-2">
              <Toggle name="show_patient_names" label="Mostrar nombres de pacientes en pantalla" value={curLayout.show_patient_names} onChange={handleLayoutChange} />
            </div>
          </div>

          {/* Banner / Video */}
          <div className="pt-3 border-t border-gray-100 mt-3">
            <label className="label">🖼️ Banner / Video</label>
            <div className="mt-2 space-y-3">
              <Toggle name="banner_enabled" label="Activar banner" value={curBanner.enabled} onChange={(n, v) => handleBannerChange('enabled', v)} />

              {curBanner.enabled && <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                  <div className="flex gap-2">
                    {['text','image','video'].map(t => (
                      <button key={t} type="button" onClick={() => handleBannerChange('type', t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border-2 ${curBanner.type === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                        {t === 'text' ? '📝 Texto' : t === 'image' ? '🖼️ Imagen' : '🎬 Video'}
                      </button>
                    ))}
                  </div>
                </div>

                {curBanner.type === 'text' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Texto del banner</label>
                    <input type="text" value={curBanner.text || ''} onChange={e => handleBannerChange('text', e.target.value)}
                      placeholder="Ej: Bienvenidos al Hospital" className="input text-sm" />
                  </div>
                )}

                {curBanner.type === 'image' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Imagen</label>
                    {curBanner.image_url ? (
                      <div className="relative inline-block">
                        <img src={curBanner.image_url} alt="Banner" className="h-20 rounded-lg border object-cover" />
                        <button onClick={() => handleBannerChange('image_url', '')} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600">×</button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">Sin imagen</div>
                    )}
                    <div className="mt-1">
                      <input ref={bannerFileRef} type="file" accept="image/*" onChange={handleBannerUpload} disabled={uploading}
                        className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    </div>
                  </div>
                )}

                {curBanner.type === 'video' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Video MP4</label>
                    {curBanner.video_url ? (
                      <div className="relative inline-block">
                        <video src={curBanner.video_url} className="h-20 rounded-lg border object-cover" muted />
                        <button onClick={() => handleBannerChange('video_url', '')} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600">×</button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">Sin video</div>
                    )}
                    <div className="mt-1">
                      <input ref={bannerFileRef} type="file" accept="video/mp4" onChange={handleBannerUpload} disabled={uploading}
                        className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-500">Posición</label>
                  <select value={curBanner.position || 'top'} onChange={e => handleBannerChange('position', e.target.value)}
                    className="text-xs border rounded px-2 py-1 text-gray-700">
                    <option value="top">Superior</option>
                    <option value="bottom">Inferior</option>
                    <option value="sidebar">Lateral</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-500">Espaciado</label>
                  <select value={curBanner.margin || 'md'} onChange={e => handleBannerChange('margin', e.target.value)}
                    className="text-xs border rounded px-2 py-1 text-gray-700">
                    <option value="sm">Pequeño</option>
                    <option value="md">Mediano</option>
                    <option value="lg">Grande</option>
                  </select>
                </div>

                {curBanner.position === 'sidebar' && (
                  <>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500">Ancho lateral</label>
                      <select value={curBanner.sidebar_width || 'w-72'} onChange={e => handleBannerChange('sidebar_width', e.target.value)}
                        className="text-xs border rounded px-2 py-1 text-gray-700">
                        <option value="w-48">Estrecho (192px)</option>
                        <option value="w-64">Mediano (256px)</option>
                        <option value="w-72">Ancho (288px)</option>
                        <option value="w-96">Extra ancho (384px)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500">Lado</label>
                      <select value={curBanner.sidebar_position || 'right'} onChange={e => handleBannerChange('sidebar_position', e.target.value)}
                        className="text-xs border rounded px-2 py-1 text-gray-700">
                        <option value="right">Derecha</option>
                        <option value="left">Izquierda</option>
                      </select>
                    </div>
                  </>
                )}

                {curBanner.position !== 'sidebar' && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500">Alto</label>
                    <select value={curBanner.height || 'md'} onChange={e => handleBannerChange('height', e.target.value)}
                      className="text-xs border rounded px-2 py-1 text-gray-700">
                      <option value="sm">Pequeño</option>
                      <option value="md">Mediano</option>
                      <option value="lg">Grande</option>
                    </select>
                  </div>
                )}

                {curBanner.type === 'text' && curBanner.text && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500">🎨 Estilo del texto</p>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500">Fondo</label>
                      <input type="color" value={curBanner.bg_color && curBanner.bg_color.startsWith('#') ? curBanner.bg_color : '#000000'} onChange={e => handleBannerChange('bg_color', e.target.value)}
                        className="w-10 h-8 rounded cursor-pointer border" />
                      <input type="text" value={curBanner.bg_color || 'rgba(0,0,0,0.3)'} onChange={e => handleBannerChange('bg_color', e.target.value)}
                        className="text-xs border rounded px-2 py-1 text-gray-700 font-mono w-36" placeholder="rgba(0,0,0,0.3)" />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500">Texto</label>
                      <input type="color" value={curBanner.text_color || '#ffffff'} onChange={e => handleBannerChange('text_color', e.target.value)}
                        className="w-10 h-8 rounded cursor-pointer border" />
                      <span className="text-xs font-mono text-gray-400">{curBanner.text_color || '#ffffff'}</span>
                    </div>
                  </div>
                )}
              </>}
            </div>
          </div>

          {/* Alertas */}
          <div className="pt-3 border-t border-gray-100 mt-3">
            <label className="label">🔔 Alertas</label>
            <div className="mt-2 space-y-3">
              <Toggle name="alert_enabled" label="Activar alertas programadas" value={curLayout.alert_enabled} onChange={handleLayoutChange} />

              {curLayout.alert_enabled && <>
                {(curLayout.alerts || []).length === 0 && (
                  <p className="text-xs text-gray-400">Sin alertas. Agrega una usando el botón de abajo.</p>
                )}
                {(curLayout.alerts || []).map((alert, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <input type="text" value={alert.text} onChange={e => handleAlertChange(i, 'text', e.target.value)}
                          placeholder="Texto de la alerta" className="input text-sm" />
                        <div className="flex flex-wrap gap-2">
                          <select value={alert.severity} onChange={e => handleAlertChange(i, 'severity', e.target.value)}
                            className="text-xs border rounded px-2 py-1 text-gray-700">
                            <option value="info">ℹ️ Info</option>
                            <option value="warning">⚠️ Advertencia</option>
                            <option value="danger">🚨 Peligro</option>
                          </select>
                          <input type="time" value={alert.start_time || '08:00'} onChange={e => handleAlertChange(i, 'start_time', e.target.value)}
                            className="text-xs border rounded px-2 py-1 text-gray-700" />
                          <span className="text-xs text-gray-400 self-center">a</span>
                          <input type="time" value={alert.end_time || '20:00'} onChange={e => handleAlertChange(i, 'end_time', e.target.value)}
                            className="text-xs border rounded px-2 py-1 text-gray-700" />
                        </div>
                        <Toggle name={`alert-active-${i}`} label="Activa" value={alert.active} onChange={(_, v) => handleAlertChange(i, 'active', v)} />
                      </div>
                      <button onClick={() => handleAlertRemove(i)} className="text-red-400 hover:text-red-600 text-xs p-1 self-start mt-1">✕</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={handleAlertAdd}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  + Agregar alerta
                </button>
              </>}
            </div>
          </div>
        </>}
      </CrudModal>}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
