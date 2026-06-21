import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Safety net para errores de API no capturados
window.addEventListener('unhandledrejection', (e) => {
  console.warn('[Unhandled Rejection]', e.reason?.message || e.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
