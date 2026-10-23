// The production bundle reads a separately deployed snapshot, never repository data.
declare const __PUBLISHED_JOURNAL__: boolean;
export const publishedJournal = typeof __PUBLISHED_JOURNAL__ !== 'undefined' && __PUBLISHED_JOURNAL__;
type Publication = { format: 'love-journal-publication-v1'; journal: unknown; littleJoys: unknown };
let pending: Promise<Publication> | undefined;
export function publication(): Promise<Publication> {
  pending ??= fetch('/published/content.json', { cache: 'no-store', credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw Error('已发布的手账暂时无法读取，请稍后刷新。');
      const data = await response.json() as Publication;
      if (data.format !== 'love-journal-publication-v1' || !data.journal || !('littleJoys' in data))
        throw Error('发布快照不完整，未初始化本地记录。');
      return data;
    })
    .catch((error) => { pending = undefined; throw error; });
  return pending;
}

export async function publishedLittleJoys(): Promise<unknown> {
  const response = await fetch('/published/little-joys.json', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw Error('已发布的小确幸暂时无法读取，请稍后刷新。');
  const data = await response.json() as { format: unknown; littleJoys: unknown };
  if (data.format !== 'love-journal-publication-v1' || !('littleJoys' in data))
    throw Error('小确幸发布快照不完整，未初始化本地内容。');
  return data.littleJoys;
}
