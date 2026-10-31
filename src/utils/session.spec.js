import { it, expect, vi } from 'vitest'
import {
  readSession,
  writeSession,
  clearSession,
  isValidSession,
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
