import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal } from "../components/AdminShared";

export default function AdminEstablishments({ toast }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const et = await apiFetch('/api/config').catch(() => []);
    setData(Array.isArray(et) ? et : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const cols = [
    { key: 'name', label: 'Nombre' },
    { key: 'address', label: 'Dirección', render: v => v || '—' },
    { key: 'floors', label: 'Pisos', render: (v) => Array.isArray(v) ? v.length : '0' },
  ];
  const fields = [
    { name: 'name', label: 'Nombre', placeholder: 'Ej: Clínica Central' },
    { name: 'address', label: 'Dirección', type: 'textarea', placeholder: 'Av. Balmaceda 916' },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    if (modal.mode === 'create') {
      await apiFetch('/api/config/establishments', { method: 'POST', body: JSON.stringify(formValues) });
      toast.success('Establecimiento creado');
    } else {
      await apiFetch(`/api/config/establishments/${formValues.id}`, { method: 'PUT', body: JSON.stringify(formValues) });
      toast.success('Establecimiento actualizado');
    }
    setModal(null); setFormVals({}); load();
  });

  return (
    <>
      <ConfigList title="Establecimientos" icon="🏛️" desc="Hospitales y sedes"
        columns={cols} data={data} loading={loading}
        onAdd={() => { setFormVals({ name: '', address: '' }); setModal({ mode: 'create' }); }}
        onEdit={(row) => { setFormVals(row); setModal({ mode: 'edit' }); }}
        onDelete={async (row) => {
          const ok = await confirm({ msg: `¿Desactivar "${row.name}"?`, confirmLabel: 'Desactivar' });
          if (!ok) return;
          await apiFetch(`/api/config/establishments/${row.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
          toast.success('Establecimiento desactivado'); load();
        }} />
      {modal && <CrudModal title={modal.mode === 'create' ? 'Nuevo Establecimiento' : 'Editar Establecimiento'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')} />}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
