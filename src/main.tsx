import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    (window as any).__RAFI_LOADED__ = true;
    const root = createRoot(rootElement);
    root.render(<App />);
  } catch (err) {
    console.error('Fatal initialization error:', err);
    rootElement.innerHTML = `
      <div style="padding: 20px; text-align: center; font-family: sans-serif;">
        <h2 style="color: #ef4444;">System Failed to Start</h2>
        <p style="color: #666;">${err instanceof Error ? err.message : 'Unknown error'}</p>
        <button onclick="localStorage.clear(); sessionStorage.clear(); location.href=location.pathname" style="padding: 10px 20px; border-radius: 6px; border: none; background: #4338ca; color: white; cursor: pointer;">
          Hard Reset & Retry
        </button>
      </div>
    `;
  }
}
