import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Catches a render-time crash and shows what actually broke.
//
// Without a boundary, React 18 unmounts the ENTIRE tree when any component
// throws — so a fault in one panel blanks the whole admin shell and takes the
// navigation with it. A black screen tells you nothing; this tells you the
// component, the message and the stack.
//
// Errors thrown inside setInterval/setTimeout callbacks are NOT caught by React
// boundaries, so window.onerror is bridged in as well. That matters here: the
// topology engine ticks on an interval, and a throw there would otherwise only
// appear in the console.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /** Shown above the error so it is obvious which area failed. */
  label?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
  /** Errors from timers/intervals, bridged via window.onerror. */
  async: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null, async: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error("[ErrorBoundary]", this.props.label ?? "", error, info.componentStack);
  }

  componentDidMount() {
    window.addEventListener("error", this.onWindowError);
    window.addEventListener("unhandledrejection", this.onRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.onWindowError);
    window.removeEventListener("unhandledrejection", this.onRejection);
  }

  private onWindowError = (e: ErrorEvent) => {
    this.setState({ async: `${e.message}  (${e.filename}:${e.lineno})` });
  };

  private onRejection = (e: PromiseRejectionEvent) => {
    const r: any = e.reason;
    this.setState({ async: `Unhandled promise rejection: ${r?.message ?? String(r)}` });
  };

  private reset = () => this.setState({ error: null, info: null, async: null });

  render() {
    const { error, info, async: asyncError } = this.state;

    if (!error) {
      return (
        <>
          {this.props.children}
          {asyncError && (
            <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-xl border border-warn-500/40 bg-warn-950/95 p-3 text-[11px] text-warn-200 shadow-lg backdrop-blur">
              <p className="mb-1 font-bold uppercase tracking-wider">Background error</p>
              <p className="font-mono leading-relaxed">{asyncError}</p>
              <button onClick={this.reset} className="mt-2 text-[10px] underline">
                dismiss
              </button>
            </div>
          )}
        </>
      );
    }

    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 p-6">
        <AlertTriangle size={24} className="text-danger-500" />
        <p className="text-[13px] font-bold text-slate-200">
          {this.props.label ? `${this.props.label} crashed` : "This panel crashed"}
        </p>
        <p className="max-w-xl text-center font-mono text-[11px] text-danger-300">
          {error.message}
        </p>
        {info?.componentStack && (
          <details className="max-w-2xl">
            <summary className="cursor-pointer text-[11px] text-slate-400">
              component stack
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-slate-400">
              {info.componentStack.trim()}
            </pre>
          </details>
        )}
        <button
          onClick={this.reset}
          className="mt-1 flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800"
        >
          <RotateCcw size={13} /> Try again
        </button>
      </div>
    );
  }
}
