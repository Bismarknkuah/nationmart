'use client';
import React from 'react';

/**
 * A safety net around any panel that fetches and renders its own data.
 *
 * Before this, a single component reading `data.weakest.map(...)` on a response
 * whose shape had drifted (Mongo → Postgres) would throw during render and take
 * the ENTIRE page down to a white screen — the user sees nothing, not even the
 * parts that worked. That is the worst possible failure mode.
 *
 * With this, a thrown error is caught at the panel boundary: the rest of the
 * dashboard renders normally, and the broken panel shows a small, quiet fallback
 * (or nothing) instead of destroying the whole view.
 */
type Props = {
  children: React.ReactNode;
  /** What to show if this subtree throws. `null` = render nothing (quietest). */
  fallback?: React.ReactNode;
  /**
   * 'panel' (default) = small inline card, for one dashboard panel.
   * 'page' = full-height fallback with reload/home actions, for wrapping a
   * whole page in the root layout. The reload handler lives HERE (a client
   * component) so no event handler is passed across the server/client boundary.
   */
  variant?: 'panel' | 'page';
  /** Optional label to help identify the panel in logs. */
  name?: string;
};

type State = { failed: boolean };

export default class PanelBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Surfaces in the browser console for debugging without breaking the UI.
    // eslint-disable-next-line no-console
    console.error(`[panel:${this.props.name || 'unknown'}] render failed:`, error);
  }

  render() {
    if (this.state.failed) {
      if (this.props.fallback !== undefined) return this.props.fallback;

      if (this.props.variant === 'page') {
        return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong on this page</h1>
            <p className="text-slate-500 mb-6 max-w-md">
              We hit an unexpected error loading this view. Reloading usually fixes it.
            </p>
            <div className="flex gap-3">
              <a href="/" className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">Go home</a>
              <button
                onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              >
                Reload
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
          This section couldn’t load right now.
        </div>
      );
    }
    return this.props.children;
  }
}
