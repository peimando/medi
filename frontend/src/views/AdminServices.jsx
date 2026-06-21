import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal } from "../components/AdminShared";

export default function AdminServices({ toast }) {
  const [data, setData] = useState([]);
  const [floorsData, setFloorsData] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [sv, fl, et] = await Promise.all([
      apiFetch('/api/config/services').catch(() => []),
      apiFetch('/api/config/floors').catch(() => []),
      apiFetch('/api/config').catch(() => []),
    ]);
    setData(sv); setFloorsData(fl); setTree(et);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const cols = [
    { key: 'code', label: 'Código', render: v => <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-0.5 rounded">{v}</span> },
    { key: 'name', label: 'Nombre' },
    { key: 'color', label: 'Color', render: v => <span className="inline-block w-5 h-5 rounded" style={{ backgroundColor: v }} /> },
    { key: 'icon', label: 'Icono' },
    { key: 'floor_name', label: 'Piso' },
    { key: 'active', label: 'Activo', render: v => v ? '✅' : '❌' },
  ];
  const floorOpts = floorsData.length
    ? floorsData.map(f => ({ value: f.id, label: `${f.name}${f.establishment_name ? ` (${f.establishment_name})` : ''}` }))
    : (Array.isArray(tree) ? tree.flatMap(e => (e.floors || []).map(f => ({ value: f.id, label: `${f.name} — ${e.name}` }))) : []);
  const fields = [
    { name: 'name', label: 'Nombre', placeholder: 'Consultoría' },
    { name: 'code', label: 'Código', placeholder: 'CON' },
    { name: 'floor_id', label: 'Piso', options: [{ value: '', label: '— Seleccionar piso —' }, ...floorOpts] },
    { name: 'color', label: 'Color', type: 'color' },
    { name: 'icon', label: 'Icono', placeholder: '👨‍⚕️' },
    { name: 'priority_order', label: 'Orden', type: 'number', placeholder: '99' },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    const svcData = { ...formValues };
    if (modal.mode === 'edit') {
      await apiFetch(`/api/config/services/${svcData.id}`, { method: 'PUT', body: JSON.stringify(svcData) });
      toast.success('Servicio actualizado');
    } else {
      const floorId = svcData.floor_id || (tree[0]?.floors?.[0]?.id || 1);
      await apiFetch('/api/config/services', { method: 'POST', body: JSON.stringify({ ...svcData, floor_id: floorId }) });
      toast.success('Servicio creado');
    }
    setModal(null); setFormVals({}); load();
  });

  return (
    <>
      <ConfigList title="Servicios" icon="🏥" desc="Triage, Consultoría, etc."
        columns={cols} data={data} loading={loading}
        onAdd={() => { setFormVals({ name: '', code: '', color: '#3B82F6', icon: '🏥', priority_order: 99 }); setModal({ mode: 'create' }); }}
        onEdit={(row) => { setFormVals(row); setModal({ mode: 'edit' }); }}
        onDelete={async (row) => {
          const ok = await confirm({ msg: `¿Desactivar "${row.name}"?`, confirmLabel: 'Desactivar' });
          if (!ok) return;
          await apiFetch(`/api/config/services/${row.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
          toast.success('Servicio desactivado'); load();
        }} />
      {modal && <CrudModal title={modal.mode === 'create' ? 'Nuevo Servicio' : 'Editar Servicio'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')} />}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
