import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePasswordReset } from './usePasswordReset.js'
import {
  requestPasswordReset,
  verifyPasswordReset,
  completePasswordReset,
} from '../api/passwordReset.js'
import { useAuthStore } from '../stores/auth.js'
import { useAuthFlowStore } from '../stores/authFlow.js'
import { ApiError } from '../utils/errors.js'
import { authentication, deferred } from '../test/factories.js'

vi.mock('../api/passwordReset.js', () => ({
  requestPasswordReset: vi.fn(),
  verifyPasswordReset: vi.fn(),
  completePasswordReset: vi.fn(),
}))
const scopes = []
const component = { validate: async () => true }
const identifier = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const expiry = () => new Date(Date.now() + 300000).toISOString()
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-11T00:00:00Z'))
  setActivePinia(createPinia())
  vi.mocked(requestPasswordReset).mockImplementation(async () => ({
    challengeId: identifier,
    expiresAt: expiry(),
  }))
  vi.mocked(verifyPasswordReset).mockImplementation(async () => ({
    resetTicket: identifier,
    expiresAt: expiry(),
  }))
  vi.mocked(completePasswordReset).mockResolvedValue(undefined)
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  const flow = scope.run(usePasswordReset)
  flow.form.email = ' A@Example.test '
  return { flow, scope, auth: useAuthStore(), shared: useAuthFlowStore() }
}
async function atCode() {
  const state = setup()
  await state.flow.sendCode(component)
  state.flow.form.code = '012345'
  return state
}
async function atPassword() {
  const state = await atCode()
  await state.flow.verifyCode(component)
  state.flow.form.newPassword = ' sample-password '
  state.flow.form.confirmPassword = ' sample-password '
  return state
}
async function isValid(flow, field, value) {
  return new Promise((resolve) =>
    flow.rules[field][0].validator(null, value, (error) => resolve(!error)),
  )
}

it('should_complete_three_requests_and_clear_old_session_and_secrets', async () => {
  const { flow, auth } = await atPassword()
  auth.session = authentication()
  expect(flow.phase.value).toBe('password')
  expect(flow.form.code).toBe('')
  expect(requestPasswordReset).toHaveBeenCalledWith(
    'a@example.test',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(verifyPasswordReset).toHaveBeenCalledWith(
    { challengeId: identifier, code: '012345' },
    expect.anything(),
  )
  expect(await flow.submit(component)).toEqual({ email: 'a@example.test' })
  expect(completePasswordReset).toHaveBeenCalledWith(
    { resetTicket: identifier, newPassword: ' sample-password ' },
    expect.anything(),
  )
  expect(auth.session).toBeNull()
  expect(flow.phase.value).toBe('completed')
  expect(flow.form.newPassword).toBe('')
  expect(await flow.submit(component)).toBeNull()
})

it.each([
  ['email', '', false],
  ['email', 'invalid', false],
  ['email', 'a@example.test', true],
  ['email', 'a'.repeat(120 - '@example.test'.length) + '@example.test', true],
  ['email', 'a'.repeat(121 - '@example.test'.length) + '@example.test', false],
  ['code', '012345', true],
  ['code', '１２３４５６', false],
  ['code', '12345', false],
  ['code', '1234567', false],
  ['newPassword', 'a'.repeat(7), false],
  ['newPassword', 'a'.repeat(8), true],
  ['newPassword', 'a'.repeat(72), true],
  ['newPassword', 'a'.repeat(73), false],
  ['newPassword', '        ', false],
  ['newPassword', 'password\t', false],
  ['newPassword', 'password中', false],
  ['confirmPassword', '', false],
  ['confirmPassword', 'different', false],
  ['confirmPassword', 'password', true],
])('should_validate_%s_%j_%s', async (field, value, valid) => {
  const { flow } = setup()
  flow.form.newPassword = 'password'
  expect(await isValid(flow, field, value)).toBe(valid)
})

it('should_keep_code_on_verification_failure_and_preserve_ticket_for_same_password', async () => {
  const { flow } = await atCode()
  vi.mocked(verifyPasswordReset).mockRejectedValueOnce(
    new ApiError({ code: 'PASSWORD_RESET_VERIFICATION_FAILED', status: 400 }),
  )
  await flow.verifyCode(component)
  expect(flow.form.code).toBe('012345')
  expect(flow.canVerify.value).toBe(true)
  await flow.verifyCode(component)
  flow.form.newPassword = 'password'
  vi.mocked(completePasswordReset).mockRejectedValueOnce(
    new ApiError({ code: 'NEW_PASSWORD_SAME_AS_OLD', status: 400 }),
  )
  await flow.submit(component)
  expect(flow.canComplete.value).toBe(true)
  expect(flow.form.newPassword).toBe('password')
  await flow.submit(component)
  expect(flow.phase.value).toBe('completed')
})

it('should_require_reverification_when_ticket_is_invalid', async () => {
  const { flow } = await atPassword()
  vi.mocked(completePasswordReset).mockRejectedValueOnce(
    new ApiError({ code: 'PASSWORD_RESET_VERIFICATION_FAILED', status: 400 }),
  )
  await flow.submit(component)
  expect(flow.canComplete.value).toBe(false)
  expect(flow.form.newPassword).toBe('')
  expect(flow.notice.value).toContain('重新验证邮箱')
  expect(await flow.submit(component)).toBeNull()
})

it.each(['request', 'verify', 'complete'])(
  'should_keep_%s_rate_limit_separate_and_share_scope_less_wait',
  async (operation) => {
    const { flow, shared } =
      operation === 'complete'
        ? await atPassword()
        : operation === 'verify'
          ? await atCode()
          : setup()
    const action = {
      request: requestPasswordReset,
      verify: verifyPasswordReset,
      complete: completePasswordReset,
    }[operation]
    const run = {
      request: flow.sendCode,
      verify: flow.verifyCode,
      complete: flow.submit,
    }[operation]
    vi.mocked(action).mockRejectedValueOnce(
      new ApiError({ code: 'UNKNOWN', status: 429, retryAfter: 90 }),
    )
    await run(component)
    expect(
      shared.passwordResetRemaining(operation, 'a@example.test', Date.now()),
    ).toBe(90)
    expect(
      shared.passwordResetRemaining(operation, 'b@example.test', Date.now()),
    ).toBe(90)
    expect(
      shared.passwordResetRemaining(
        operation === 'complete' ? 'verify' : 'complete',
        'a@example.test',
        Date.now(),
      ),
    ).toBe(0)
    const calls = action.mock.calls.length
    await run(component)
    expect(action).toHaveBeenCalledTimes(calls)
    await vi.advanceTimersByTimeAsync(90000)
    expect(
      shared.passwordResetRemaining(operation, 'a@example.test', Date.now()),
    ).toBe(0)
  },
)

it.each(['request', 'verify', 'complete'])(
  'should_handle_uncertain_%s_and_require_user_recovery',
  async (operation) => {
    const { flow } =
      operation === 'complete'
        ? await atPassword()
        : operation === 'verify'
          ? await atCode()
          : setup()
    const action = {
      request: requestPasswordReset,
      verify: verifyPasswordReset,
      complete: completePasswordReset,
    }[operation]
    vi.mocked(action).mockRejectedValueOnce(new ApiError({ code: 'TIMEOUT' }))
    await {
      request: flow.sendCode,
      verify: flow.verifyCode,
      complete: flow.submit,
    }[operation](component)
    expect(flow.notice.value).toContain('结果暂未确认')
    expect(flow.busy.value).toBe(false)
    if (operation === 'request') expect(flow.sendRemaining.value).toBe(60)
    if (operation === 'verify') expect(flow.canVerify.value).toBe(false)
    if (operation === 'complete') {
      expect(flow.canComplete.value).toBe(false)
      expect(flow.notice.value).toContain('登录核实')
    }
  },
)

it.each(['CANCELLED', 'VALIDATION_FAILED', 'UNKNOWN', 'CLIENT_ERROR'])(
  'should_report_%s_without_automatic_retry',
  async (code) => {
    const { flow } = setup()
    const failure =
      code === 'CLIENT_ERROR'
        ? new Error('internal')
        : new ApiError({ code, status: 400 })
    vi.mocked(requestPasswordReset).mockRejectedValueOnce(failure)
    await flow.sendCode(component)
    expect(flow.error.value?.code || 'CANCELLED').toBe(code)
    expect(requestPasswordReset).toHaveBeenCalledTimes(1)
  },
)

it('should_prevent_duplicate_requests_and_ignore_old_email_response', async () => {
  const { flow } = setup()
  const waiting = deferred()
  vi.mocked(requestPasswordReset).mockReturnValueOnce(waiting.promise)
  const request = flow.sendCode(component)
  await Promise.resolve()
  await flow.sendCode(component)
  expect(requestPasswordReset).toHaveBeenCalledTimes(1)
  flow.form.email = 'new@example.test'
  waiting.resolve({ challengeId: identifier, expiresAt: expiry() })
  await request
  expect(flow.phase.value).toBe('email')
  expect(flow.canVerify.value).toBe(false)
  expect(flow.maskedEmail.value).toBe('*****@example.test')
})

it('should_ignore_response_after_disposal_and_clear_email', async () => {
  const { flow, scope } = setup()
  const waiting = deferred()
  vi.mocked(requestPasswordReset).mockReturnValueOnce(waiting.promise)
  const request = flow.sendCode(component)
  await Promise.resolve()
  scope.stop()
  waiting.resolve({ challengeId: identifier, expiresAt: expiry() })
  await request
  expect(flow.form.email).toBe('')
  expect(flow.canVerify.value).toBe(false)
})

it('should_expire_challenge_and_ticket_and_block_further_submissions', async () => {
  const { flow } = await atCode()
  await vi.advanceTimersByTimeAsync(300000)
  expect(flow.canVerify.value).toBe(false)
  expect(flow.notice.value).toContain('已过期')
  await flow.verifyCode(component)
  expect(verifyPasswordReset).not.toHaveBeenCalled()
  await flow.sendCode(component)
  await flow.verifyCode(component)
  await vi.advanceTimersByTimeAsync(300000)
  expect(flow.canComplete.value).toBe(false)
  expect(flow.notice.value).toContain('凭据已过期')
})

it('should_accept_success_after_ticket_expiry_during_inflight_submission', async () => {
  const { flow, auth } = await atPassword()
  const waiting = deferred()
  vi.mocked(completePasswordReset).mockReturnValueOnce(waiting.promise)
  const request = flow.submit(component)
  await Promise.resolve()
  const fresh = authentication('ADMIN')
  auth.session = fresh
  const currentSession = auth.session
  await vi.advanceTimersByTimeAsync(301000)
  waiting.resolve()
  expect(await request).toEqual({ email: 'a@example.test' })
  expect(auth.session).toBe(currentSession)
})

it('should_block_invalid_form_and_support_explicit_restart', async () => {
  const { flow } = setup()
  await flow.sendCode({ validate: async () => false })
  expect(requestPasswordReset).not.toHaveBeenCalled()
  await flow.sendCode(component)
  expect(flow.sendRemaining.value).toBe(60)
  flow.restart()
  expect(flow.phase.value).toBe('email')
  expect(flow.form.email).toContain('Example')
  flow.form.email = 'longaddress@example.test'
  expect(flow.maskedEmail.value).toBe('lo*****ss@example.test')
})
