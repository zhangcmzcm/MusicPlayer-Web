import { afterEach, expect, it } from 'vitest'
import { http, configureAuth } from './http.js'
import { authentication } from '../test/factories.js'
import {
  requestPasswordReset,
  verifyPasswordReset,
  completePasswordReset,
} from './passwordReset.js'

const original = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = original
  configureAuth({ getSession: () => null, onUnauthorized: () => {} })
})
const identifier = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

it.each([
  [
    requestPasswordReset,
    '/users/password-reset-requests',
    'a@example.test',
    { email: 'a@example.test' },
    202,
    'challengeId',
  ],
  [
    verifyPasswordReset,
    '/users/password-reset-verifications',
    { challengeId: identifier, code: '012345' },
    { challengeId: identifier, code: '012345' },
    200,
    'resetTicket',
  ],
  [
    completePasswordReset,
    '/users/password-resets',
    { resetTicket: identifier, newPassword: ' password ' },
    { resetTicket: identifier, newPassword: ' password ' },
    204,
    null,
  ],
])(
  'should_send_public_payload_to_%s_%s',
  async (action, url, input, payload, status, field) => {
    const signal = new AbortController().signal
    configureAuth({
      getSession: () => authentication(),
      onUnauthorized: () => {},
    })
    const data = field
      ? {
          [field]: identifier,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          extension: true,
        }
      : null
    http.defaults.adapter = async (config) => {
      expect(config.url).toBe(url)
      expect(config.method).toBe('post')
      expect(JSON.parse(config.data)).toEqual(payload)
      expect(config.publicRequest).toBe(true)
      expect(config.headers.has('Authorization')).toBe(false)
      expect(config.signal).toBe(signal)
      return { data, status, headers: {}, config }
    }
    expect(await action(input, { signal })).toEqual(
      field ? { [field]: identifier, expiresAt: data.expiresAt } : undefined,
    )
  },
)

it.each([
  undefined,
  null,
  {},
  { challengeId: null },
  { challengeId: 'A'.repeat(42) },
  { challengeId: 'A'.repeat(42) + 'B' },
  { challengeId: identifier, expiresAt: null },
  { challengeId: identifier, expiresAt: '2020-01-01T00:00:00Z' },
])('should_reject_invalid_challenge_%j', async (data) => {
  http.defaults.adapter = async (config) => ({
    data,
    status: 202,
    headers: {},
    config,
  })
  await expect(requestPasswordReset('a@example.test')).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  })
})

it.each([
  [verifyPasswordReset, null, 200],
  [
    verifyPasswordReset,
    { resetTicket: 3, expiresAt: '2099-01-01T00:00:00Z' },
    200,
  ],
  [
    requestPasswordReset,
    { challengeId: identifier, expiresAt: '2099-01-01T00:00:00Z' },
    200,
  ],
  [completePasswordReset, {}, 200],
])(
  'should_reject_unexpected_response_%s_%j_%i',
  async (action, data, status) => {
    http.defaults.adapter = async (config) => ({
      data,
      status,
      headers: {},
      config,
    })
    await expect(action({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  },
)
