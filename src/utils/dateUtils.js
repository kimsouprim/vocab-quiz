export function today() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${y}.${m}.${d}`
}
