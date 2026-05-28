import type { PhotoSession } from './types';

export function buildPostTourUrl(session?: PhotoSession) {
  if (!session) return 'https://galeria.pictour.app/g/sem-sessao';
  if (session.cloudGalleryUrl) return session.cloudGalleryUrl;
  if (session.postTourUrl && !session.postTourUrl.includes('galeria.pictour.app')) return session.postTourUrl;
  if (session.localGalleryUrl) return session.localGalleryUrl;
  if (session.postTourUrl) return session.postTourUrl;
  const fallbackSlug = `${session.code}-${session.customerName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `https://galeria.pictour.app/g/${session.publicSlug || fallbackSlug}`;
}

export function buildProtectedGalleryUrl(session?: PhotoSession) {
  const baseUrl = buildPostTourUrl(session);
  const code = session?.accessCode ? `?code=${encodeURIComponent(session.accessCode)}` : '';
  return `${baseUrl}${code}`;
}

export function getDaysUntilExpiration(expiresAt?: string) {
  if (!expiresAt) return 0;
  const end = new Date(`${expiresAt}T23:59:59`);
  const diffMs = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
}

export function createQrLikeMatrix(input: string, size = 15) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const matrix: boolean[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x += 1) {
      const inFinder =
        (x < 5 && y < 5) ||
        (x >= size - 5 && y < 5) ||
        (x < 5 && y >= size - 5);

      if (inFinder) {
        const localX = x < 5 ? x : x - (size - 5);
        const localY = y < 5 ? y : y - (size - 5);
        row.push(localX === 0 || localY === 0 || localX === 4 || localY === 4 || (localX === 2 && localY === 2));
        continue;
      }

      const value = Math.abs(Math.imul(hash + x * 374761393 + y * 668265263, 2246822519));
      row.push(value % 7 < 3);
    }
    matrix.push(row);
  }
  return matrix;
}
