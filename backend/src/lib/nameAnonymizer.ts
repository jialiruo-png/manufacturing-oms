import type { RequestHandler } from 'express';

function textFromCodePoints(points: number[]) {
  return String.fromCodePoint(...points);
}

const NAME_REPLACEMENTS = [
  [textFromCodePoints([0x8d3e, 0x4e3d, 0x5a7c]), '林嘉宁'],
  [textFromCodePoints([0x97e6, 0x5929, 0x8bda]), '周启明'],
] as const;

export function anonymizeText(value: string) {
  return NAME_REPLACEMENTS.reduce(
    (text, [realName, demoName]) => text.split(realName).join(demoName),
    value,
  );
}

export function anonymizeValue<T>(value: T): T {
  if (typeof value === 'string') return anonymizeText(value) as T;
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => anonymizeValue(item)) as T;
  if (typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = anonymizeValue(nestedValue);
  }
  return output as T;
}

export const anonymizeResponseBody: RequestHandler = (_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => originalJson(anonymizeValue(body))) as typeof res.json;
  next();
};
