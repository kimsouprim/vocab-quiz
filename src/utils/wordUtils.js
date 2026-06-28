export function normalizeWordKey(word) {
  return String(word ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}
