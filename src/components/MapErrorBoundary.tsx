import React, { Component, ErrorInfo, ReactNode } from 'react';

export interface MapErrorFallbackProps {
  onRetry?: () => void;
  error?: Error | null;
}

export function MapErrorFallback({ onRetry, error }: MapErrorFallbackProps) {
  return (
    <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8 text-center border border-slate-800 rounded-2xl shadow-inner">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl mb-4 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse">
        🗺️
      </div>
      <h3 className="text-lg font-bold text-slate-100 mb-2">
        Dočasný výpadek mapového modulu
      </h3>
      <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
        Mapové dlaždice nebo prostorová knihovna narazily na neočekávaný problém. 
        Rodičovský dispečink a bezpečnostní data trasy zůstávají plně v provozu.
      </p>
      {error && (
        <div className="mb-4 text-[10px] text-red-400 bg-red-950/50 px-3 py-1 rounded border border-red-900 max-w-sm overflow-hidden text-ellipsis">
          {error.message}
        </div>
      )}
      <button
        onClick={() => (onRetry ? onRetry() : window.location.reload())}
        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer"
      >
        <span>🔄</span> Obnovit mapové zobrazení
      </button>
    </div>
  );
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class MapErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MapErrorBoundary zachytila chybu mapy:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || <MapErrorFallback onRetry={this.handleRetry} error={this.state.error} />;
    }

    return this.props.children;
  }
}
