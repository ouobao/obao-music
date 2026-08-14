export type RendererDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RendererDiagnosticEvent {
  level: RendererDiagnosticLevel;
  event: string;
  area?: string;
  message?: string;
  stack?: string;
  route?: string;
  entityId?: string;
  timestamp: number;
}

const MAX_MESSAGE_LENGTH = 512;
const MAX_STACK_LENGTH = 2_048;

export function reportRendererDiagnostic(
  event: Omit<RendererDiagnosticEvent, 'timestamp'>
): void {
  const diagnostic = normalizeDiagnostic(event);
  const report = window.musicPlayer?.diagnostics?.report;

  if (!report) {
    if (diagnostic.level === 'error') {
      console.error(`[renderer:${diagnostic.event}]`, diagnostic.message ?? '', diagnostic.stack ?? '');
    }
    return;
  }

  try {
    report(diagnostic);
  } catch (error) {
    console.error('Failed to report renderer diagnostic', error);
  }
}

export function installGlobalRendererDiagnostics(): () => void {
  const handleError = (event: ErrorEvent) => {
    reportRendererDiagnostic({
      level: 'error',
      event: 'renderer-error',
      area: 'window',
      message: event.message || 'Unknown renderer error',
      stack: event.error instanceof Error ? event.error.stack : undefined,
      route: getRendererRoute()
    });
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = toErrorDetails(event.reason);
    reportRendererDiagnostic({
      level: 'error',
      event: 'renderer-unhandled-rejection',
      area: 'window',
      message: error.message,
      stack: error.stack,
      route: getRendererRoute()
    });
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}

export function toErrorDetails(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return {
      message: value.message || value.name,
      stack: value.stack
    };
  }

  return {
    message: typeof value === 'string' ? value : 'Unknown error'
  };
}

function normalizeDiagnostic(
  event: Omit<RendererDiagnosticEvent, 'timestamp'>
): RendererDiagnosticEvent {
  return {
    level: event.level,
    event: truncate(event.event, 80),
    ...(event.area ? { area: truncate(event.area, 64) } : {}),
    ...(event.message ? { message: truncate(event.message, MAX_MESSAGE_LENGTH) } : {}),
    ...(event.stack ? { stack: truncate(event.stack, MAX_STACK_LENGTH) } : {}),
    ...(event.route ? { route: truncate(event.route, 256) } : {}),
    ...(event.entityId ? { entityId: truncate(event.entityId, 128) } : {}),
    timestamp: Date.now()
  };
}

function getRendererRoute(): string {
  return window.location.pathname;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
