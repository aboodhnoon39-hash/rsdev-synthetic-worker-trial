import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { EditManifest } from "../prepared-edit/schema.ts";
import { clampFrame, totalFrames } from "./time.ts";
import { COALESCE_MS, UNDO_CAP, type EditorSnapshot, type Selection } from "./types.ts";

export type Update = EditManifest | ((current: EditManifest) => EditManifest);
export type ApplyOptions = {

  coalesce?: string | false;
};
export type ApplyFn = (update: Update, label: string, options?: ApplyOptions) => void;

type Step = { manifest: EditManifest; label: string };

export type EditorStore = {
  getSnapshot: () => EditorSnapshot;
  subscribe: (listener: () => void) => () => void;
  apply: ApplyFn;
  undo: () => void;
  redo: () => void;

  markSaved: (saved?: EditManifest) => void;

  replace: (manifest: EditManifest) => void;
  select: (selection: Selection) => void;
  selectNative: (id: string | null) => void;

  setPlayhead: (frame: number) => void;

  seek: (frame: number) => void;
};


export const mutate = (fn: (draft: EditManifest) => void): ((current: EditManifest) => EditManifest) => (current) => {
  const draft = structuredClone(current);
  fn(draft);
  return draft;
};

export function createEditorStore(initial: EditManifest, options: { now?: () => number; undoCap?: number } = {}): EditorStore {
  const now = options.now ?? (() => Date.now());
  const cap = options.undoCap ?? UNDO_CAP;
  let current = initial;
  let saved = initial;
  let past: Step[] = [];
  let future: Step[] = [];
  let revision = 0;
  let selection: Selection = null;
  let nativeSelectionId: string | null = initial.nativeEditor?.selectedId ?? null;
  let playhead = 0;
  let seekNonce = 0;
  let run: { key: string; at: number } | null = null;
  const listeners = new Set<() => void>();

  const build = (): EditorSnapshot => ({
    manifest: current,
    savedManifest: saved,
    dirty: current !== saved,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past.at(-1)?.label ?? null,
    redoLabel: future.at(-1)?.label ?? null,
    revision,
    selection,
    nativeSelectionId,
    playhead,
    seekNonce,
    durationInFrames: totalFrames(current),
  });
  let snapshot = build();
  const commit = () => {
    snapshot = build();
    for (const l of [...listeners]) l();
  };
  const clampPlayhead = () => { playhead = clampFrame(playhead, totalFrames(current)); };

  const validNativeId = (id: string | null) => id !== null && [...(current.nativeEditor?.clips ?? []), ...(current.nativeEditor?.layers ?? [])].some(item => item.id === id);
  const normalizeNativeSelection = () => { if (!validNativeId(nativeSelectionId)) nativeSelectionId = null; };

  const changeTo = (next: EditManifest) => {
    current = next;
    normalizeNativeSelection();
    revision++;
    clampPlayhead();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply(update, label, opts = {}) {
      const next = typeof update === "function" ? update(current) : update;
      if (next === current) return;
      const key = opts.coalesce === false ? null : (opts.coalesce ?? label);
      const t = now();
      const merge = key !== null && run !== null && run.key === key && t - run.at <= COALESCE_MS && past.length > 0;
      if (!merge) {
        past.push({ manifest: current, label });
        if (past.length > cap) past = past.slice(past.length - cap);
      }
      future = [];
      run = key === null ? null : { key, at: t };
      changeTo(next);
      commit();
    },
    undo() {
      const step = past.pop();
      if (!step) return;
      future.push({ manifest: current, label: step.label });
      run = null;
      changeTo(step.manifest);
      commit();
    },
    redo() {
      const step = future.pop();
      if (!step) return;
      past.push({ manifest: current, label: step.label });
      run = null;
      changeTo(step.manifest);
      commit();
    },
    markSaved(manifest) {
      saved = manifest ?? current;
      run = null;
      commit();
    },
    replace(manifest) {
      current = manifest;
      normalizeNativeSelection();
      saved = manifest;
      past = [];
      future = [];
      run = null;
      revision++;
      clampPlayhead();
      commit();
    },
    selectNative(id) {
      const next = validNativeId(id) ? id : null;
      if (nativeSelectionId === next) return;
      nativeSelectionId = next;
      run = null;
      commit();
    },
    select(next) {
      selection = next;
      commit();
    },
    setPlayhead(frame) {
      const f = clampFrame(frame, totalFrames(current));
      if (f === playhead) return;
      playhead = f;
      commit();
    },
    seek(frame) {
      playhead = clampFrame(frame, totalFrames(current));
      seekNonce++;
      commit();
    },
  };
}



const StoreContext = createContext<EditorStore | null>(null);

export const EditorStoreProvider = ({ store, children }: { store: EditorStore; children?: ReactNode }) =>
  createElement(StoreContext.Provider, { value: store }, children);

export function useEditorStore(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useEditorStore outside <EditorStoreProvider>");
  return store;
}





export function useEditor<T>(select: (snapshot: EditorSnapshot) => T, store?: EditorStore): T {
  const fromContext = useContext(StoreContext);
  const s = store ?? fromContext;
  if (!s) throw new Error("useEditor outside <EditorStoreProvider>");
  return useSyncExternalStore(s.subscribe, () => select(s.getSnapshot()), () => select(s.getSnapshot()));
}
