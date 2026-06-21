const icons = { success: '✓', error: '✕', warn: '⚠' };
const styles = {
  success: 'bg-emerald-700 border-emerald-500',
  error:   'bg-red-700 border-red-500',
  warn:    'bg-amber-600 border-amber-500',
};

export const ToastContainer = ({ list }) => (
  <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm pointer-events-none">
    {list.map(t => (
      <div key={t.id}
        className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white flex items-center gap-3 pointer-events-auto animate-slide-up border-l-4 ${styles[t.type] || styles.success}`}>
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
          {icons[t.type] || '✓'}
        </span>
        <span>{t.message}</span>
      </div>
    ))}
  </div>
);
