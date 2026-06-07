import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * 1 つの catalog item のレンダリング例外をその item 内に閉じ込め、ツリー全体の
 * クラッシュを防ぐ。例: Diff (PatchDiff) は不正/複数ファイル/空の patch で render 中に
 * throw するため、Render が各 item をこれで包む。
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
            このコンテンツは表示できませんでした。
          </div>
        )
      );
    }
    return this.props.children;
  }
}
