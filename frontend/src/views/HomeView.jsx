export default function HomeView({ setView, hospitalName, user, config }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-900">
      <header className="bg-white/10 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="text-xl">🏥</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">MediQueue</h1>
              <p className="text-xs text-blue-200">{hospitalName || 'Sistema de Gestión de Colas'}</p>
            </div>
          </div>
          {(user?.permissions?.all || user?.permissions?.manage_config) && (
            <button onClick={() => setView('admin')}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl transition flex items-center gap-1.5">
              ⚙️ Admin
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: '🎫', label: 'Check-in', desc: 'Registrar paciente', v: 'checkin' },
            { icon: '👨‍⚕️', label: 'Consola Staff', desc: 'Gestionar cola', v: 'auth', auth: true },
            { icon: '📺', label: 'Carteleria', desc: 'Pantalla digital', v: 'display' },
            { icon: '📊', label: 'Dashboard', desc: 'Metricas y reportes', v: 'analytics', auth: true },
          ].map(b => (
            <button key={b.v} onClick={() => setView(b.v)}
              className={`bg-gradient-to-br from-accent-500 to-accent-700 rounded-2xl p-5 text-white text-left
                hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all`}>
              <span className="text-3xl block mb-3">{b.icon}</span>
              <p className="font-bold text-lg">{b.label}</p>
              <p className="text-sm text-white/70">{b.desc}</p>
            </button>
          ))}
        </div>

        {config?.displayConfigs?.length > 0 && (
          <div className="mt-8">
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-3">📺 Pantallas por sector</p>
            <div className="flex flex-wrap gap-2">
              {config.displayConfigs.map(d => (
                <button key={d.slug} onClick={() => setView('display', { screen: d.slug })}
                  className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl transition">
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {config?.kioskConfigs?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-3">🖥️ Kioskos de registro</p>
            <div className="flex flex-wrap gap-2">
              {config.kioskConfigs.map(k => (
                <button key={k.slug} onClick={() => setView('kiosk', { slug: k.slug })}
                  className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl transition">
                  {k.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="text-center pb-6">
        <p className="text-xs text-blue-300/50">v1.0 — Sistema de Gestión de Colas</p>
      </footer>
    </div>
  );
}
