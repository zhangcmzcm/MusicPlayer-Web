import { describe, it, expect, vi } from 'vitest'
import { ApiError, getErrorMessage } from './errors.js'
import { reportError } from './logger.js'

describe('safe errors', () => {
  it.each([
    ['IMPORT_CONFLICT', '冲突'],
    ['IMPORT_IN_PROGRESS', '仍在处理'],
    ['UPLOAD_TOO_LARGE', '大小'],
    ['UNSUPPORTED_AUDIO_FORMAT', 'MP3'],
    ['AUDIO_METADATA_INVALID', '损坏'],
    ['TRACK_IMPORT_RATE_LIMITED', '频繁'],
    ['MEDIA_IMPORT_STORE_UNAVAILABLE', '重试核对'],
    ['MEDIA_OBJECT_CLEANUP_FAILED', '重试核对'],
  ])('should_explain_import_error_%s', (code, message) => {
    expect(getErrorMessage(new ApiError({ code }))).toContain(message)
  })
  it('should_explain_invalid_management_query', () => {
    expect(
      getErrorMessage(new ApiError({ code: 'INVALID_MANAGEMENT_QUERY' })),
    ).toBe('歌曲管理查询条件无效，请恢复默认条件。')
  })
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
