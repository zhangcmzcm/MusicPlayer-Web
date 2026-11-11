import { http } from './http.js'
import { ApiError } from '../utils/errors.js'
import { isFutureInstant } from '../utils/session.js'
import { reportError } from '../utils/logger.js'

async function post(path, payload, status, field, signal) {
  const response = await http.post(path, payload, {
    signal,
    publicRequest: true,
  })
  const data = response.data
  if (
    response.status !== status ||
    (field &&
      (typeof data?.[field] !== 'string' ||
        !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(data[field]) ||
        !isFutureInstant(data.expiresAt)))
  ) {
    const error = new ApiError({ code: 'INVALID_RESPONSE' })
    reportError(error)
    throw error
  }
  if (field) return { [field]: data[field], expiresAt: data.expiresAt }
}

export function requestPasswordReset(email, { signal } = {}) {
  return post(
    '/users/password-reset-requests',
    { email },
    202,
    'challengeId',
    signal,
  )
}
export function verifyPasswordReset({ challengeId, code }, { signal } = {}) {
  return post(
    '/users/password-reset-verifications',
    { challengeId, code },
    200,
    'resetTicket',
    signal,
  )
}
export function completePasswordReset(
  { resetTicket, newPassword },
  { signal } = {},
) {
  return post(
    '/users/password-resets',
    { resetTicket, newPassword },
    204,
    null,
    signal,
  )
}
