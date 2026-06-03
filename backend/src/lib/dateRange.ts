const RANGE_MONTHS: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

export function startDateForRange(range: unknown) {
  if (range === undefined || range === null || range === '') return null;
  if (typeof range !== 'string' || !(range in RANGE_MONTHS)) return undefined;

  const start = new Date();
  start.setMonth(start.getMonth() - RANGE_MONTHS[range]);
  start.setHours(0, 0, 0, 0);
  return start;
}
