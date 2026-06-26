import { describe, expect, it, vi } from 'vitest';
import { isSupabaseSessionExpired, normalizeSupabaseUrl } from '../lib/supabaseSync';

describe('supabase sync helpers', () => {
  it('normalizes trailing slashes in project url', () => {
    expect(normalizeSupabaseUrl('https://demo.supabase.co///')).toBe('https://demo.supabase.co');
  });

  it('detects expiring sessions with safety skew', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00Z'));

    expect(
      isSupabaseSessionExpired({
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 20_000,
        tokenType: 'bearer',
        user: {
          id: 'user-1',
          email: 'user@example.com'
        }
      })
    ).toBe(true);

    expect(
      isSupabaseSessionExpired({
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 120_000,
        tokenType: 'bearer',
        user: {
          id: 'user-1',
          email: 'user@example.com'
        }
      })
    ).toBe(false);

    vi.useRealTimers();
  });
});
