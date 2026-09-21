import { useSyncExternalStore } from 'react';

// A tiny message bus for the island: anything in the app can call
// showStatus('Added to workspace') and the clock pill briefly morphs into a
// small confirmation, then settles back into the time.

export type StatusIcon = 'check' | 'copy' | 'info' | 'bell';

export interface StatusAction {
  label: string;
  run: () => void;
}

export interface IslandStatus {
  // Changes with every message, so a repeat of the same text still re-shows.
  id: number;
  text: string;
  icon: StatusIcon;
  // Small buttons after the message ("+5 min", "Dismiss").
  actions?: StatusAction[];
}

const DEFAULT_MS = 2200;

let current: IslandStatus | null = null;
let nextId = 1;
let timer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function showStatus(
  text: string,
  icon: StatusIcon = 'check',
  durationMs = DEFAULT_MS,
  actions?: StatusAction[],
) {
  window.clearTimeout(timer);
  current = { id: nextId++, text, icon, actions };
  emit();
  timer = window.setTimeout(() => {
    current = null;
    emit();
  }, durationMs);
}

export function clearStatus() {
  window.clearTimeout(timer);
  if (current !== null) {
    current = null;
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIslandStatus(): IslandStatus | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
