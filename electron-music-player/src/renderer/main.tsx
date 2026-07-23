import React, { useEffect, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { RefreshCw } from 'lucide-react';
import { App } from './App';
import { RendererErrorBoundary } from './components/RendererErrorBoundary';
import { installGlobalRendererDiagnostics } from './utils/runtimeDiagnostics';
import './styles/global.css';

installGlobalRendererDiagnostics();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RendererReadyReporter>
      <RendererErrorBoundary
        area="root"
        fallback={<RendererRootFallback />}
      >
        <App />
      </RendererErrorBoundary>
    </RendererReadyReporter>
  </React.StrictMode>
);

function RendererReadyReporter({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.musicPlayer?.diagnostics?.markReady();
  }, []);

  return children;
}

function RendererRootFallback() {
  return (
    <main className="app-shell" role="alert">
      <section className="startup-panel" aria-label="应用恢复">
        <p className="startup-kicker">欧包音乐</p>
        <h1>页面暂时无法显示</h1>
        <p>已记录本次异常。重新加载后可以继续使用。</p>
        <div className="startup-actions">
          <button
            className="startup-reload-button"
            onClick={() => window.location.reload()}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
            重新加载
          </button>
        </div>
      </section>
    </main>
  );
}
