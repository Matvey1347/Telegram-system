import { randomUUID } from 'node:crypto';

const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

export function normalizeCorrelationId(raw: unknown) {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return CORRELATION_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function createCorrelationId() {
  return randomUUID();
}
