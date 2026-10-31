import { ApiError } from './errors.js'

export const SESSION_KEY = 'music-web.session'

export function isFutureInstant(value, now = Date.now()) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) > now
  )
}

export function isValidSession(value, now = Date.now()) {
  const user = value?.user
  return Boolean(
    value &&
    typeof value.accessToken === 'string' &&
    value.accessToken.length &&
    value.tokenType === 'Bearer' &&
    isFutureInstant(value.expiresAt, now) &&
    user &&
    (typeof user.id === 'string' ||
      (typeof user.id === 'number' && Number.isSafeInteger(user.id))) &&
    String(user.id).length &&
    typeof user.username === 'string' &&
    user.username.length &&
    typeof user.email === 'string' &&
    ['USER', 'ADMIN'].includes(user.role),
  )
}

export function clearSession(storage) {
  try {
    storage.removeItem(SESSION_KEY)
  } catch {
    throw new ApiError({ code: 'STORAGE_UNAVAILABLE' })
  }
}

export function readSession(storage, now = Date.now()) {
  let raw
  try {
    raw = storage.getItem(SESSION_KEY)
  } catch {
    throw new ApiError({ code: 'STORAGE_UNAVAILABLE' })
  }
  if (!raw) return null
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    clearSession(storage)
    return null
  }
  if (isValidSession(value, now)) return value
  clearSession(storage)
  return null
}

export function writeSession(storage, session) {
  if (!isValidSession(session)) throw new ApiError({ code: 'INVALID_RESPONSE' })
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    throw new ApiError({ code: 'STORAGE_UNAVAILABLE' })
  }
}
