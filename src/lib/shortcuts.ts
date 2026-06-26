import type { ShortcutMap } from '../types';

export type ShortcutAction = keyof ShortcutMap;

const SEQUENCE_TIMEOUT = 900;

export interface ShortcutState {
  buffer: string[];
  lastPressedAt: number;
}

export interface ShortcutResolution {
  action?: ShortcutAction;
  nextState: ShortcutState;
}

export function normalizeKeyToken(key: string): string {
  if (key === 'Esc') {
    return 'Escape';
  }

  return key.length === 1 ? key.toLowerCase() : key;
}

export function parseShortcut(shortcut: string): string[] {
  return shortcut
    .split(/\s+/)
    .map((token) => normalizeKeyToken(token.trim()))
    .filter(Boolean);
}

function isPrefix(prefix: string[], full: string[]): boolean {
  if (prefix.length > full.length) {
    return false;
  }

  return prefix.every((token, index) => token === full[index]);
}

export function resolveShortcut(
  key: string,
  state: ShortcutState,
  map: ShortcutMap,
  now: number = Date.now()
): ShortcutResolution {
  const token = normalizeKeyToken(key);
  const elapsed = now - state.lastPressedAt;
  const previousBuffer = elapsed > SEQUENCE_TIMEOUT ? [] : state.buffer;
  const candidate = [...previousBuffer, token];

  const entries: Array<[ShortcutAction, string[]]> = (
    Object.keys(map) as ShortcutAction[]
  ).map((action) => [action, parseShortcut(map[action])]);

  for (const [action, sequence] of entries) {
    if (sequence.length === candidate.length && isPrefix(candidate, sequence)) {
      return {
        action,
        nextState: { buffer: [], lastPressedAt: now }
      };
    }
  }

  const hasPrefix = entries.some(([, sequence]) => isPrefix(candidate, sequence));
  if (hasPrefix) {
    return {
      nextState: { buffer: candidate, lastPressedAt: now }
    };
  }

  const singleBuffer = [token];
  for (const [action, sequence] of entries) {
    if (sequence.length === 1 && sequence[0] === token) {
      return {
        action,
        nextState: { buffer: [], lastPressedAt: now }
      };
    }
  }

  const startsAnother = entries.some(([, sequence]) => isPrefix(singleBuffer, sequence));
  return {
    nextState: {
      buffer: startsAnother ? singleBuffer : [],
      lastPressedAt: now
    }
  };
}

export function isTextInputLike(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

export const DEFAULT_SHORTCUT_STATE: ShortcutState = {
  buffer: [],
  lastPressedAt: 0
};
