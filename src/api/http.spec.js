import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, configureAuth } from './http.js'
import { login, sendLoginCode } from './auth.js'
import {
  authenticated,
  authentication,
  deferred,
  ticket,
} from '../test/factories.js'

const success = (data, config) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
})
afterEach(() =>
  configureAuth({ getSession: () => null, onUnauthorized: () => {} }),
)
describe('HTTP contract', () => {
  it.each([
    { header: undefined, expected: null },
    { header: null, expected: null },
    { header: '', expected: null },
    { header: 'abc', expected: null },
    { header: '-1', expected: null },
    { header: '1.5', expected: null },
    { header: '0', expected: 0 },
    { header: '30', expected: 30 },
    { header: '9007199254740992', expected: null },
    { header: String(Number.MAX_SAFE_INTEGER), expected: null },
    { header: ['30'], expected: null },
  ])(
    'should_parse_retry_after_$header_as_$expected',
    async ({ header, expected }) => {
      const original = http.defaults.adapter
      http.defaults.adapter = async (config) => {
        throw {
          config,
          response: {
            status: 429,
            data: { code: 'LOGIN_RATE_LIMITED' },
            headers: { 'retry-after': header },
          },
        }
      }
      try {
        await expect(
          http.get('/limited', { publicRequest: true }),
        ).rejects.toMatchObject({
          code: 'LOGIN_RATE_LIMITED',
          retryAfter: expected,
        })
      } finally {
        http.defaults.adapter = original
      }
    },
  )
  it.each([undefined, 'UNKNOWN_SCOPE', 42])(
    'should_ignore_unrecognized_limit_scope_%s',
    async (scope) => {
      const original = http.defaults.adapter
      http.defaults.adapter = async (config) => {
        throw {
          config,
          response: {
            status: 429,
            data: { code: 'SEND_CODE_TOO_FREQUENTLY', scope },
            headers: {},
          },
        }
      }
      try {
        await expect(
          http.get('/limited', { publicRequest: true }),
        ).rejects.toMatchObject({ scope: null, retryAfter: null })
      } finally {
        http.defaults.adapter = original
      }
    },
  )
  it('should_send_exact_public_login_payload_without_bearer', async () => {
    configureAuth({
      getSession: () => authentication(),
      onUnauthorized: vi.fn(),
    })
    const original = http.defaults.adapter
    http.defaults.adapter = async (config) => {
      expect(config.headers.get('Authorization')).toBeUndefined()
      expect(JSON.parse(config.data)).toEqual({
        loginType: 'EMAIL_PASSWORD',
        account: 'a@example.test',
        password: 'sample-password',
      })
      expect(config.baseURL).toBe('/api/v1')
      expect(config.url).toBe('/auth/login')
      return success(authenticated(), config)
    }
    try {
      expect(
        (
          await login({
            loginType: 'EMAIL_PASSWORD',
            account: 'a@example.test',
            password: 'sample-password',
          })
        ).status,
      ).toBe('AUTHENTICATED')
    } finally {
      http.defaults.adapter = original
    }
  })
  it('should_send_login_purpose_and_validate_responses', async () => {
    const original = http.defaults.adapter
    http.defaults.adapter = async (config) => {
      expect(JSON.parse(config.data)).toEqual({
        email: 'a@example.test',
        purpose: 'LOGIN',
      })
      return success(
        { purpose: 'LOGIN', expiresAt: ticket().expiresAt },
        config,
      )
    }
    try {
      expect((await sendLoginCode('a@example.test')).purpose).toBe('LOGIN')
    } finally {
      http.defaults.adapter = original
    }
  })
  it.each([
    {},
    { status: 'AUTHENTICATED', authentication: {} },
    { status: 'ROLE_SELECTION_REQUIRED', roleSelection: {} },
  ])('should_reject_invalid_login_response', async (data) => {
    const original = http.defaults.adapter
    http.defaults.adapter = (config) => Promise.resolve(success(data, config))
    try {
      await expect(login({})).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    } finally {
      http.defaults.adapter = original
    }
  })
  it.each([false, true])(
    'should_only_notify_401_for_protected_requests_public_%s',
    async (publicRequest) => {
      const auth = authentication()
      const onUnauthorized = vi.fn()
      configureAuth({ getSession: () => auth, onUnauthorized })
      const original = http.defaults.adapter
      http.defaults.adapter = async (config) => {
        throw {
          config,
          response: {
            status: 401,
            data: { code: 'INVALID_CREDENTIALS', detail: 'private sql' },
            headers: {},
          },
        }
      }
      try {
        await expect(
          http.get('/protected', { publicRequest }),
        ).rejects.toMatchObject({ status: 401 })
        expect(onUnauthorized).toHaveBeenCalledTimes(publicRequest ? 0 : 1)
      } finally {
        http.defaults.adapter = original
      }
    },
  )
  it('should_not_expire_a_new_session_from_an_old_401', async () => {
    let current = authentication()
    const onUnauthorized = vi.fn()
    configureAuth({ getSession: () => current, onUnauthorized })
    const response = deferred(),
      original = http.defaults.adapter
    http.defaults.adapter = (config) => {
      response.config = config
      return response.promise
    }
    const request = http.get('/protected').catch((e) => e)
    await vi.waitFor(() => expect(response.config).toBeTruthy())
    current = { ...current, accessToken: 'new-test-token' }
    response.reject({
      config: response.config,
      response: { status: 401, data: {}, headers: {} },
    })
    await request
    expect(onUnauthorized).not.toHaveBeenCalled()
    http.defaults.adapter = original
  })
})
