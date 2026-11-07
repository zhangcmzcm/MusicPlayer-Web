export function resolveSafeRedirect(router, candidate) {
  if (
    typeof candidate !== 'string' ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//')
  )
    return null
  let decoded
  try {
    decoded = decodeURIComponent(candidate)
  } catch {
    return null
  }
  if (
    decoded.includes('\\') ||
    Array.from(decoded).some((character) => character.charCodeAt(0) <= 32) ||
    decoded.startsWith('//') ||
    decoded.includes('://')
  )
    return null
  const target = router.resolve(candidate)
  if (
    !target.matched.length ||
    ['login', 'register', 'not-found'].includes(target.name) ||
    target.redirectedFrom ||
    target.matched.some((record) => record.redirect)
  )
    return null
  return target.fullPath
}
