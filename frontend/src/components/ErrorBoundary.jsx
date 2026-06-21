import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="card p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Error inesperado</h1>
            <p className="text-gray-500 text-sm mb-6">Ocurrió un error al mostrar esta página. Intenta recargar.</p>
            <button onClick={() => window.location.reload()}
              className="btn-primary px-6 py-3 text-sm">
              Recargar página
            </button>
            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Detalles técnicos</summary>
                <pre className="mt-2 text-xs text-red-600 bg-gray-50 p-3 rounded-xl overflow-auto max-h-32 border border-gray-200">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
