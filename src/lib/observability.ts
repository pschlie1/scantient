import * as Sentry from "@sentry/nextjs";

interface ApiLogContext {
  route: string;
  method?: string;
  orgId?: string;
  userId?: string;
  statusCode?: number;
  requestId?: string;
  details?: Record<string, unknown>;
}

const throttledEvents = new Map<string, number>();

function safeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  return { name: "UnknownError", message: "Unknown error" };
}

export function logApiError(error: unknown, context: ApiLogContext) {
  const serialized = safeError(error);

  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      event: "api_error",
      route: context.route,
      method: context.method,
      orgId: context.orgId,
      userId: context.userId,
      statusCode: context.statusCode,
      requestId: context.requestId,
      details: context.details,
      error: serialized,
    }),
  );

  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setTag("route", context.route);
      if (context.method) scope.setTag("method", context.method);
      if (context.orgId) scope.setTag("orgId", context.orgId);
      if (context.statusCode) scope.setTag("statusCode", String(context.statusCode));
      if (context.requestId) scope.setTag("requestId", context.requestId);
      if (context.details) scope.setContext("details", context.details);
      Sentry.captureException(error instanceof Error ? error : new Error(serialized.message));
    });
  }
}

export function logOperationalWarning(
  event: string,
  details?: Record<string, unknown>,
  options?: { throttleKey?: string; throttleWindowMs?: number },
) {
  const throttleKey = options?.throttleKey ?? event;
  const throttleWindowMs = options?.throttleWindowMs ?? 300_000;

  const now = Date.now();
  const previous = throttledEvents.get(throttleKey);
  if (previous && now - previous < throttleWindowMs) {
    return;
  }
  throttledEvents.set(throttleKey, now);

  console.warn(
    JSON.stringify({
      level: "warn",
      timestamp: new Date().toISOString(),
      event,
      details,
    }),
  );

  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setLevel("warning");
      if (details) scope.setContext("details", details);
      Sentry.captureMessage(event, "warning");
    });
  }
}
