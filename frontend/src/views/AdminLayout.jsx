import { useParams, useNavigate } from "react-router-dom";

const SECTIONS = [
  { key: 'establishments', label: 'Establecimientos', icon: '🏛️' },
  { key: 'floors',         label: 'Pisos',            icon: '🏗️' },
  { key: 'services',       label: 'Servicios',        icon: '🏥' },
  { key: 'displays',       label: 'Pantallas',        icon: '📺' },
  { key: 'kiosks',         label: 'Kioskos',          icon: '🖥️' },
  { key: 'boxes',          label: 'Consultorios',     icon: '🚪' },
  { key: 'roles',          label: 'Roles',            icon: '👤' },
  { key: 'users',          label: 'Usuarios',         icon: '👥' },
  { key: 'system',         label: 'Config. Sistema',  icon: '⚙️' },
];

export default function AdminLayout({ children }) {
  const { section = 'establishments' } = useParams();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-800">
          <h2 className="font-bold text-lg">⚙️ Administración</h2>
          <p className="text-xs text-gray-400 mt-0.5">Configuración del sistema</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => navigate(`/admin/${s.key}`)}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-3 ${
                section === s.key
                  ? 'bg-accent-500 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}>
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button onClick={() => navigate('/')}
            className="w-full text-center px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition">
            ← Volver al inicio
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export { SECTIONS };
