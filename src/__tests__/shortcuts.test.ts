import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUT_STATE, resolveShortcut } from '../lib/shortcuts';
import { DEFAULT_SETTINGS } from '../constants';

describe('shortcut sequence', () => {
  it('fires single-key shortcut', () => {
    const out = resolveShortcut('/', DEFAULT_SHORTCUT_STATE, DEFAULT_SETTINGS.shortcuts, 1);
    expect(out.action).toBe('focusSearch');
  });

  it('fires sequence shortcut g then h', () => {
    const step1 = resolveShortcut('g', DEFAULT_SHORTCUT_STATE, DEFAULT_SETTINGS.shortcuts, 1);
    expect(step1.action).toBeUndefined();
    const step2 = resolveShortcut('h', step1.nextState, DEFAULT_SETTINGS.shortcuts, 2);
    expect(step2.action).toBe('goHistory');
  });

  it('clears expired sequence buffer', () => {
    const step1 = resolveShortcut('g', DEFAULT_SHORTCUT_STATE, DEFAULT_SETTINGS.shortcuts, 1);
    const step2 = resolveShortcut('h', step1.nextState, DEFAULT_SETTINGS.shortcuts, 2000);
    expect(step2.action).toBeUndefined();
  });

  it('keeps buffer when key is valid prefix', () => {
    const out = resolveShortcut('g', DEFAULT_SHORTCUT_STATE, DEFAULT_SETTINGS.shortcuts, 100);
    expect(out.nextState.buffer).toEqual(['g']);
  });
});
