import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../stores/auth.js'
import { useLogin } from './useLogin.js'
import * as api from '../api/auth.js'
import { authenticated, deferred, ticket } from '../test/factories.js'
import { ApiError } from '../utils/errors.js'
import ElementPlus from 'element-plus'
import LoginForm from '../components/auth/LoginForm.vue'

vi.mock('../api/auth.js', () => ({ login: vi.fn(), sendLoginCode: vi.fn() }))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(api.login).mockReset()
  vi.mocked(api.sendLoginCode).mockReset()
})
const valid = { validate: async () => true, validateEmail: async () => true }
function setup() {
  let flow
  const wrapper = mount(
    defineComponent({
      setup() {
        flow = useLogin(useAuthStore())
        return () => null
      },
    }),
  )
  return { flow, wrapper }
}
it.each(['EMAIL_PASSWORD', 'USERNAME_PASSWORD', 'EMAIL_CODE'])(
  'should_submit_exact_%s_fields',
  async (type) => {
    vi.mocked(api.login).mockResolvedValue(authenticated())
    const { flow } = setup()
    flow.changeMethod(type)
    Object.assign(flow.form, {
      email: ' Listener@Example.Test ',
      username: 'listener',
      password: ' spaced-password ',
      code: '012345',
    })
    await flow.submit(valid)
    const payload = api.login.mock.calls[0][0]
    expect(payload).toEqual(
      type === 'EMAIL_CODE'
        ? { loginType: type, email: 'listener@example.test', code: '012345' }
        : {
            loginType: type,
            account:
              type === 'EMAIL_PASSWORD' ? 'listener@example.test' : 'listener',
            password: ' spaced-password ',
          },
    )
    expect(flow.form.password).toBe('')
    expect(flow.form.code).toBe('')
    expect(flow.step.value).toBe('success')
  },
)
it('should_not_send_when_validation_fails_or_busy', async () => {
  const { flow } = setup()
  await flow.submit({ validate: async () => false })
  await flow.sendCode({ validateEmail: async () => false })
  expect(api.login).not.toHaveBeenCalled()
  expect(api.sendLoginCode).not.toHaveBeenCalled()
})
it('should_keep_email_cooldown_across_switches_and_clock_jumps', async () => {
  vi.useFakeTimers()
  vi.mocked(api.sendLoginCode).mockResolvedValue({
    expiresAt: ticket().expiresAt,
  })
  const { flow } = setup()
  flow.changeMethod('EMAIL_CODE')
  flow.form.email = 'a@example.test'
  await flow.sendCode(valid)
  expect(flow.sendRemaining.value).toBe(60)
  flow.changeMethod('EMAIL_PASSWORD')
  flow.changeMethod('EMAIL_CODE')
  expect(flow.form.email).toBe('a@example.test')
  await flow.sendCode(valid)
  expect(api.sendLoginCode).toHaveBeenCalledTimes(1)
  vi.setSystemTime(Date.now() + 61000)
  await vi.advanceTimersByTimeAsync(500)
  expect(flow.sendRemaining.value).toBe(0)
})
it.each(['IP_RATE_LIMIT', 'EMAIL_COOLDOWN', 'EMAIL_DAILY_LIMIT', null])(
  'should_respect_send_limit_%s',
  async (scope) => {
    vi.useFakeTimers()
    vi.mocked(api.sendLoginCode).mockRejectedValue(
      new ApiError({
        code: 'SEND_CODE_TOO_FREQUENTLY',
        status: 429,
        scope,
        retryAfter: 120,
      }),
    )
    const { flow } = setup()
    flow.changeMethod('EMAIL_CODE')
    flow.form.email = 'a@example.test'
    await flow.sendCode(valid)
    expect(flow.sendRemaining.value).toBe(120)
    flow.form.email = 'b@example.test'
    expect(flow.sendRemaining.value).toBe(
      ['EMAIL_COOLDOWN', 'EMAIL_DAILY_LIMIT'].includes(scope) ? 0 : 120,
    )
  },
)
it('should_ignore_send_result_after_unmount', async () => {
  const response = deferred()
  vi.mocked(api.sendLoginCode).mockReturnValue(response.promise)
  const { flow, wrapper } = setup()
  flow.changeMethod('EMAIL_CODE')
  flow.form.email = 'a@example.test'
  const request = flow.sendCode(valid)
  await flushPromises()
  wrapper.unmount()
  response.resolve({ expiresAt: ticket().expiresAt })
  await request
  expect(flow.codeNotice.value).toBe('')
})
it('should_expire_ticket_and_surface_authentication_limits', async () => {
  vi.useFakeTimers()
  const { flow } = setup(),
    auth = useAuthStore()
  auth.roleSelection = {
    ...ticket(),
    expiresAt: new Date(Date.now() + 1000).toISOString(),
  }
  await vi.advanceTimersByTimeAsync(1500)
  expect(flow.step.value).toBe('login')
  expect(flow.error.value.code).toBe('LOGIN_TICKET_INVALID')
  vi.mocked(api.login).mockRejectedValue(
    new ApiError({ code: 'LOGIN_RATE_LIMITED', status: 429, retryAfter: 30 }),
  )
  await flow.submit(valid)
  expect(flow.loginRemaining.value).toBe(30)
})

const uncertainFailures = [
  { code: 'NETWORK_ERROR', status: 0 },
  { code: 'TIMEOUT', status: 0 },
  { code: 'AUTH_STATE_STORE_UNAVAILABLE', status: 503 },
]
it.each(uncertainFailures)(
  'should_explain_uncertain_email_code_result_for_$code',
  async (failure) => {
    const original = new ApiError(failure)
    vi.mocked(api.login).mockRejectedValue(original)
    const { flow } = setup()
    flow.changeMethod('EMAIL_CODE')
    await flow.submit(valid)
    expect(flow.error.value).toBe(original)
    expect(flow.recoveryNotice.value).toContain('验证码可能已被使用')
    expect(flow.busy.value).toBe(false)
    expect(api.login).toHaveBeenCalledTimes(1)
    expect(api.sendLoginCode).not.toHaveBeenCalled()
  },
)
it.each(uncertainFailures)(
  'should_explain_uncertain_ticket_result_for_$code_without_consuming_it_locally',
  async (failure) => {
    const { flow } = setup(),
      auth = useAuthStore()
    auth.roleSelection = ticket()
    vi.mocked(api.login).mockRejectedValue(new ApiError(failure))
    await flow.selectRole('USER')
    expect(flow.recoveryNotice.value).toContain('登录票据也可能已失效')
    expect(auth.roleSelection).not.toBeNull()
    expect(api.login).toHaveBeenCalledTimes(1)
    flow.form.password = 'sensitive'
    flow.form.code = '012345'
    flow.restart()
    expect(auth.roleSelection).toBeNull()
    expect(flow.recoveryNotice.value).toBe('')
    expect(flow.form.password).toBe('')
    expect(flow.form.code).toBe('')
  },
)
it.each([
  ...uncertainFailures.map((failure) => ({
    ...failure,
    method: 'EMAIL_PASSWORD',
  })),
  ...[
    { code: 'INVALID_CREDENTIALS', status: 401 },
    { code: 'LOGIN_TICKET_INVALID', status: 401 },
    { code: 'ROLE_SELECTION_NOT_ALLOWED', status: 403 },
    { code: 'LOGIN_RATE_LIMITED', status: 429 },
    { code: 'STORAGE_UNAVAILABLE', status: 0 },
    { code: 'CLIENT_ERROR', status: 0 },
    { code: 'CANCELLED', status: 0 },
  ].map((failure) => ({ ...failure, method: 'EMAIL_CODE' })),
])(
  'should_not_misclassify_$method_$code_as_consumed_credentials',
  async ({ method, ...failure }) => {
    const { flow } = setup()
    flow.changeMethod(method)
    vi.mocked(api.login).mockRejectedValue(new ApiError(failure))
    await flow.submit(valid)
    expect(flow.recoveryNotice.value).toBe('')
  },
)
it('should_preserve_code_notice_and_cooldown_and_clear_recovery_on_new_operations', async () => {
  vi.useFakeTimers()
  const { flow } = setup()
  flow.changeMethod('EMAIL_CODE')
  flow.form.email = 'listener@example.test'
  vi.mocked(api.sendLoginCode).mockResolvedValue({
    expiresAt: ticket().expiresAt,
  })
  await flow.sendCode(valid)
  vi.mocked(api.login).mockRejectedValue(new ApiError({ code: 'TIMEOUT' }))
  await flow.submit(valid)
  expect(flow.recoveryNotice.value).not.toBe('')
  expect(flow.codeNotice.value).toContain('验证码已发送')
  await flow.sendCode(valid)
  expect(api.sendLoginCode).toHaveBeenCalledTimes(1)
  expect(flow.sendRemaining.value).toBe(60)
  const response = deferred()
  vi.mocked(api.login).mockReturnValue(response.promise)
  const pending = flow.submit(valid)
  await flushPromises()
  expect(flow.recoveryNotice.value).toBe('')
  response.resolve(authenticated())
  await pending
  expect(flow.recoveryNotice.value).toBe('')
})
it('should_clear_recovery_on_method_change_or_send_failure', async () => {
  const { flow } = setup()
  flow.changeMethod('EMAIL_CODE')
  vi.mocked(api.login).mockRejectedValue(new ApiError({ code: 'TIMEOUT' }))
  await flow.submit(valid)
  flow.changeMethod('EMAIL_PASSWORD')
  expect(flow.recoveryNotice.value).toBe('')
  flow.changeMethod('EMAIL_CODE')
  await flow.submit(valid)
  vi.mocked(api.sendLoginCode).mockRejectedValue(
    new ApiError({ code: 'NETWORK_ERROR' }),
  )
  await flow.sendCode(valid)
  expect(flow.recoveryNotice.value).toBe('')
})
it.each(['restart', 'unmount'])(
  'should_ignore_late_failure_after_%s',
  async (action) => {
    const { flow, wrapper } = setup()
    flow.changeMethod('EMAIL_CODE')
    const response = deferred()
    vi.mocked(api.login).mockReturnValue(response.promise)
    const pending = flow.submit(valid)
    await flushPromises()
    if (action === 'restart') flow.restart()
    else wrapper.unmount()
    response.reject(new ApiError({ code: 'TIMEOUT' }))
    await pending
    expect(flow.recoveryNotice.value).toBe('')
    expect(flow.error.value).toBeNull()
  },
)

const boundaryCases = [
  ...[119, 120, 121].map((length) => ({
    field: 'email',
    value: 'a'.repeat(63) + '@' + 'b'.repeat(length - 69) + '.test',
    accepted: length <= 120,
    method: 'EMAIL_PASSWORD',
    name: `email_${length}`,
  })),
  ...[2, 3, 80, 81].map((length) => ({
    field: 'username',
    value: 'u'.repeat(length),
    accepted: length >= 3 && length <= 80,
    method: 'USERNAME_PASSWORD',
    name: `username_${length}`,
  })),
  ...[7, 8, 128, 129].map((length) => ({
    field: 'password',
    value: 'p'.repeat(length),
    accepted: length >= 8 && length <= 128,
    method: 'EMAIL_PASSWORD',
    name: `password_${length}`,
  })),
  ...['01234', '012345', '0123456', '12345x', '１２３４５６'].map((value) => ({
    field: 'code',
    value,
    accepted: value === '012345',
    method: 'EMAIL_CODE',
    name: `code_${value}`,
  })),
]

it.each(boundaryCases)(
  'should_apply_contract_boundary_$name',
  async ({ field, value, method, accepted }) => {
    const { flow } = setup()
    flow.changeMethod(method)
    Object.assign(flow.form, {
      email: 'listener@example.test',
      username: 'listener',
      password: 'sample-password',
      code: '012345',
    })
    flow.form[field] = value
    const form = mount(LoginForm, {
      props: { modelValue: flow.form, loginType: method, rules: flow.rules },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(await form.vm.$.exposed.validate()).toBe(accepted)
    if (!accepted)
      await vi.waitFor(() =>
        expect(form.find('.el-form-item__error').exists()).toBe(true),
      )
  },
)

it.each([null, 0])(
  'should_handle_login_limit_without_inventing_delay_%s',
  async (retryAfter) => {
    vi.useFakeTimers()
    const { flow } = setup()
    vi.mocked(api.login).mockRejectedValue(
      new ApiError({ code: 'LOGIN_RATE_LIMITED', status: 429, retryAfter }),
    )
    await flow.submit(valid)
    expect(flow.error.value.code).toBe('LOGIN_RATE_LIMITED')
    expect(flow.loginRemaining.value).toBe(0)
    expect(flow.busy.value).toBe(false)
  },
)
