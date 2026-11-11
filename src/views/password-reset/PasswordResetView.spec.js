import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import App from '../../App.vue'
import { createAppRouter } from '../../router/index.js'
import { useAuthStore } from '../../stores/auth.js'
import { useAuthFlowStore } from '../../stores/authFlow.js'
import {
  requestPasswordReset,
  verifyPasswordReset,
  completePasswordReset,
} from '../../api/passwordReset.js'
import { ApiError } from '../../utils/errors.js'

vi.mock('../../api/passwordReset.js', () => ({
  requestPasswordReset: vi.fn(),
  verifyPasswordReset: vi.fn(),
  completePasswordReset: vi.fn(),
}))
const identifier = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
beforeEach(() => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.mocked(requestPasswordReset).mockResolvedValue({
    challengeId: identifier,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  })
  vi.mocked(verifyPasswordReset).mockResolvedValue({
    resetTicket: identifier,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  })
  vi.mocked(completePasswordReset).mockResolvedValue(undefined)
})
async function setup() {
  const pinia = createPinia()
  const router = createAppRouter(useAuthStore(pinia))
  await router.push('/forgot-password')
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia, router, ElementPlus] },
  })
  await flushPromises()
  return { wrapper, router, shared: useAuthFlowStore(pinia) }
}
async function proceed(wrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
async function passwordStage(state) {
  await state.wrapper.get('[name="email"]').setValue(' A@Example.test ')
  await proceed(state.wrapper)
  await state.wrapper.get('[name="code"]').setValue('012345')
  await proceed(state.wrapper)
  await state.wrapper.get('[name="newPassword"]').setValue(' sample-password ')
  await state.wrapper
    .get('[name="confirmPassword"]')
    .setValue(' sample-password ')
}

it('should_finish_public_flow_and_prefill_email_login_once', async () => {
  const state = await setup()
  expect(state.wrapper.get('h1').text()).toBe('找回密码')
  await passwordStage(state)
  expect(state.wrapper.get('h1').text()).toBe('设置新密码')
  expect(document.activeElement).toBe(state.wrapper.get('h1').element)
  await proceed(state.wrapper)
  await vi.waitFor(() =>
    expect(state.router.currentRoute.value.name).toBe('login'),
  )
  expect(state.router.currentRoute.value.name).toBe('login')
  expect(state.wrapper.get('[name="email"]').element.value).toBe(
    'a@example.test',
  )
  expect(state.wrapper.get('[name="password"]').element.value).toBe('')
  expect(
    state.wrapper.get('[data-testid="password-reset-success"]').text(),
  ).toContain('密码已重置')
  expect(state.shared.takePasswordResetSuccess()).toBeNull()
  expect(sessionStorage.length).toBe(0)
})

it('should_show_validation_errors_and_support_code_restart', async () => {
  const { wrapper } = await setup()
  await proceed(wrapper)
  await vi.waitFor(() => expect(wrapper.text()).toContain('请输入有效邮箱'))
  await wrapper.get('[name="email"]').setValue('short@example.test')
  await proceed(wrapper)
  expect(wrapper.text()).toContain('sh*****rt@example.test')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '修改邮箱')
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('[name="email"]').element.value).toBe('short@example.test')
  expect(wrapper.find('[name="code"]').exists()).toBe(false)
})

it.each([
  ['NEW_PASSWORD_SAME_AS_OLD', 400, '新密码不能与原密码相同'],
  ['PASSWORD_RESET_VERIFICATION_FAILED', 400, '重新验证邮箱'],
  ['PASSWORD_RESET_CONFIRMATION_UNAVAILABLE', 503, '登录核实'],
  ['PASSWORD_RESET_CONFIRMATION_RATE_LIMITED', 429, '过于频繁'],
])('should_show_safe_completion_%s', async (code, status, message) => {
  const state = await setup()
  await passwordStage(state)
  vi.mocked(completePasswordReset).mockRejectedValueOnce(
    new ApiError({ code, status, retryAfter: status === 429 ? 30 : null }),
  )
  await proceed(state.wrapper)
  expect(state.wrapper.text()).toContain(message)
  expect(state.router.currentRoute.value.name).toBe('forgot-password')
})

it.each(['reject', 'throw'])(
  'should_keep_success_handoff_when_login_navigation_%s',
  async (mode) => {
    const state = await setup()
    await passwordStage(state)
    if (mode === 'reject')
      state.router.beforeResolve((to) =>
        to.name === 'login' ? false : undefined,
      )
    else
      vi.spyOn(state.router, 'replace').mockRejectedValueOnce(
        new Error('navigation failed'),
      )
    await proceed(state.wrapper)
    expect(state.wrapper.text()).toContain('密码已重置，请点击返回登录继续')
    expect(
      state.wrapper
        .findAll('a')
        .some((link) => link.attributes('href') === '/login'),
    ).toBe(true)
    expect(state.shared.takePasswordResetSuccess()).toEqual({
      email: 'a@example.test',
    })
  },
)

it('should_revalidate_confirmation_and_allow_accessible_password_visibility', async () => {
  const state = await setup()
  await passwordStage(state)
  await state.wrapper.get('[name="newPassword"]').setValue('changed-password')
  await proceed(state.wrapper)
  await vi.waitFor(() =>
    expect(state.wrapper.text()).toContain('两次输入的密码必须一致'),
  )
  const toggle = state.wrapper
    .findAll('button')
    .find((button) => button.attributes('aria-label') === '显示新密码')
  await toggle.trigger('click')
  expect(state.wrapper.get('[name="newPassword"]').attributes('type')).toBe(
    'text',
  )
  await state.wrapper
    .get('[name="confirmPassword"]')
    .setValue('changed-password')
  await flushPromises()
})
