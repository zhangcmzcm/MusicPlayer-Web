import { it, expect, vi } from 'vitest'
import {
  readSession,
  writeSession,
  clearSession,
  isValidSession,
  isFutureInstant,
  SESSION_KEY,
} from './session.js'
import { authentication } from '../test/factories.js'

it('should_restore_valid_session_and_preserve_user_id', () => {
  const value = authentication()
  writeSession(sessionStorage, value)
  expect(readSession(sessionStorage)).toEqual(value)
  expect(
    isValidSession({
      ...value,
      user: { ...value.user, id: '9007199254740993' },
    }),
  ).toBe(true)
  clearSession(sessionStorage)
  expect(readSession(sessionStorage)).toBeNull()
})
it.each(['USER', 'ADMIN'])(
  'should_persist_and_restore_%s_session_without_bound_email',
  (role) => {
    const value = authentication(role)
    value.user.email = null
    expect(isValidSession(value)).toBe(true)
    writeSession(sessionStorage, value)
    expect(readSession(sessionStorage)).toEqual(value)
    expect(readSession(sessionStorage).user.email).toBeNull()
  },
)
it.each([
  { name: 'missing', email: undefined },
  { name: 'number', email: 42 },
  { name: 'boolean', email: false },
  { name: 'object', email: {} },
  { name: 'array', email: [] },
])('should_reject_$name_email_in_session', ({ email }) => {
  const value = authentication()
  value.user.email = email
  expect(isValidSession(value)).toBe(false)
})
it.each(['bad json', '{}', 'null'])(
  'should_discard_corrupt_storage_%s',
  (raw) => {
    sessionStorage.setItem(SESSION_KEY, raw)
    expect(readSession(sessionStorage)).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  },
)
it('should_discard_expired_or_invalid_authentication', () => {
  expect(
    isValidSession({
      ...authentication(),
      expiresAt: new Date(0).toISOString(),
    }),
  ).toBe(false)
  expect(isValidSession({ ...authentication(), tokenType: 'Basic' })).toBe(
    false,
  )
  expect(isValidSession({ ...authentication(), user: null })).toBe(false)
  expect(isValidSession({ ...authentication(), user: { role: 'OWNER' } })).toBe(
    false,
  )
})
it('should_surface_storage_failures_safely', () => {
  const storage = {
    getItem: vi.fn(() => {
      throw Error('private path')
    }),
    setItem: vi.fn(() => {
      throw Error('private path')
    }),
    removeItem: vi.fn(),
  }
  expect(() => readSession(storage)).toThrow('浏览器')
  expect(() => writeSession(storage, authentication())).toThrow('浏览器')
  expect(() => writeSession(sessionStorage, {})).toThrow()
})

it.each(
  [
    undefined,
    null,
    '',
    ' ',
    'plain-token',
    'a.b',
    'a.b.c.d',
    '.b.c',
    'a..c',
    'a.b.',
    'a.b.c\n',
    'a.b.c=',
    'a.b.中文',
    42,
    false,
    {},
    [],
  ].map((token) => ({ token })),
)('should_discard_session_with_malformed_token_$token', ({ token }) => {
  const value = authentication()
  value.accessToken = token
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
  expect(readSession(sessionStorage)).toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

it.each([
  { field: 'id', value: undefined },
  { field: 'id', value: null },
  { field: 'id', value: '' },
  { field: 'id', value: 1.5 },
  { field: 'id', value: Number.MAX_SAFE_INTEGER + 1 },
  { field: 'id', value: {} },
  { field: 'username', value: undefined },
  { field: 'username', value: null },
  { field: 'username', value: '' },
  { field: 'username', value: 42 },
  { field: 'role', value: 'OWNER' },
  { field: 'role', value: null },
])('should_discard_session_with_invalid_$field_$value', ({ field, value }) => {
  const session = authentication()
  session.user[field] = value
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  expect(readSession(sessionStorage)).toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

it.each([
  { instant: undefined, accepted: false },
  { instant: null, accepted: false },
  { instant: 42, accepted: false },
  { instant: '', accepted: false },
  { instant: 'invalid', accepted: false },
  { instant: '2096-02-29T00:00:00Z', accepted: true },
  { instant: '2099-02-29T00:00:00Z', accepted: false },
  { instant: '2100-02-29T00:00:00Z', accepted: false },
  { instant: '2400-02-29T00:00:00Z', accepted: true },
  { instant: '2099-04-31T00:00:00Z', accepted: false },
  { instant: '2099-13-01T00:00:00Z', accepted: false },
  { instant: '2099-01-00T00:00:00Z', accepted: false },
  { instant: '2099-01-01T00:00:00.123456789Z', accepted: true },
])('should_validate_instant_$instant', ({ instant, accepted }) => {
  expect(isFutureInstant(instant, Date.UTC(2028, 0, 1))).toBe(accepted)
})

it('should_reject_expiry_at_or_before_now_and_accept_next_millisecond', () => {
  const now = Date.UTC(2028, 0, 1)
  for (const delta of [-1, 0, 1]) {
    expect(isFutureInstant(new Date(now + delta).toISOString(), now)).toBe(
      delta > 0,
    )
  }
})
