import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../stores/auth.js'
import { useLogin } from './useLogin.js'
import * as api from '../api/auth.js'
import { authenticated, deferred, ticket } from '../test/factories.js'
import { ApiError } from '../utils/errors.js'

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
it.each(['IP_RATE_LIMIT', 'EMAIL_COOLDOWN', 'EMAIL_DAILY_LIMIT'])(
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
    expect(flow.sendRemaining.value).toBe(scope === 'IP_RATE_LIMIT' ? 120 : 0)
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
