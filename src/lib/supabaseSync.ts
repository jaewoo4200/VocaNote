import type { BackupPayload, SupabaseSession, SupabaseSyncConfig, SupabaseUser } from '../types';

interface AuthSessionResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: {
    id: string;
    email?: string;
  };
}

interface VaultRowResponse {
  payload: BackupPayload;
  updated_at: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function normalizeSupabaseUrl(url: string): string {
  return trimTrailingSlash(url.trim());
}

function buildAuthHeaders(config: SupabaseSyncConfig, accessToken?: string): HeadersInit {
  return {
    apikey: config.anonKey,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json'
  };
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `HTTP ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const message =
      (typeof parsed.msg === 'string' && parsed.msg) ||
      (typeof parsed.error_description === 'string' && parsed.error_description) ||
      (typeof parsed.error === 'string' && parsed.error) ||
      (typeof parsed.message === 'string' && parsed.message);

    return message || `HTTP ${response.status}`;
  } catch {
    return text;
  }
}

function requireConfig(config: SupabaseSyncConfig): void {
  if (!normalizeSupabaseUrl(config.url) || !config.anonKey.trim()) {
    throw new Error('Supabase URL과 anon key를 먼저 설정해주세요.');
  }
}

function toSupabaseSession(payload: AuthSessionResponse): SupabaseSession {
  if (!payload.access_token || !payload.refresh_token || !payload.user?.id) {
    throw new Error('Supabase 세션 응답이 올바르지 않습니다.');
  }

  const expiresAt =
    typeof payload.expires_at === 'number'
      ? payload.expires_at * 1000
      : Date.now() + Math.max(payload.expires_in ?? 3600, 60) * 1000;

  const user: SupabaseUser = {
    id: payload.user.id,
    email: payload.user.email
  };

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    tokenType: payload.token_type ?? 'bearer',
    user
  };
}

export function isSupabaseSessionExpired(session: SupabaseSession, skewMs: number = 30_000): boolean {
  return session.expiresAt <= Date.now() + skewMs;
}

export async function sendSupabaseEmailOtp(config: SupabaseSyncConfig, email: string): Promise<void> {
  requireConfig(config);
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    throw new Error('로그인할 이메일을 입력해주세요.');
  }

  const url = `${normalizeSupabaseUrl(config.url)}/auth/v1/otp`;
  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify({
      email: normalizedEmail,
      create_user: true
    })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

export async function verifySupabaseEmailOtp(
  config: SupabaseSyncConfig,
  email: string,
  token: string
): Promise<SupabaseSession> {
  requireConfig(config);
  const normalizedEmail = email.trim();
  const normalizedToken = token.trim();

  if (!normalizedEmail || !normalizedToken) {
    throw new Error('이메일과 인증 코드를 모두 입력해주세요.');
  }

  const url = `${normalizeSupabaseUrl(config.url)}/auth/v1/verify`;
  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify({
      email: normalizedEmail,
      token: normalizedToken,
      type: 'email'
    })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return toSupabaseSession((await response.json()) as AuthSessionResponse);
}

export async function refreshSupabaseSession(
  config: SupabaseSyncConfig,
  refreshToken: string
): Promise<SupabaseSession> {
  requireConfig(config);
  if (!refreshToken.trim()) {
    throw new Error('Supabase refresh token이 없습니다.');
  }

  const url = `${normalizeSupabaseUrl(config.url)}/auth/v1/token?grant_type=refresh_token`;
  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify({
      refresh_token: refreshToken.trim()
    })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return toSupabaseSession((await response.json()) as AuthSessionResponse);
}

export async function signOutSupabase(config: SupabaseSyncConfig, session: SupabaseSession): Promise<void> {
  requireConfig(config);
  const url = `${normalizeSupabaseUrl(config.url)}/auth/v1/logout`;
  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(config, session.accessToken)
  });

  if (!response.ok && response.status !== 401) {
    throw new Error(await parseError(response));
  }
}

export async function readSupabaseBackup(
  config: SupabaseSyncConfig,
  session: SupabaseSession
): Promise<BackupPayload | null> {
  requireConfig(config);
  const baseUrl = normalizeSupabaseUrl(config.url);
  const query = encodeURIComponent(session.user.id);
  const url = `${baseUrl}/rest/v1/sync_vaults?select=payload,updated_at&owner_id=eq.${query}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const rows = (await response.json()) as VaultRowResponse[];
  const payload = rows[0]?.payload;
  if (!payload) {
    return null;
  }

  return payload;
}

export async function upsertSupabaseBackup(
  config: SupabaseSyncConfig,
  session: SupabaseSession,
  payload: BackupPayload
): Promise<void> {
  requireConfig(config);
  const baseUrl = normalizeSupabaseUrl(config.url);
  const url = `${baseUrl}/rest/v1/sync_vaults?on_conflict=owner_id`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([
      {
        owner_id: session.user.id,
        payload
      }
    ])
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}
