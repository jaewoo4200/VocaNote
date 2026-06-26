import { BACKUP_SCHEMA_VERSION } from '../constants';
import type { BackupPayload } from '../types';

const GIST_FILENAME = 'vocab-vault.json';
const GITHUB_API = 'https://api.github.com';

function authHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function assertGithubApiUrl(url: string): void {
  if (!url.startsWith(GITHUB_API)) {
    throw new Error('Unsupported API host.');
  }
}

export function createEmptyBackup(): BackupPayload {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries: [],
    history: []
  };
}

function parseBackup(content: string): BackupPayload {
  const raw = JSON.parse(content) as Partial<BackupPayload>;

  return {
    schemaVersion: raw.schemaVersion ?? BACKUP_SCHEMA_VERSION,
    exportedAt: raw.exportedAt ?? new Date().toISOString(),
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    history: Array.isArray(raw.history) ? raw.history : []
  };
}

export async function createPrivateGist(token: string, payload: BackupPayload): Promise<string> {
  const url = `${GITHUB_API}/gists`;
  assertGithubApiUrl(url);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: 'Voca Note sync vault',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create gist (${response.status})`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

export async function readGistBackup(token: string, gistId: string): Promise<BackupPayload> {
  const url = `${GITHUB_API}/gists/${gistId}`;
  assertGithubApiUrl(url);

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch gist (${response.status})`);
  }

  const data = (await response.json()) as {
    files?: Record<string, { content?: string }>;
  };

  const file = data.files?.[GIST_FILENAME];
  if (!file?.content) {
    return createEmptyBackup();
  }

  return parseBackup(file.content);
}

export async function updateGistBackup(
  token: string,
  gistId: string,
  payload: BackupPayload
): Promise<void> {
  const url = `${GITHUB_API}/gists/${gistId}`;
  assertGithubApiUrl(url);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to update gist (${response.status})`);
  }
}
