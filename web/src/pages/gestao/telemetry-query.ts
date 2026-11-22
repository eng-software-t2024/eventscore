export function parametrosTelemetria(eventType: string): string {
  const params = new URLSearchParams({ limite: '100' });
  if (eventType) params.set('tipo', eventType);
  return params.toString();
}
