/** "https://example.com/a/b?x=1" → "/a/b?x=1"; non-URLs pass through. */
export function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}
