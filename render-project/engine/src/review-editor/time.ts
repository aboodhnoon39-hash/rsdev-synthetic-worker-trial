import {nativeDuration,nativeRanges} from '../prepared-edit/native-editor.ts';
import type { EditManifest } from "../prepared-edit/schema.ts";
import { compileEdit, sourceMsToEditFrame } from "../prepared-edit/timeline.ts";

type Compiled = ReturnType<typeof compileEdit>;



const pad = (n: number, width = 2) => String(Math.trunc(n)).padStart(width, "0");


export function formatTimecode(frame: number, fps: number): string {
  const f = Math.max(0, Math.round(frame));
  const rate = Math.max(1, Math.round(fps));
  const s = Math.floor(f / rate);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f % rate)}`;
}


export function formatSeconds(frame: number, fps: number): string {
  const sec = Math.max(0, frame) / fps;
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(2).padStart(5, "0")}`;
}





export function parseTimecode(text: string, fps: number): number | null {
  const t = text.trim();
  if (!t) return null;
  const frames = /^(\d+)\s*f$/i.exec(t);
  if (frames) return Number(frames[1]);
  const nle = /^(\d{1,3}):(\d{1,2}):(\d{1,3})$/.exec(t);
  if (nle) return (Number(nle[1]) * 60 + Number(nle[2])) * Math.round(fps) + Number(nle[3]);
  const sec = /^(?:(\d{1,3}):)?(\d{1,6}(?:\.\d+)?)$/.exec(t);
  if (sec) return Math.round((Number(sec[1] ?? 0) * 60 + Number(sec[2])) * fps);
  return null;
}

export const frameToMs = (frame: number, fps: number): number => (frame * 1000) / fps;

export const msToFrame = (ms: number, fps: number): number => Math.floor((ms * fps) / 1000 + 1e-7);




export function totalFrames(m: Pick<EditManifest, "segments"> & Partial<Pick<EditManifest,"nativeEditor">>): number {
  if(m.nativeEditor)return nativeDuration(m.nativeEditor);
  let n = 0;
  for (const s of m.segments) n += Math.max(0, s.toFrame - s.fromFrame);
  return n;
}

export const clampFrame = (frame: number, durationInFrames: number): number =>
  Math.min(Math.max(0, Math.round(frame)), Math.max(0, durationInFrames - 1));



const cache = new WeakMap<object, { ok: true; compiled: Compiled } | { ok: false; error: string }>();






export function tryCompile(m: EditManifest): { ok: true; compiled: Compiled } | { ok: false; error: string } {
  const hit = cache.get(m);
  if (hit) return hit;
  let out: { ok: true; compiled: Compiled } | { ok: false; error: string };
  try {
    out = { ok: true, compiled: compileEdit(m) };
  } catch (error) {
    out = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  cache.set(m, out);
  return out;
}




export const sourceMsToEditedFrame = (ms: number, m: EditManifest): number | null => sourceMsToEditFrame(ms, m);


export function sourceFrameToEditedFrame(sourceFrame: number, m: Pick<EditManifest, "segments"> & Partial<Pick<EditManifest,"nativeEditor">>): number | null {
  if(m.nativeEditor){const c=nativeRanges(m.nativeEditor.clips).find(c=>sourceFrame>=c.fromFrame&&sourceFrame<c.toFrame);return c?c.editFrom+Math.floor((sourceFrame-c.fromFrame)/c.speed):null;}
  let from = 0;
  for (const s of m.segments) {
    if (sourceFrame >= s.fromFrame && sourceFrame < s.toFrame) return from + sourceFrame - s.fromFrame;
    from += s.toFrame - s.fromFrame;
  }
  return null;
}


export function editedFrameToSourceFrame(editedFrame: number, m: Pick<EditManifest, "segments"> & Partial<Pick<EditManifest,"nativeEditor">>): number | null {
  if(m.nativeEditor){const c=nativeRanges(m.nativeEditor.clips).find(c=>editedFrame>=c.editFrom&&editedFrame<c.editFrom+c.duration);return c?c.fromFrame+Math.floor((editedFrame-c.editFrom)*c.speed):null;}
  let from = 0;
  for (const s of m.segments) {
    const len = s.toFrame - s.fromFrame;
    if (editedFrame >= from && editedFrame < from + len) return s.fromFrame + editedFrame - from;
    from += len;
  }
  return null;
}


export function editedFrameToSourceMs(editedFrame: number, m: Pick<EditManifest, "segments" | "source"> & Partial<Pick<EditManifest,"nativeEditor">>): number | null {
  const source = editedFrameToSourceFrame(editedFrame, m);
  return source === null ? null : frameToMs(source, m.source.fps);
}


export function segmentEditedRanges(m: Pick<EditManifest, "segments"> & Partial<Pick<EditManifest,"nativeEditor">>): { index: number; fromFrame: number; toFrame: number; sourceFrom: number; sourceTo: number }[] {
  if(m.nativeEditor)return nativeRanges(m.nativeEditor.clips).map(c=>({index:c.index,fromFrame:c.editFrom,toFrame:c.editFrom+c.duration,sourceFrom:c.fromFrame,sourceTo:c.toFrame}));
  let from = 0;
  return m.segments.map((s, index) => {
    const len = s.toFrame - s.fromFrame;
    const out = { index, fromFrame: from, toFrame: from + len, sourceFrom: s.fromFrame, sourceTo: s.toFrame };
    from += len;
    return out;
  });
}


export function wordEditedRange(m: EditManifest, sourceIndex: number): { fromFrame: number; toFrame: number } | null {
  const r = tryCompile(m);
  if (!r.ok) return null;
  const w = r.compiled.words.find((x) => x.sourceIndex === sourceIndex);
  return w ? { fromFrame: w.fromFrame, toFrame: w.toFrame } : null;
}


export function plateIsStale(m: Pick<EditManifest, "segments">, plate: { segments: { fromFrame: number; toFrame: number }[] } | null): boolean {
  if (!plate) return true;
  if (plate.segments.length !== m.segments.length) return true;
  return m.segments.some((s, i) => s.fromFrame !== plate.segments[i].fromFrame || s.toFrame !== plate.segments[i].toFrame);
}
