import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import App from '../../App.vue'
import AuthScene from '../../components/auth/AuthScene.vue'
import RegisterView from './RegisterView.vue'
import LoginView from '../login/LoginView.vue'
import { useAuthStore } from '../../stores/auth.js'
import { useAuthFlowStore } from '../../stores/authFlow.js'
import { ApiError } from '../../utils/errors.js'
import * as api from '../../api/auth.js'

vi.mock('../../api/auth.js', () => ({
  registerUser: vi.fn(),
  sendRegistrationCode: vi.fn(),
  login: vi.fn(),
  sendLoginCode: vi.fn(),
}))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})
async function setup(path = '/register') {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/forgot-password',
        name: 'forgot-password',
        component: { template: '<div />' },
      },
      {
        path: '/',
        component: AuthScene,
        children: [
          { path: 'register', name: 'register', component: RegisterView },
          { path: 'login', name: 'login', component: LoginView },
        ],
      },
      {
        path: '/destination',
        name: 'destination',
        component: { template: '<p>目标页面</p>' },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: { template: '<p>未找到</p>' },
      },
    ],
  })
  await router.push(path)
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia, router, ElementPlus] },
  })
  await flushPromises()
  return {
    wrapper,
    router,
    auth: useAuthStore(pinia),
    shared: useAuthFlowStore(pinia),
  }
}
async function fill(wrapper, email = '') {
  for (const [field, value] of Object.entries({
    username: 'listener',
    password: 'sample-password',
    confirmPassword: 'sample-password',
    email,
  }))
    await wrapper.get(`[name="${field}"]`).setValue(value)
  if (email) await wrapper.get('[name="code"]').setValue('012345')
}
it('should_register_return_prefill_and_preserve_safe_redirect_without_session', async () => {
  const { wrapper, router, auth, shared } = await setup(
    '/register?redirect=/destination',
  )
  const scene = wrapper.get('[data-testid="auth-scene"]').element
  await fill(wrapper)
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
  await flushPromises()
  expect(wrapper.get('[data-testid="auth-scene"]').element).toBe(scene)
  expect(router.currentRoute.value.query.redirect).toBe('/destination')
  expect(wrapper.get('[name="username"]').element.value).toBe('listener')
  expect(wrapper.get('[name="password"]').element.value).toBe('')
  expect(wrapper.text()).toContain('注册成功，请使用新账号登录。')
  expect(auth.session).toBeNull()
  expect(shared.takeRegistrationSuccess()).toBeNull()
  expect(document.activeElement.textContent).toBe('听见，风的声音')
})
it.each([
  'USERNAME_ALREADY_EXISTS',
  'EMAIL_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS',
  'EMAIL_CODE_INVALID',
  'EMAIL_CODE_ALREADY_USED',
  'EMAIL_CODE_ATTEMPTS_EXCEEDED',
])('should_show_safe_%s_and_retain_input', async (code) => {
  const { wrapper } = await setup('/register?redirect=/register')
  api.registerUser.mockRejectedValue(new ApiError({ code, status: 409 }))
  await fill(wrapper, 'a@example.test')
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() =>
    expect(wrapper.find('[data-testid="register-error"]').exists()).toBe(true),
  )
  expect(wrapper.get('[name="password"]').element.value).toBe('sample-password')
  expect(wrapper.get('a').attributes('href')).toBe('/login')
})
it('should_show_send_notice_with_registration_failure_and_recovery', async () => {
  const { wrapper } = await setup()
  api.sendRegistrationCode.mockResolvedValue({
    purpose: 'REGISTER',
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  })
  api.registerUser.mockRejectedValue(
    new ApiError({ code: 'INTERNAL_ERROR', status: 500 }),
  )
  await fill(wrapper, 'a@example.test')
  await wrapper.get('[data-testid="register-send-code"]').trigger('click')
  await vi.waitFor(() => expect(wrapper.text()).toContain('验证码已发送'))
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(wrapper.text()).toContain('注册结果暂未确认'))
  expect(wrapper.text()).toContain('服务暂时异常')
  expect(wrapper.text()).toContain('验证码已发送')
})
it('should_block_invalid_form_and_clear_handoff_when_leaving_scene', async () => {
  const { wrapper, router, shared } = await setup()
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(api.registerUser).not.toHaveBeenCalled()
  shared.completeRegistration('old')
  await router.push('/destination')
  expect(shared.takeRegistrationSuccess()).toBeNull()
})

it('should_clear_code_when_email_is_edited_through_the_real_form', async () => {
  const { wrapper } = await setup()
  await fill(wrapper, 'a@example.test')
  await wrapper.get('[name="email"]').setValue('b@example.test')
  expect(wrapper.get('[name="code"]').element.value).toBe('')
  await wrapper.get('[name="code"]').setValue('012345')
  await wrapper.get('[name="email"]').setValue('')
  expect(wrapper.find('[name="code"]').exists()).toBe(false)
  await wrapper.get('[name="email"]').setValue('c@example.test')
  expect(wrapper.get('[name="code"]').element.value).toBe('')
})

it('should_keep_success_handoff_and_offer_login_if_navigation_fails', async () => {
  const { wrapper, router, shared } = await setup()
  vi.spyOn(router, 'replace').mockRejectedValueOnce(
    new Error('navigation failed'),
  )
  await fill(wrapper)
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() =>
    expect(
      wrapper.find('[data-testid="registration-completed"]').exists(),
    ).toBe(true),
  )
  expect(shared.takeRegistrationSuccess()).toEqual({ username: 'listener' })
  expect(wrapper.get('[name="username"]').attributes('disabled')).toBeDefined()
  await wrapper.get('form').trigger('submit')
  expect(api.registerUser).toHaveBeenCalledTimes(1)
  expect(wrapper.get('a').attributes('href')).toBe('/login')
})
