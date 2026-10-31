import { ApiError } from './errors.js'

export const SESSION_KEY = 'music-web.session'

export function isFutureInstant(value, now = Date.now()) {
  if (typeof value !== 'string') return false
  const date = /^(\d{4})-(\d{2})-(\d{2})T.*Z$/.exec(value)
  if (!date) return false
  const year = Number(date[1]),
    month = Number(date[2]),
    day = Number(date[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return false
  const instant = Date.parse(value)
  return Number.isFinite(instant) && instant > now
}

// 只识别紧凑 JWS 形态，不能证明签名有效或替代后端授权。
function isCompactJws(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) &&
    !/\s/.test(value)
  )
}

export function isValidSession(value, now = Date.now()) {
  const user = value?.user
  return Boolean(
    value &&
    isCompactJws(value.accessToken) &&
    value.tokenType === 'Bearer' &&
    isFutureInstant(value.expiresAt, now) &&
    user &&
    (typeof user.id === 'string' ||
      (typeof user.id === 'number' && Number.isSafeInteger(user.id))) &&
    String(user.id).length &&
    typeof user.username === 'string' &&
    user.username.length &&
    (user.email === null || typeof user.email === 'string') &&
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
