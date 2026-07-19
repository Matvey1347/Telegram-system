import { APPLICATION_LOG_SENSITIVE_KEYS } from './application-logs.constants';

const MAX_DEPTH = 5;
const MAX_KEYS = 50;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 2000;
const MAX_STACK_LENGTH = 12000;

const REDACTED = '[REDACTED]';

function truncateString(value: string, limit = MAX_STRING_LENGTH) {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return APPLICATION_LOG_SENSITIVE_KEYS.some((part) =>
    normalized.includes(part),
  );
}

function safeError(error: Error) {
  return {
    name: truncateString(error.name || 'Error', 200),
    message: truncateString(error.message || 'Unknown error'),
    stack: truncateString(error.stack || '', MAX_STACK_LENGTH) || undefined,
  };
}

export function sanitizeLogValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value == null) return value ?? null;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return '[Function]';
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return safeError(value);
  if (Buffer.isBuffer(value)) return `[Buffer:${value.length}]`;

  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeLogValue(item, depth + 1, seen));
    }

    const decimalLike = value as { toJSON?: () => unknown; toString?: () => string };
    if (
      value?.constructor?.name === 'Decimal' ||
      value?.constructor?.name === 'Integer'
    ) {
      return truncateString(decimalLike.toString?.() || String(value), 200);
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_KEYS,
    );
    return Object.fromEntries(
      entries.map(([key, nested]) => [
        key,
        isSensitiveKey(key)
          ? REDACTED
          : sanitizeLogValue(nested, depth + 1, seen),
      ]),
    );
  }

  return truncateString(String(value), 200);
}

export function sanitizeLogMetadata(value: unknown) {
  const sanitized = sanitizeLogValue(value);
  if (sanitized == null) return null;
  return sanitized as Record<string, unknown>;
}
