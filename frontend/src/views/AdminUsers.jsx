import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading, useConfirm } from "../hooks/useUtils";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfigList, CrudModal } from "../components/AdminShared";

export default function AdminUsers({ toast }) {
  const [users, setUsers] = useState([]);
  const [userMeta, setUserMeta] = useState({ page: 1, limit: 50, total: 0 });
  const [userPage, setUserPage] = useState(1);
  const [roles, setRoles] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();
  const { confirm, state: confirmState, ok: confirmOk, nok: confirmNok } = useConfirm();

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    const [rl, sv] = await Promise.all([
      apiFetch('/api/users/roles/list').catch(() => []),
      apiFetch('/api/config/services').catch(() => []),
    ]);
    setRoles(rl); setServices(sv);
    const res = await apiFetch(`/api/users?page=${page}`).catch(() => ({}));
    setUsers(res?.data || []);
    setUserMeta(res?.meta || { page: 1, limit: 50, total: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(userPage); }, [userPage, loadUsers]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const usersList = Array.isArray(users) ? users : [];
  const totalPages = Math.max(1, Math.ceil(userMeta.total / userMeta.limit));

  const cols = [
    { key: 'username', label: 'Usuario' },
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Rol', render: (v) => <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 font-medium">{v}</span> },
    { key: 'service_name', label: 'Servicio', render: v => v || '—' },
    { key: 'active', label: 'Activo', render: v => v ? '✅' : '❌' },
  ];
  const isCreate = modal?.mode === 'create';
  const fields = [
    { name: 'username', label: 'Usuario', placeholder: 'doctor1' },
    { name: 'name', label: 'Nombre completo', placeholder: 'Dr. Carlos Pérez' },
    { name: 'email', label: 'Email', type: 'email', placeholder: 'carlos@hospital.cl' },
    { name: 'role', label: 'Rol', options: roles.map(r => ({ value: r.code, label: `${r.label} (${r.code})` })) },
    { name: 'password', label: isCreate ? 'Contraseña' : 'Nueva contraseña (dejar vacío)' },
    { name: 'service_id', label: 'Servicio (opcional)', options: [{ value: '', label: '— Sin servicio —' }, ...services.map(s => ({ value: s.id, label: s.name }))] },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    const body = { ...formValues };
    if (modal.mode === 'edit' && !body.password) delete body.password;
    if (!body.service_id) delete body.service_id;
    if (!body.email) return toast.error('Email es requerido');
    try {
      if (modal.mode === 'create') {
        await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Usuario creado');
        setUserPage(1);
      } else {
        delete body.password_hash; delete body.created_at;
        await apiFetch(`/api/users/${body.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast.success('Usuario actualizado');
      }
      setModal(null); setFormVals({}); loadUsers(userPage);
    } catch (e) {
      toast.error('Error al guardar usuario: ' + (e.message || 'Error del servidor'));
    }
  });

  return (
    <>
      <ConfigList title="Usuarios" icon="👥" desc="Personal del hospital"
        columns={cols} data={usersList} loading={loading}
        onAdd={() => { setFormVals({ username: '', name: '', role: '', password: '' }); setModal({ mode: 'create' }); }}
        onEdit={(row) => { setFormVals(row); setModal({ mode: 'edit' }); }}
        onDelete={async (row) => {
          const ok = await confirm({ msg: `¿Desactivar a "${row.name}"?`, confirmLabel: 'Desactivar' });
          if (!ok) return;
          await apiFetch(`/api/users/${row.id}`, { method: 'PUT', body: JSON.stringify({ active: false }) });
          toast.success('Usuario desactivado'); loadUsers(userPage);
        }} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50 text-sm">
          <span className="text-gray-500">{userMeta.total} usuarios en total</span>
          <div className="flex gap-2 items-center">
            <button disabled={userPage <= 1} onClick={() => setUserPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
              ← Anterior
            </button>
            <span className="text-gray-500">{userPage} / {totalPages}</span>
            <button disabled={userPage >= totalPages} onClick={() => setUserPage(p => p + 1)}
              className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
              Siguiente →
            </button>
          </div>
        </div>
      )}
      {modal && <CrudModal title={isCreate ? 'Nuevo Usuario' : 'Editar Usuario'}
        fields={fields} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')} />}
      <ConfirmDialog state={confirmState} onConfirm={confirmOk} onCancel={confirmNok} />
    </>
  );
}
