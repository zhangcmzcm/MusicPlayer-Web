import { describe, it, expect, vi } from 'vitest'
import { ApiError, getErrorMessage } from './errors.js'
import { reportError } from './logger.js'

describe('safe errors', () => {
  it.each([400, 401, 403, 404, 409, 429, 500, 503])(
    'should_map_status_%s_to_safe_feedback',
    (status) => {
      const error = new ApiError({
        status,
        code: 'UNTRUSTED',
        detail: 'SQL secret path',
      })
      expect(getErrorMessage(error)).toBeTruthy()
      expect(error.detail).not.toContain('SQL')
    },
  )
  it('should_distinguish_network_timeout_and_credentials', () => {
    expect(new ApiError({ code: 'NETWORK_ERROR' }).message).toContain('网络')
    expect(new ApiError({ code: 'TIMEOUT' }).message).toContain('超时')
    expect(new ApiError({ code: 'INVALID_CREDENTIALS' }).message).toContain(
      '登录信息',
    )
  })
  it('should_log_only_allowlisted_metadata', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    reportError({ code: 'secret-token', status: 500, detail: 'password' })
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|password/)
  })
})
