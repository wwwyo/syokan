import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "@/lib/i18n";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Confines a child's render exception within this boundary, preventing a crash of the whole tree.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render item failed:", error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            data-slot="render-error"
            className="my-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-muted-foreground"
          >
            {t.view.renderError}
          </div>
        )
      );
    }
    return this.props.children;
  }
}
