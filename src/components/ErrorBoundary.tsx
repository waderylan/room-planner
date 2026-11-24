import { Component, type ReactNode } from "react";
import { Button } from "./ui/Button";

export class ErrorBoundary extends Component<
  { children: ReactNode; message?: string; onRecover?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="view-loading" role="alert">
          <p>
            {this.props.message || "Room Planner could not open this view."}
          </p>
          <Button
            onClick={() => {
              this.props.onRecover?.();
              this.setState({ failed: false });
            }}
          >
            Try again
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      );
    return this.props.children;
  }
}
