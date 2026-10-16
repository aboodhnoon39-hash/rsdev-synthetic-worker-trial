export function captionDurationLabel(startMs: number, endMs: number, fps: number): string {
  const ms = endMs - startMs;
  return `${Number((ms * fps / 1000).toFixed(2))}f · ${ms}ms`;
}
