import { useState } from "react";
import { useLoading } from "../hooks/useUtils";
import { Btn } from "../components/Btn";

export default function LoginView({ onLogin, setView, onCancelAuth, config }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [err,  setErr]  = useState(null);
  const { is, wrap }    = useLoading();

  const submit = wrap('login', async () => {
    setErr(null);
    try { await onLogin(form.username, form.password); }
    catch (e) {
      setErr(e.message || 'Error al iniciar sesion');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !is('login')) submit();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-900 flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-sm shadow-xl animate-slide-up">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-blue-100 rounded-2xl flex items-center justify-center">
            <span className="text-2xl">🏥</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Acceso Personal</h2>
          <p className="text-gray-400 text-xs mt-1">{config?.hospitalName || 'Sistema de Gestión de Colas'}</p>
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4 flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0">✕</span>
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="login-username">Usuario</label>
            <input id="login-username" type="text"
              value={form.username}
              onChange={e => { setErr(null); setForm(f => ({ ...f, username: e.target.value })); }}
              onKeyDown={handleKeyDown}
              placeholder="ej: admin"
              autoComplete="username"
              autoFocus
              className="input" />
          </div>
          <div>
            <label className="label" htmlFor="login-password">Contrasena</label>
            <input id="login-password" type="password"
              value={form.password}
              onChange={e => { setErr(null); setForm(f => ({ ...f, password: e.target.value })); }}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              autoComplete="current-password"
              className="input" />
          </div>
          <Btn type="submit" loading={is('login')} className="w-full justify-center py-3 text-sm">
            Ingresar
          </Btn>
        </form>

        <button onClick={() => { onCancelAuth?.(); setView('home'); }}
          className="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-4 transition">
          ← Volver al inicio
        </button>
      </div>
    </div>
  );
}
