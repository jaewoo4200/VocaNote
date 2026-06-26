import { useEffect, useRef } from 'react';
import type { PanelKey, ShortcutMap } from '../types';
import {
  DEFAULT_SHORTCUT_STATE,
  isTextInputLike,
  normalizeKeyToken,
  resolveShortcut,
  type ShortcutAction,
  type ShortcutState
} from '../lib/shortcuts';

interface UseKeyboardShortcutsInput {
  shortcuts: ShortcutMap;
  onNavigate: (panel: PanelKey) => void;
  onFocusSearch: () => void;
  onClose: () => void;
  onOpenHelp: () => void;
}

const NAV_ACTIONS: Partial<Record<ShortcutAction, PanelKey>> = {
  goHistory: 'history',
  goWordbook: 'wordbook',
  goAbbrev: 'abbrev',
  goReview: 'review',
  goSettings: 'settings'
};

export function useKeyboardShortcuts({
  shortcuts,
  onNavigate,
  onFocusSearch,
  onClose,
  onOpenHelp
}: UseKeyboardShortcutsInput): void {
  const stateRef = useRef<ShortcutState>(DEFAULT_SHORTCUT_STATE);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const token = normalizeKeyToken(event.key);

      const isInputTarget = isTextInputLike(event.target);
      if (isInputTarget) {
        if (token === 'Escape') {
          event.preventDefault();
          onClose();
        }
        return;
      }

      const { action, nextState } = resolveShortcut(token, stateRef.current, shortcuts);
      stateRef.current = nextState;

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === 'focusSearch') {
        onFocusSearch();
        return;
      }

      if (action === 'close') {
        onClose();
        return;
      }

      if (action === 'help') {
        onOpenHelp();
        return;
      }

      const panel = NAV_ACTIONS[action];
      if (panel) {
        onNavigate(panel);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onFocusSearch, onNavigate, onOpenHelp, shortcuts]);
}
