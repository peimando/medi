import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal } from "../components/AdminShared";
function KioskServiceCheckboxes({ services, selected, onChange }) {
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

export default function AdminKiosks({ toast }) {
  const [data, setData] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [kc, sv] = await Promise.all([
      apiFetch('/api/config/kiosk-configs').catch(() => []),
      apiFetch('/api/config/services').catch(() => []),
    ]);
    setData(kc); setServices(sv);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const cols = [
    { key: 'name', label: 'Nombre' },
    { key: 'slug', label: 'URL', render: (v) => {
      const url = `/kiosk/${v}`;
      return <span className="inline-flex items-center gap-1.5"><a href={url} target="_blank" className="text-blue-600 hover:underline font-mono text-xs">{url}</a><button onClick={() => { navigator.clipboard.writeText(window.location.origin + url).catch(() => {}); }} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Copiar URL">📋</button></span>;
    }},
    { key: 'service_ids', label: 'Servicios', render: (v) => {
      if (!Array.isArray(v) || !v.length) return '—';
      return v.map(id => services.find(s => s.id === id)?.code || id).join(', ');
    }},
    { key: 'active', label: 'Activo', render: v => v ? '✅' : '❌' },
  ];
  const fields = [
    { name: 'name', label: 'Nombre', placeholder: 'Kiosko Urgencias' },
    { name: 'slug', label: 'Slug (URL)', placeholder: 'kiosko-urgencias' },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    const body = { ...formValues };
    if (!Array.isArray(body.service_ids)) body.service_ids = [];
    if (modal.mode === 'create') {
      await apiFetch('/api/config/kiosk-configs', { method: 'POST', body: JSON.stringify(body) });
      toast.success('Kiosko creado');
    } else {
      await apiFetch(`/api/config/kiosk-configs/${body.id}`, { method: 'PUT', body: JSON.stringify(body) });
      toast.success('Kiosko actualizado');
    }
    setModal(null); setFormVals({}); load();
  });

  return (
    <>
      <ConfigList title="Kioskos / Tótems" icon="🖥️" desc="Totems de registro por sector"
        columns={cols} data={data} loading={loading}
        onAdd={() => { setFormVals({ name: '', slug: '', service_ids: [] }); setModal({ mode: 'create' }); }}
        onEdit={(row) => { setFormVals(row); setModal({ mode: 'edit' }); }}
        onDelete={async (row) => {
          const ok = await confirm({ msg: `¿Desactivar "${row.name}"?`, confirmLabel: 'Desactivar' });
          if (!ok) return;
          await apiFetch(`/api/config/kiosk-configs/${row.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
          toast.success('Kiosko desactivado'); load();
        }} />
      {modal && <CrudModal title={modal.mode === 'create' ? 'Nuevo Kiosko' : 'Editar Kiosko'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')}>
        <div className="pt-3 border-t border-gray-100 mt-3">
          <label className="label">Servicios disponibles en este kiosko</label>
          <KioskServiceCheckboxes services={services} selected={formValues.service_ids} onChange={handleFieldChange} />
        </div>
      </CrudModal>}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
