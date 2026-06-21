import { useState, createContext, useContext, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import useAuth from "./hooks/useAuth";
import useConfig from "./hooks/useConfig";
import { ToastContainer } from "./components/ToastContainer";
import ErrorBoundary from "./components/ErrorBoundary";
import RequireAuth from "./components/RequireAuth";
import HomeView from "./views/HomeView";
import LoginView from "./views/LoginView";
import CheckinView from "./views/CheckinView";
import KioskView from "./views/KioskView";
import StaffView from "./views/StaffView";
import DisplayView from "./views/DisplayView";
import AnalyticsView from "./views/AnalyticsView";
import AdminView from "./views/AdminView";
import AdminLayout from "./views/AdminLayout";

const AppContext = createContext(null);

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const BUILD_TIME  = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
const VersionBadge = () => (
  <span className="fixed bottom-2 right-2 text-[10px] text-gray-400/30 font-mono select-none pointer-events-none z-50">
    v{APP_VERSION} &middot; {BUILD_TIME}
  </span>
);

function useSetView() {
  const navigate = useNavigate();
  return useCallback((view, params) => {
    const paths = {
      home: '/',
      auth: '/auth',
      checkin: '/checkin',
      staff: '/staff',
      display: params?.screen ? `/display/${params.screen}` : '/display',
      kiosk: params?.slug ? `/kiosk/${params.slug}` : '/kiosk',
      analytics: '/analytics',
      admin: params?.section ? `/admin/${params.section}` : '/admin/establishments',
    };
    navigate(paths[view] || '/');
  }, [navigate]);
}

function RoutesWithContext() {
  const ctx = useContext(AppContext);
  const { config, toast, isAuthenticated } = ctx;
  const setView = useSetView();
  const navigate = useNavigate();

  const handleLogin = useCallback(async (username, password) => {
    await ctx.login(username, password);
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/staff';
    navigate(redirect, { replace: true });
  }, [ctx, navigate]);

  function KioskRoute() {
    const { slug } = useParams();
    return <KioskView config={config} toast={toast} setView={setView} kioskSlug={slug} />;
  }
  function DisplayRoute() {
    const { slug } = useParams();
    return <DisplayView config={config} setView={setView} screenSlug={slug} />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomeView setView={setView} hospitalName={config?.hospitalName} user={ctx.user} config={config} />} />
      <Route path="/auth" element={<LoginView onLogin={handleLogin} setView={setView} onCancelAuth={() => navigate('/')} config={config} />} />
      <Route path="/checkin" element={<CheckinView config={config} toast={toast} setView={setView} />} />
      <Route path="/kiosk/:slug" element={<KioskRoute />} />
      <Route path="/staff" element={
        isAuthenticated
          ? <StaffView config={config} user={ctx.user} toast={toast} setView={setView} logout={ctx.logout} />
          : <Navigate to="/auth?redirect=/staff" replace />
      } />
      <Route path="/display/:slug" element={<DisplayRoute />} />
      <Route path="/analytics" element={
        isAuthenticated
          ? <AnalyticsView config={config} toast={toast} setView={setView} logout={ctx.logout} />
          : <Navigate to="/auth?redirect=/analytics" replace />
      } />
      <Route path="/admin" element={<Navigate to="/admin/establishments" replace />} />
      <Route path="/admin/:section" element={
        <RequireAuth>
          <AdminLayout><AdminView toast={toast} config={config} /></AdminLayout>
        </RequireAuth>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ToastsProvider({ children }) {
  const [list, setList] = useState([]);
  const add = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setList(t => [...t.slice(-4), { id, message, type }]);
    setTimeout(() => setList(t => t.filter(x => x.id !== id)), 4500);
  };
  const toast = { list, success: m => add(m, 'success'), error: m => add(m, 'error'), warn: m => add(m, 'warn') };
  return <>{children(toast)}</>;
}

export default function App() {
  const { config, loading: cfgLoading } = useConfig();
  const auth = useAuth();
  const { user, login, logout, isAuthenticated } = auth;

  if (cfgLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 to-indigo-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      <p className="text-blue-200 text-sm font-semibold animate-pulse">Conectando con el servidor...</p>
      <VersionBadge />
    </div>
  );

  const contextValue = { config, toast: null, user, login, logout, isAuthenticated };

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastsProvider>
          {(toast) => (
            <AppContext.Provider value={{ ...contextValue, toast }}>
              <ToastContainer list={toast.list} />
              <VersionBadge />
              <RoutesWithContext />
            </AppContext.Provider>
          )}
        </ToastsProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
