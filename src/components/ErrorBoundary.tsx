import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadBackup } from '../game/backup';

interface State {
  error: Error | null;
  saved: string | null;
}

/**
 * Last line of defence: if a screen ever crashes, you see this instead of a blank page,
 * and you can save a backup of your data before reloading.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, saved: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, saved: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ARISE crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="sys-window mx-auto mt-10 max-w-md space-y-3 p-5" role="alert">
        <p className="sys-title">[ System error ]</p>
        <p className="text-lg font-bold">Something went wrong.</p>
        <p className="text-sm text-muted">Your data is safe on this phone. You can save a backup first, then reload the app.</p>
        <p className="break-words rounded-lg border border-line bg-black/30 p-2 text-xs text-muted">{this.state.error.message}</p>
        <button className="min-h-12 w-full rounded-lg border border-line" onClick={async () => {
          try { this.setState({ saved: await downloadBackup() }); } catch { this.setState({ saved: 'failed' }); }
        }}>Save a backup file</button>
        {this.state.saved && <p className="text-sm text-accent">{this.state.saved === 'failed' ? 'Could not save a backup.' : `Saved ${this.state.saved}`}</p>}
        <button className="min-h-12 w-full rounded-lg bg-accent font-semibold text-black" onClick={() => location.reload()}>Reload the app</button>
      </div>
    );
  }
}
