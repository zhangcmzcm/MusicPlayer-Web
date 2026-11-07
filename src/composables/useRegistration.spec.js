import { effectScope, nextTick } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRegistration } from './useRegistration.js'
import * as api from '../api/auth.js'
import { ApiError } from '../utils/errors.js'
import { deferred } from '../test/factories.js'

vi.mock('../api/auth.js', () => ({
  registerUser: vi.fn(),
  sendRegistrationCode: vi.fn(),
}))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})
function setup() {
  const scope = effectScope()
  const flow = scope.run(() => useRegistration())
  Object.assign(flow.form, {
    username: 'listener',
    password: ' sample-password ',
    confirmPassword: ' sample-password ',
  })
  return { flow, scope }
}
const validForm = {
  validate: async () => true,
  validateEmail: async () => true,
}
it.each(['', 'a@example.test'])(
  'should_submit_optional_email_%s',
  async (email) => {
    const { flow, scope } = setup()
    flow.form.email = email
    await nextTick()
    flow.form.code = '012345'
    expect(await flow.submit(validForm)).toEqual({ username: 'listener' })
    expect(api.registerUser).toHaveBeenCalledWith(
      {
        username: 'listener',
        password: ' sample-password ',
        ...(email ? { email, code: '012345' } : {}),
      },
      expect.any(Object),
    )
    expect(flow.form.password).toBe('')
    expect(flow.form.confirmPassword).toBe('')
    scope.stop()
  },
)
it.each([
  ['username', 'ab', false],
  ['username', 'abc', true],
  ['username', 'a'.repeat(20), true],
  ['username', 'a'.repeat(21), false],
  ['username', 'a-b', false],
  ['password', 'a'.repeat(7), false],
  ['password', 'a'.repeat(8), true],
  ['password', 'a'.repeat(72), true],
  ['password', 'a'.repeat(73), false],
  ['password', ' '.repeat(8), false],
  ['password', '中文password', false],
  ['password', 'password\t', false],
  ['password', ' password ', true],
  ['email', '', true],
  ['email', '   ', false],
  ['email', 'invalid', false],
  ['email', 'a@example.test', true],
  ['email', `${'a'.repeat(107)}@example.test`, true],
  ['email', `${'a'.repeat(108)}@example.test`, false],
])('should_validate_%s_%s', (field, value, valid) => {
  const { flow, scope } = setup()
  const done = vi.fn()
  flow.rules[field][0].validator(null, value, done)
  expect(done.mock.calls[0][0] instanceof Error).toBe(!valid)
  scope.stop()
})
it('should_require_matching_confirmation_and_conditional_code', () => {
  const { flow, scope } = setup()
  const done = vi.fn()
  flow.rules.confirmPassword[0].validator(null, 'wrong', done)
  expect(done.mock.calls[0][0]).toBeInstanceOf(Error)
  flow.rules.confirmPassword[0].validator(null, flow.form.password, done)
  expect(done.mock.calls[1][0]).toBeUndefined()
  flow.rules.code[0].validator(null, '', done)
  expect(done.mock.calls[2][0]).toBeUndefined()
  flow.form.email = 'a@example.test'
  flow.rules.code[0].validator(null, '123', done)
  expect(done.mock.calls[3][0]).toBeInstanceOf(Error)
  flow.rules.code[0].validator(null, '012345', done)
  expect(done.mock.calls[4][0]).toBeUndefined()
  scope.stop()
})
it.each([500, 503, 502])(
  'should_preserve_original_error_and_show_unknown_registration_for_%i',
  async (status) => {
    const { flow, scope } = setup()
    const failure = new ApiError({ code: 'INTERNAL_ERROR', status })
    api.registerUser.mockRejectedValue(failure)
    expect(await flow.submit(validForm)).toBeNull()
    expect(flow.error.value).toBe(failure)
    expect(flow.recoveryNotice.value).toContain('注册结果暂未确认')
    expect(flow.form.password).toBe(' sample-password ')
    scope.stop()
  },
)
it('should_ignore_stale_send_response_after_email_changes', async () => {
  const { flow, scope } = setup()
  flow.form.email = 'a@example.test'
  await nextTick()
  const pending = deferred()
  api.sendRegistrationCode.mockReturnValue(pending.promise)
  const action = flow.sendCode(validForm)
  await vi.waitFor(() =>
    expect(api.sendRegistrationCode).toHaveBeenCalledTimes(1),
  )
  flow.form.code = '012345'
  flow.form.email = 'b@example.test'
  await nextTick()
  pending.resolve({ expiresAt: new Date(Date.now() + 300000).toISOString() })
  await action
  expect(flow.codeNotice.value).toBe('')
  expect(flow.form.code).toBe('')
  expect(flow.busy.value).toBe(false)
  scope.stop()
})
it('should_cool_down_send_and_clear_notice_at_server_expiry', async () => {
  vi.useFakeTimers()
  const { flow, scope } = setup()
  flow.form.email = 'a@example.test'
  await nextTick()
  api.sendRegistrationCode.mockResolvedValue({
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  })
  await flow.sendCode(validForm)
  expect(flow.sendRemaining.value).toBe(60)
  await flow.sendCode(validForm)
  expect(api.sendRegistrationCode).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(300000)
  expect(flow.sendRemaining.value).toBe(0)
  expect(flow.codeNotice.value).toBe('')
  scope.stop()
})
it('should_cancel_registration_on_dispose_without_success_or_error', async () => {
  const { flow, scope } = setup()
  const pending = deferred()
  api.registerUser.mockReturnValue(pending.promise)
  const action = flow.submit(validForm)
  await vi.waitFor(() => expect(api.registerUser).toHaveBeenCalledTimes(1))
  await flow.submit(validForm)
  expect(api.registerUser).toHaveBeenCalledTimes(1)
  scope.stop()
  pending.resolve()
  expect(await action).toBeNull()
  expect(flow.error.value).toBeNull()
  expect(flow.form.password).toBe('')
})

it.each(['NETWORK_ERROR', 'TIMEOUT', 'CANCELLED'])(
  'should_handle_registration_%s_without_retry',
  async (code) => {
    const { flow, scope } = setup()
    api.registerUser.mockRejectedValue(new ApiError({ code }))
    await flow.submit(validForm)
    expect(api.registerUser).toHaveBeenCalledTimes(1)
    expect(flow.recoveryNotice.value.includes('注册结果暂未确认')).toBe(
      code !== 'CANCELLED',
    )
    expect(flow.error.value?.code || null).toBe(
      code === 'CANCELLED' ? null : code,
    )
    scope.stop()
  },
)

it('should_not_call_api_for_invalid_forms_and_convert_unexpected_client_failure', async () => {
  const { flow, scope } = setup()
  const invalid = {
    validate: async () => false,
    validateEmail: async () => false,
  }
  await flow.submit(invalid)
  await flow.sendCode(invalid)
  expect(api.registerUser).not.toHaveBeenCalled()
  expect(api.sendRegistrationCode).not.toHaveBeenCalled()
  api.registerUser.mockRejectedValue(new Error('private failure'))
  await flow.submit(validForm)
  expect(flow.error.value.code).toBe('CLIENT_ERROR')
  expect(flow.error.value.message).not.toContain('private failure')
  scope.stop()
})

it('should_distinguish_send_failure_and_keep_ip_limit_and_submit_limit', async () => {
  vi.useFakeTimers()
  const { flow, scope } = setup()
  flow.form.email = 'a@example.test'
  api.sendRegistrationCode.mockRejectedValue(
    new ApiError({ code: 'INTERNAL_ERROR', status: 500 }),
  )
  await flow.sendCode(validForm)
  expect(flow.recoveryNotice.value).toContain('发送结果暂未确认')
  expect(flow.recoveryNotice.value).not.toContain('注册结果')
  api.sendRegistrationCode.mockRejectedValue(
    new ApiError({
      code: 'SEND_CODE_TOO_FREQUENTLY',
      status: 429,
      scope: 'IP_RATE_LIMIT',
      retryAfter: 60,
    }),
  )
  await flow.sendCode(validForm)
  flow.form.email = 'b@example.test'
  expect(flow.sendRemaining.value).toBe(60)
  api.registerUser.mockRejectedValue(
    new ApiError({
      code: 'EMAIL_CODE_ATTEMPTS_EXCEEDED',
      status: 429,
      retryAfter: 10,
    }),
  )
  await flow.submit(validForm)
  expect(flow.submitRemaining.value).toBe(10)
  await flow.submit(validForm)
  expect(api.registerUser).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(10000)
  expect(flow.submitRemaining.value).toBe(0)
  scope.stop()
})
