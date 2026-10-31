import { beforeEach, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from './auth.js'
import * as api from '../api/auth.js'
import {
  authenticated,
  authentication,
  deferred,
  ticket,
} from '../test/factories.js'
import { SESSION_KEY } from '../utils/session.js'
import { ApiError } from '../utils/errors.js'

vi.mock('../api/auth.js', () => ({ login: vi.fn() }))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(api.login).mockReset()
})
it('should_persist_authenticated_session_and_restore_it', async () => {
  vi.mocked(api.login).mockResolvedValue(authenticated())
  const auth = useAuthStore()
  await auth.authenticate({ loginType: 'EMAIL_PASSWORD' })
  expect(auth.isAuthenticated).toBe(true)
  expect(JSON.parse(sessionStorage.getItem(SESSION_KEY))).toEqual(auth.session)
  auth.restoreSession()
  expect(auth.session.user.username).toBe('listener')
})
it.each(['USER', 'ADMIN'])(
  'should_keep_ticket_in_memory_then_select_%s',
  async (role) => {
    const selection = ticket()
    vi.mocked(api.login)
      .mockResolvedValueOnce({
        status: 'ROLE_SELECTION_REQUIRED',
        roleSelection: selection,
      })
      .mockResolvedValueOnce(authenticated(role))
    const auth = useAuthStore()
    await auth.authenticate({ loginType: 'EMAIL_CODE' })
    expect(auth.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    await auth.selectRole(role)
    expect(api.login).toHaveBeenLastCalledWith(
      {
        loginType: 'ROLE_SELECTION',
        loginTicket: selection.loginTicket,
        loginRole: role,
      },
      expect.any(Object),
    )
    expect(auth.session.user.role).toBe(role)
    expect(auth.roleSelection).toBeNull()
  },
)
it('should_ignore_late_authentication_after_session_clear', async () => {
  const response = deferred()
  vi.mocked(api.login).mockReturnValue(response.promise)
  const auth = useAuthStore()
  const request = auth.authenticate({})
  expect(auth.pending).toBe(true)
  await auth.authenticate({})
  expect(api.login).toHaveBeenCalledTimes(1)
  auth.clearSession()
  response.resolve(authenticated())
  await request
  expect(auth.session).toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})
it('should_not_use_expired_ticket_or_accept_unknown_role', async () => {
  const auth = useAuthStore()
  await expect(auth.selectRole('ADMIN')).rejects.toMatchObject({
    code: 'LOGIN_TICKET_INVALID',
  })
  auth.roleSelection = ticket()
  await expect(auth.selectRole('OWNER')).rejects.toMatchObject({
    code: 'INVALID_ROLE_SELECTION',
    status: 0,
  })
  expect(api.login).not.toHaveBeenCalled()
})
it('should_clear_invalid_ticket_and_surface_errors', async () => {
  const auth = useAuthStore()
  auth.roleSelection = ticket()
  vi.mocked(api.login).mockRejectedValue(
    new ApiError({ code: 'LOGIN_TICKET_INVALID', status: 401 }),
  )
  await expect(auth.selectRole('ADMIN')).rejects.toMatchObject({
    code: 'LOGIN_TICKET_INVALID',
  })
  expect(auth.roleSelection).toBeNull()
  expect(auth.pending).toBe(false)
  expect(auth.error.code).toBe('LOGIN_TICKET_INVALID')
})
it('should_restore_expired_storage_as_logged_out', () => {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ ...authentication(), expiresAt: '2000-01-01T00:00:00Z' }),
  )
  const auth = useAuthStore()
  auth.restoreSession()
  expect(auth.isAuthenticated).toBe(false)
})
it('should_not_claim_success_when_browser_storage_is_unavailable', async () => {
  vi.mocked(api.login).mockResolvedValue(authenticated())
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw Error('private path')
  })
  const auth = useAuthStore()
  auth.restoreSession()
  expect(auth.error.code).toBe('STORAGE_UNAVAILABLE')
  await expect(auth.authenticate({})).rejects.toMatchObject({
    code: 'STORAGE_UNAVAILABLE',
  })
  expect(auth.session).toBeNull()
  auth.clearSession()
  expect(auth.pending).toBe(false)
})
it('should_discard_authentication_after_external_abort', async () => {
  const response = deferred(),
    controller = new AbortController()
  vi.mocked(api.login).mockReturnValue(response.promise)
  const auth = useAuthStore(),
    request = auth.authenticate({}, { signal: controller.signal })
  controller.abort()
  response.resolve(authenticated())
  await request
  expect(auth.session).toBeNull()
})

it('should_classify_unexpected_api_exception_as_client_error_not_storage_failure', async () => {
  vi.mocked(api.login).mockRejectedValue(new TypeError('private detail'))
  const auth = useAuthStore()
  await expect(auth.authenticate({})).rejects.toMatchObject({
    code: 'CLIENT_ERROR',
    status: 0,
  })
  expect(auth.error.detail).not.toContain('private detail')
  expect(auth.session).toBeNull()
  expect(auth.pending).toBe(false)
})
