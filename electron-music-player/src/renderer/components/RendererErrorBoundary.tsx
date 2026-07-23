import {
  Component,
  type ErrorInfo,
  type ReactNode
} from 'react';
import { reportRendererDiagnostic, toErrorDetails } from '../utils/runtimeDiagnostics';

interface RendererErrorBoundaryFallbackArgs {
  error: Error;
  reset: () => void;
}

interface RendererErrorBoundaryProps {
  area: string;
  children: ReactNode;
  entityId?: string;
  fallback: ReactNode | ((args: RendererErrorBoundaryFallbackArgs) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: string | number;
}

interface RendererErrorBoundaryState {
  error: Error | null;
}

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const details = toErrorDetails(error);
    reportRendererDiagnostic({
      level: 'error',
      event: 'react-error-boundary',
      area: this.props.area,
      message: details.message,
      stack: [details.stack, errorInfo.componentStack].filter(Boolean).join('\n'),
      entityId: this.props.entityId
    });
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(previousProps: RendererErrorBoundaryProps): void {
    if (
      this.state.error
      && previousProps.resetKey !== this.props.resetKey
    ) {
      this.reset();
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return typeof this.props.fallback === 'function'
      ? this.props.fallback({ error, reset: this.reset })
      : this.props.fallback;
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };
}
