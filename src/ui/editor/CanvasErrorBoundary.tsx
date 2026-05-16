import { Component, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

/**
 * Catches rendering errors inside the Konva canvas so the entire editor doesn't
 * go black. Shows a recovery button instead.
 */
export class CanvasErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error("[CanvasErrorBoundary] rendering error:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="canvas-error-recovery">
          <div className="canvas-error-icon">⚠️</div>
          <div className="canvas-error-title">שגיאה בקנבס</div>
          <div className="canvas-error-msg">{this.state.error.message}</div>
          <button
            className="btn btn-accent"
            onClick={() => this.setState({ error: null })}
            type="button"
          >
            <RotateCcw size={14} />
            נסה שנית
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
