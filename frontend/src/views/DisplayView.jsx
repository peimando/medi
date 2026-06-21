import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { apiFetch } from "../hooks/useApi";

const LAYOUT_DEFAULTS = {
  background_color: '#1a1a2e',
  background_fit: 'cover',
  columns: 5,
  font_size: 'text-4xl',
  show_hospital_name: true,
  show_screen_name: true,
  show_clock: true,
  show_patient_names: false,
  banner: {
    enabled: false,
    type: 'text',
    text: '',
    image_url: '',
    video_url: '',
    position: 'top',
    height: 'md',
    margin: 'md',
    sidebar_width: 'w-72',
    sidebar_position: 'right',
    bg_color: 'rgba(0,0,0,0.3)',
    text_color: '#ffffff',
    opacity: 30,
  },
  alert_enabled: false,
  alerts: [],
};

export default function DisplayView({ config, setView, screenSlug }) {
  const [now, setNow]         = useState(new Date());
  const [screenData, setScreenData] = useState(null);
  const [screenCfg, setScreenCfg]   = useState(null);
  const [alertIndex, setAlertIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    if (!screenSlug) return;
    try {
      const data = await apiFetch(`/api/display/${screenSlug}`).catch(() => null);
      if (data) {
        setScreenCfg(data.config);
        setScreenData(data.display || []);
      }
    } catch { /* ignore */ }
  }, [screenSlug]);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 3000); return () => clearInterval(t); }, [fetchData]);

  const layout = screenCfg?.layout
    ? (typeof screenCfg.layout === 'string' ? JSON.parse(screenCfg.layout) : screenCfg.layout)
    : LAYOUT_DEFAULTS;
  const banner = layout.banner || {};

  const activeAlerts = useMemo(() => {
    if (!layout.alert_enabled || !layout.alerts?.length) return [];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return layout.alerts.filter(a => {
      if (!a.active) return false;
      if (!a.start_time || !a.end_time) return true;
      const [sh, sm] = a.start_time.split(':').map(Number);
      const [eh, em] = a.end_time.split(':').map(Number);
      const smin = sh * 60 + sm;
      const emin = eh * 60 + em;
      if (smin <= emin) return currentMinutes >= smin && currentMinutes < emin;
      return currentMinutes >= smin || currentMinutes < emin;
    });
  }, [layout.alerts, layout.alert_enabled, now]);

  useEffect(() => {
    if (activeAlerts.length <= 1) { setAlertIndex(0); return; }
    const t = setInterval(() => setAlertIndex(i => (i + 1) % activeAlerts.length), 5000);
    return () => clearInterval(t);
  }, [activeAlerts.length]);

  const currentAlert = activeAlerts[alertIndex % activeAlerts.length] || null;

  const prevTickets = useRef({});
  const [animatingIds, setAnimatingIds] = useState(new Set());
  const animTimeoutRef = useRef(null);

  useEffect(() => {
    if (!screenData) return;
    const newIds = new Set();
    screenData.forEach(s => {
      const prev = prevTickets.current[s.id];
      if (prev && prev !== s.ticket_code) {
        newIds.add(s.id);
      }
      prevTickets.current[s.id] = s.ticket_code;
    });
    if (newIds.size > 0) {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
      setAnimatingIds(prev => new Set([...prev, ...newIds]));
      animTimeoutRef.current = setTimeout(() => setAnimatingIds(new Set()), 2200);
    }
    return () => { if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current); };
  }, [screenData]);

  const bgStyle = screenCfg?.background_image
    ? { backgroundImage: `url(${screenCfg.background_image})`, backgroundSize: layout.background_fit, backgroundPosition: 'center', backgroundColor: layout.background_color }
    : { backgroundColor: layout.background_color };

  const baseCols = layout.columns || 5;
  const isSidebar = banner.position === 'sidebar';
  const gridColsClass = {
    1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3',
    4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6',
  }[isSidebar ? Math.min(baseCols, 4) : baseCols] || 'grid-cols-5';

  const severityBg = { danger: 'bg-red-600/80', warning: 'bg-amber-500/80', info: 'bg-blue-600/80' };

  const topMarginClass = banner.margin === 'sm' ? 'mb-2' : banner.margin === 'lg' ? 'mb-6' : 'mb-4';
  const bottomMarginClass = banner.margin === 'sm' ? 'mt-2' : banner.margin === 'lg' ? 'mt-6' : 'mt-4';
  const sidebarWidthClass = ['w-48', 'w-64', 'w-72', 'w-96'].includes(banner.sidebar_width) ? banner.sidebar_width : 'w-72';
  const sidebarOrderClass = banner.sidebar_position === 'left' ? 'order-first' : 'order-last';

  const renderBanner = () => {
    if (!banner.enabled) return null;
    const h = banner.height || 'md';
    const heightClass = h === 'sm' ? 'h-20' : h === 'lg' ? 'h-60' : 'h-40';

    if (banner.type === 'text' && banner.text) {
      return (
        <div className="rounded-2xl p-4 text-center backdrop-blur-sm" style={{ backgroundColor: banner.bg_color || 'rgba(0,0,0,0.3)' }}>
          <p className="text-2xl font-bold drop-shadow-lg" style={{ color: banner.text_color || '#ffffff' }}>{banner.text}</p>
        </div>
      );
    }
    if (banner.type === 'image' && banner.image_url) {
      return (
        <div className={`rounded-2xl overflow-hidden ${isSidebar ? '' : heightClass}`}>
          <img src={banner.image_url} alt="" className={`w-full ${isSidebar ? 'h-auto' : 'h-full'} object-cover`} />
        </div>
      );
    }
    if (banner.type === 'video' && banner.video_url) {
      return (
        <div className={`rounded-2xl overflow-hidden ${isSidebar ? '' : heightClass}`}>
          <video src={banner.video_url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen text-white flex flex-col" style={bgStyle}>
      <button onClick={() => setView('home')}
        className="absolute top-4 right-4 bg-black/30 hover:bg-black/50 text-white/70 px-3 py-2 rounded-xl text-xs z-10 transition backdrop-blur-sm">
        ← Salir
      </button>
      <div className="flex-1 flex flex-col p-6 bg-black/20 backdrop-blur-[2px]">
        {currentAlert && (
          <div className={`mb-2 px-4 py-2 rounded-xl text-center text-sm font-bold ${severityBg[currentAlert.severity] || severityBg.info} transition-all`}>
            {currentAlert.text}
          </div>
        )}

        {layout.show_clock && (
          <div className="text-center mb-2">
            <p className="text-gray-300 font-mono text-3xl drop-shadow-lg">{now.toLocaleTimeString('es-CL')}</p>
          </div>
        )}

        {(layout.show_hospital_name || layout.show_screen_name) && (
          <div className="text-center mb-4">
            {layout.show_hospital_name && <h1 className="text-4xl font-black text-white drop-shadow-lg mb-1">{config?.hospitalName || 'HOSPITAL'}</h1>}
            {layout.show_screen_name && screenCfg?.name && <p className="text-gray-200 text-lg mb-1 drop-shadow">{screenCfg.name}</p>}
          </div>
        )}

        {banner.enabled && banner.position === 'top' && (
          <div className={topMarginClass}>{renderBanner()}</div>
        )}

        <div className={`flex gap-4 flex-1 min-h-0 ${isSidebar ? 'flex-row' : 'flex-col'}`}>
          <div className={`grid ${gridColsClass} gap-4 flex-1`}>
            {(screenData || []).map(s => {
              const isAnimating = animatingIds.has(s.id);
              return (
              <div key={s.id} className={`bg-black/40 border-2 rounded-2xl p-5 text-center flex flex-col justify-between backdrop-blur-sm ${isAnimating ? 'animate-flash-border' : ''}`}
                style={{ borderColor: s.color + '66' }}>
                <p className="text-sm font-bold mb-3 drop-shadow" style={{ color: s.color }}>{s.icon} {s.name}</p>
                <div className="bg-black/30 rounded-xl p-5 mb-3 flex-1 flex flex-col items-center justify-center">
                  <p className={`${layout.font_size} font-black tracking-widest drop-shadow-lg ${isAnimating ? 'text-yellow-300 animate-pulse-glow' : 'text-yellow-400'}`}>{s.ticket_code || '---'}</p>
                  {layout.show_patient_names && s.patient_name && (
                    <p className="text-sm text-white/80 mt-2 drop-shadow truncate max-w-full">{s.patient_name}</p>
                  )}
                </div>
                {s.box_name && <p className="text-xs text-blue-300 mb-1 drop-shadow">{s.box_name}</p>}
                <p className="text-xs text-gray-400 drop-shadow">Espera: {s.waiting ?? '—'}</p>
              </div>
              );
            })}
          </div>

          {banner.enabled && isSidebar && (
            <div className={`${sidebarWidthClass} flex-shrink-0 ${sidebarOrderClass}`}>{renderBanner()}</div>
          )}
        </div>

        {banner.enabled && banner.position === 'bottom' && (
          <div className={bottomMarginClass}>{renderBanner()}</div>
        )}
      </div>
    </div>
  );
}
