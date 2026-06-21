import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal } from "../components/AdminShared";

export default function AdminBoxes({ toast }) {
  const [boxes, setBoxes] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [bx, sv] = await Promise.all([
      apiFetch('/api/config/all-boxes').catch(() => []),
      apiFetch('/api/config/services').catch(() => []),
    ]);
    setBoxes(bx); setServices(sv);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const cols = [
    { key: 'name', label: 'Nombre' },
    { key: 'type', label: 'Tipo', render: v => ({ box: 'Box', ventanilla: 'Ventanilla', sala: 'Sala', otro: 'Otro' }[v] || v) },
    { key: 'service_name', label: 'Servicio', render: (v, r) => r.service_name || '—' },
    { key: 'staff_name', label: 'Personal asignado', render: (v, r) => r.staff_name || '—' },
    { key: 'active', label: 'Activo', render: v => v ? '✅' : '❌' },
  ];
  const fields = [
    { name: 'name', label: 'Nombre', placeholder: 'Box 1' },
    { name: 'type', label: 'Tipo', options: [
      { value: 'box', label: 'Box' }, { value: 'ventanilla', label: 'Ventanilla' },
      { value: 'sala', label: 'Sala' }, { value: 'otro', label: 'Otro' },
    ]},
    { name: 'service_id', label: 'Servicio', options: [{ value: '', label: '— Sin servicio —' }, ...services.map(s => ({ value: s.id, label: s.name }))] },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    const boxData = { ...formValues };
    if (modal.mode === 'create') {
      const svcId = boxData.service_id || (services[0]?.id || 1);
      await apiFetch('/api/config/boxes', { method: 'POST', body: JSON.stringify({ ...boxData, service_id: svcId }) });
      toast.success('Consultorio creado');
    } else {
      await apiFetch(`/api/config/boxes/${boxData.id}`, { method: 'PUT', body: JSON.stringify(boxData) });
      toast.success('Consultorio actualizado');
    }
    setModal(null); setFormVals({}); load();
  });

  return (
    <>
      <ConfigList title="Consultorios / Ventanillas" icon="🚪" desc="Boxes, ventanillas, salas"
        columns={cols} data={boxes} loading={loading}
        onAdd={() => { setFormVals({ name: '', type: 'box' }); setModal({ mode: 'create' }); }}
        onEdit={(row) => { setFormVals(row); setModal({ mode: 'edit' }); }}
        onDelete={async (row) => {
          const ok = await confirm({ msg: `¿Desactivar "${row.name}"?`, confirmLabel: 'Desactivar' });
          if (!ok) return;
          await apiFetch(`/api/config/boxes/${row.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
          toast.success('Consultorio desactivado'); load();
        }} />
      {modal && <CrudModal title={modal.mode === 'create' ? 'Nuevo Consultorio' : 'Editar Consultorio'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')} />}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
