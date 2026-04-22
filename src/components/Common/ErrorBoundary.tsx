import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global Stability Layer: ErrorBoundary
 * Catches runtime crashes in sub-sections of the UI to prevent total app failure.
 */
class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`🔴 [ErrorBoundary:${this.props.name || 'Generic'}] Uncaught error:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-12 bg-red-50 rounded-[2rem] border-2 border-dashed border-red-200 m-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-microchip text-2xl text-red-500"></i>
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Interface Interrupted</h2>
            <p className="text-gray-500 mb-8 font-medium">
              The {this.props.name || 'component'} encountered an unexpected technical issue.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="px-8 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                Attempt Recovery
              </button>
              <button
                onClick={() => window.location.reload()}
                className="text-gray-400 text-sm font-bold hover:text-gray-600"
              >
                Full System Restart
              </button>
            </div>
            {import.meta.env.DEV && (
              <div className="mt-8 p-4 bg-gray-900 rounded-xl text-left overflow-auto max-h-40">
                <code className="text-xs text-red-400 font-mono">
                  {this.state.error?.message}
                  <br />
                  {this.state.error?.stack}
                </code>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
