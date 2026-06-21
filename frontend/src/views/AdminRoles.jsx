import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal, PERMISSION_OPTIONS } from "../components/AdminShared";

export default function AdminRoles({ toast }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const rl = await apiFetch('/api/users/roles/list').catch(() => []);
    setData(rl);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const handleFieldChangePermissions = (permKey, checked) => {
    const current = formValues.permissions || {};
    setFormVals(f => ({ ...f, permissions: { ...current, [permKey]: checked } }));
  };

  const cols = [
    { key: 'code', label: 'Código', render: v => <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-0.5 rounded">{v}</span> },
    { key: 'label', label: 'Nombre' },
    { key: 'color', label: 'Color', render: v => <span className="inline-block w-5 h-5 rounded" style={{ backgroundColor: v }} /> },
    { key: 'permissions', label: 'Permisos', render: (v) => {
      if (!v || typeof v !== 'object') return '—';
      const granted = Object.entries(v).filter(([, val]) => val).map(([k]) => k);
      return granted.length ? granted.join(', ') : '—';
    }},
    { key: 'user_count', label: 'Usuarios', render: (v) => v ?? '—' },
  ];
  const fields = [
    { name: 'code', label: 'Código', placeholder: 'doctor' },
    { name: 'label', label: 'Nombre', placeholder: 'Médico' },
    { name: 'color', label: 'Color', type: 'color' },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    const body = { ...formValues };
    if (!body.permissions || typeof body.permissions !== 'object') body.permissions = {};
    if (modal.mode === 'create') {
      await apiFetch('/api/users/roles', { method: 'POST', body: JSON.stringify(body) });
      toast.success('Rol creado');
    } else {
      await apiFetch(`/api/users/roles/${formValues.id}`, { method: 'PUT', body: JSON.stringify(body) });
      toast.success('Rol actualizado');
    }
    setModal(null); setFormVals({}); load();
  });

  return (
    <>
      <ConfigList title="Roles" icon="👤" desc="Roles y permisos del personal"
        columns={cols} data={data} loading={loading}
        onAdd={() => { setFormVals({ code: '', label: '', color: '#6B7280' }); setModal({ mode: 'create' }); }}
        onEdit={(row) => { setFormVals(row); setModal({ mode: 'edit' }); }}
        onDelete={() => { toast.warn('Los roles no se eliminan, se desactivan desde la BD'); }} />
      {modal && <CrudModal title={modal.mode === 'create' ? 'Nuevo Rol' : 'Editar Rol'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')}>
        <div className="pt-3 border-t border-gray-100 mt-3">
          <label className="label">Permisos</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {PERMISSION_OPTIONS.map(p => (
              <label key={p.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={!!(formValues.permissions?.[p.key])}
                  onChange={e => handleFieldChangePermissions(p.key, e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      </CrudModal>}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
