import { Btn } from "./Btn";
import { Spinner } from "./Spinner";

export function FormField({ label, name, value, onChange, type = 'text', options, placeholder }) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {options ? (
        <select id={id} value={value} onChange={e => onChange(name, e.target.value)}
          className="input">
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea id={id} value={value} onChange={e => onChange(name, e.target.value)}
          className="input" rows={3} />
      ) : type === 'color' ? (
        <div className="flex gap-2 items-center">
          <input id={id} type="color" value={value || '#0095eb'} onChange={e => onChange(name, e.target.value)}
            className="w-10 h-10 rounded-xl border-2 border-gray-200 cursor-pointer" />
          <span className="text-xs text-gray-400 font-mono">{value || '#0095eb'}</span>
        </div>
      ) : (
        <input id={id} type={type} value={value} onChange={e => onChange(name, e.target.value)}
          placeholder={placeholder} className="input" />
      )}
    </div>
  );
}

export function CrudModal({ title, fields, values, onChange, onSave, onClose, loading, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[80vh] overflow-auto shadow-xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="space-y-3 mb-6">
          {fields.map(f => (
            <FormField key={f.name} {...f} value={values[f.name] ?? ''} onChange={onChange} />
          ))}
        </div>
        {children}
        <div className="flex gap-3 justify-end">
          <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
          <Btn onClick={onSave} loading={loading} variant="primary">Guardar</Btn>
        </div>
      </div>
    </div>
  );
}

export function ConfigList({ title, icon, desc, columns, data, onEdit, onDelete, onAdd, loading }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">{icon} {title}</h3>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
        <Btn onClick={onAdd} size="sm">+ Agregar</Btn>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="md" color="border-accent-500" /></div>
      ) : data.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-10">Sin registros. Agrega uno nuevo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                {columns.map(c => <th key={c.key} className="px-4 py-3 font-semibold">{c.label}</th>)}
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-gray-50 transition">
                  {columns.map(c => (
                    <td key={c.key} className="px-4 py-3 text-gray-700">
                      {c.render ? c.render(row[c.key], row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onEdit(row)} className="text-accent-600 hover:text-accent-800 text-xs font-semibold mr-3">Editar</button>
                    <button onClick={() => onDelete(row)} className="text-red-600 hover:text-red-800 text-xs font-semibold">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const PERMISSION_OPTIONS = [
  { key: 'all', label: 'Superadmin (todo)' },
  { key: 'manage_config', label: 'Gestionar configuración' },
  { key: 'manage_users', label: 'Gestionar usuarios' },
  { key: 'call_patients', label: 'Llamar pacientes' },
  { key: 'complete_service', label: 'Completar atención' },
  { key: 'view_analytics', label: 'Ver reportes' },
];
