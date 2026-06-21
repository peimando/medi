import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../hooks/useApi";
import { useLoading } from "../hooks/useUtils";
import { ConfigList, CrudModal } from "../components/AdminShared";

export default function AdminSystemConfig({ toast }) {
  const [sysConfig, setSysConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [formValues, setFormVals] = useState({});
  const { is, wrap } = useLoading();

  const load = useCallback(async () => {
    setLoading(true);
    const sc = await apiFetch('/api/config/system').catch(() => ({}));
    setSysConfig(sc);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (name, value) => setFormVals(f => ({ ...f, [name]: value }));

  const entries = Object.entries(sysConfig).filter(([k]) => !k.startsWith('_'));
  const cols = [
    { key: 'key', label: 'Parámetro', render: v => <span className="font-mono text-xs">{v}</span> },
    { key: 'value', label: 'Valor' },
  ];

  const handleSave = wrap('save', async () => {
    if (!modal) return;
    await apiFetch('/api/config/system', { method: 'PUT', body: JSON.stringify(formValues) });
    toast.success('Configuración actualizada');
    setModal(null); setFormVals({}); load();
  });

  return (
    <>
      <ConfigList title="Configuración del Sistema" icon="⚙️" desc="Parámetros del sistema"
        columns={cols} data={entries.map(([k, v]) => ({ key: k, value: v }))} loading={loading}
        onAdd={() => {}}
        onEdit={(row) => {
          setFormVals({ key: row.key, value: row.value });
          setModal({ mode: 'edit' });
        }}
        onDelete={() => {}} />
      {modal && <CrudModal title="Editar Parámetro" fields={[
        { name: 'key', label: 'Parámetro' },
        { name: 'value', label: 'Valor', type: 'textarea' },
      ]} values={formValues} onChange={handleFieldChange}
        onSave={handleSave} onClose={() => { setModal(null); setFormVals({}); }} loading={is('save')} />}
    </>
  );
}
