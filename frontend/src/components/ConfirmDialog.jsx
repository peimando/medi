export const ConfirmDialog = ({ state, onConfirm, onCancel }) => {
  if (!state) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onCancel}>
      <div className="card p-6 max-w-sm w-full shadow-xl animate-slide-up"
        onClick={e => e.stopPropagation()}>
        <p className="font-bold text-lg text-gray-900 mb-1">{state.msg}</p>
        {state.detail && <p className="text-gray-500 text-sm mb-5">{state.detail}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold text-sm text-gray-700 transition">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition ${state.danger !== false ? 'bg-red-600 hover:bg-red-700' : 'bg-accent-500 hover:bg-accent-600'}`}>
            {state.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};
