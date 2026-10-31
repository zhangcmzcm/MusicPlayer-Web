import { http } from './http.js'
import { ApiError } from '../utils/errors.js'
import { isValidSession, isFutureInstant } from '../utils/session.js'
import { reportError } from '../utils/logger.js'

function invalidResponse() {
  const error = new ApiError({ code: 'INVALID_RESPONSE' })
  reportError(error)
  return error
}

export async function login(payload, { signal } = {}) {
  const { data } = await http.post('/auth/login', payload, {
    signal,
    publicRequest: true,
  })
  if (
    data?.status === 'AUTHENTICATED' &&
    isValidSession(data.authentication) &&
    data.roleSelection === null
  )
    return data
  if (
    data?.status === 'ROLE_SELECTION_REQUIRED' &&
    data.authentication === null &&
    typeof data.roleSelection?.loginTicket === 'string' &&
    data.roleSelection.loginTicket &&
    isFutureInstant(data.roleSelection.expiresAt)
  )
    return data
  throw invalidResponse()
}

export async function sendLoginCode(email, { signal } = {}) {
  const { data } = await http.post(
    '/email/send-code',
    { email, purpose: 'LOGIN' },
    { signal, publicRequest: true },
  )
  if (data?.purpose !== 'LOGIN' || !isFutureInstant(data.expiresAt))
    throw invalidResponse()
  return data
}
