import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal } from "../components/AdminShared";

export default function AdminFloors({ toast }) {
  const [data, setData] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [fl, et] = await Promise.all([
      apiFetch('/api/config/floors').catch(() => []),
      apiFetch('/api/config').catch(() => []),
    ]);
    setData(fl); setTree(et);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const cols = [
    { key: 'name', label: 'Nombre' },
    { key: 'establishment_name', label: 'Establecimiento', render: v => v || '—' },
    { key: 'description', label: 'Descripción', render: v => v || '—' },
    { key: 'order_index', label: 'Orden', render: v => v ?? '0' },
    { key: 'active', label: 'Activo', render: v => v !== false ? '✅' : '❌' },
  ];
  const estOpts = (Array.isArray(tree) ? tree : []).map(e => ({ value: e.id, label: e.name }));
  const fields = [
    { name: 'establishment_id', label: 'Establecimiento', options: estOpts },
    { name: 'name', label: 'Nombre', placeholder: 'Piso 1' },
    { name: 'description', label: 'Descripción', placeholder: 'Planta baja — Urgencias', type: 'textarea' },
    { name: 'order_index', label: 'Orden', type: 'number', placeholder: '0' },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    if (modal.mode === 'create') {
      await apiFetch('/api/config/floors', { method: 'POST', body: JSON.stringify(formValues) });
      toast.success('Piso creado');
    } else {
      await apiFetch(`/api/config/floors/${formValues.id}`, { method: 'PUT', body: JSON.stringify(formValues) });
      toast.success('Piso actualizado');
    }
    setModal(null); setFormVals({}); load();
  });

  return (
    <>
      <ConfigList title="Pisos / Sectores" icon="🏗️" desc="Niveles, alas y sectores"
        columns={cols} data={data} loading={loading}
        onAdd={() => { setFormVals({ name: '', description: '', order_index: 0, establishment_id: tree[0]?.id || '' }); setModal({ mode: 'create' }); }}
        onEdit={(row) => { setFormVals(row); setModal({ mode: 'edit' }); }}
        onDelete={async (row) => {
          const ok = await confirm({ msg: `¿Desactivar "${row.name}"?`, confirmLabel: 'Desactivar' });
          if (!ok) return;
          await apiFetch(`/api/config/floors/${row.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
          toast.success('Piso desactivado'); load();
        }} />
      {modal && <CrudModal title={modal.mode === 'create' ? 'Nuevo Piso' : 'Editar Piso'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')} />}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
