import axios from 'axios'
import { ApiError, errorMessages } from '../utils/errors.js'
import { reportError } from '../utils/logger.js'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15000,
})
let auth = { getSession: () => null, onUnauthorized: () => {} }
export function configureAuth(callbacks) {
  auth = callbacks
}

http.interceptors.request.use((config) => {
  if (!config.publicRequest) {
    const session = auth.getSession()
    if (session) {
      config.headers.set('Authorization', `Bearer ${session.accessToken}`)
      config.sessionToken = session.accessToken
    }
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error))
      return Promise.reject(new ApiError({ code: 'CANCELLED' }))
    const status = error.response?.status || 0
    const data = error.response?.data
    const seconds = error.response?.headers?.['retry-after']
    const numericSeconds = Number(seconds)
    const retryAfter =
      (typeof seconds === 'string' || typeof seconds === 'number') &&
      /^\d+$/.test(String(seconds)) &&
      Number.isSafeInteger(numericSeconds) &&
      Number.isSafeInteger(Date.now() + numericSeconds * 1000)
        ? numericSeconds
        : null
    const code =
      typeof data?.code === 'string'
        ? data.code
        : error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
          ? 'TIMEOUT'
          : status
            ? 'UNKNOWN'
            : 'NETWORK_ERROR'
    const converted = new ApiError({
      code,
      status,
      retryAfter,
      scope: ['EMAIL_COOLDOWN', 'EMAIL_DAILY_LIMIT', 'IP_RATE_LIMIT'].includes(
        data?.scope,
      )
        ? data.scope
        : null,
    })
    if (!Object.hasOwn(errorMessages, code) || status >= 500)
      reportError(converted)
    const config = error.config
    if (
      status === 401 &&
      !config?.publicRequest &&
      config?.sessionToken &&
      config.sessionToken === auth.getSession()?.accessToken
    )
      auth.onUnauthorized()
    return Promise.reject(converted)
  },
)
