import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Aktualizace stavu, aby se při dalším renderu zobrazilo náhradní UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Neošetřená chyba chycena ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-200 p-8">
          <div className="bg-slate-800 p-6 rounded-xl border border-rose-500 shadow-2xl max-w-lg w-full text-center">
            <div className="text-5xl mb-4">💥</div>
            <h1 className="text-2xl font-bold text-rose-400 mb-2">Aplikace narazila na problém</h1>
            <p className="text-slate-400 mb-4 text-sm">
              Něco se pokazilo. Omlouváme se za komplikace. Můžete aplikaci zkusit znovu načíst.
            </p>
            <div className="bg-slate-950 p-3 rounded text-left text-xs font-mono text-rose-300 mb-6 overflow-auto max-h-32">
              {this.state.error?.toString()}
            </div>
            <button
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition-colors w-full"
              onClick={() => window.location.reload()}
            >
              🔄 Znovu načíst aplikaci
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
