import { beforeEach, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import LoginView from './LoginView.vue'
import { useAuthStore } from '../../stores/auth.js'
import { authSceneKey } from '../../composables/authScene.js'
import * as api from '../../api/auth.js'
import { authenticated, deferred, ticket } from '../../test/factories.js'
import { ApiError } from '../../utils/errors.js'

vi.mock('../../api/auth.js', () => ({ login: vi.fn(), sendLoginCode: vi.fn() }))
beforeEach(() => {
  vi.mocked(api.login).mockReset()
  vi.mocked(api.sendLoginCode).mockReset()
})
async function setup() {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/login', name: 'login', component: LoginView }],
  })
  await router.push('/login')
  const scene = reactive({ step: 'login' })
  const wrapper = mount(LoginView, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, ElementPlus],
      provide: { [authSceneKey]: scene },
    },
  })
  await flushPromises()
  return { wrapper, auth: useAuthStore(pinia), scene }
}
async function fill(
  wrapper,
  email = 'listener@example.test',
  password = 'sample-password',
) {
  await wrapper.get('[data-testid="email-input"]').setValue(email)
  await wrapper.get('[data-testid="password-input"]').setValue(password)
}
it('should_validate_empty_and_short_password_without_request', async () => {
  const { wrapper } = await setup()
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.text()).toContain('请输入邮箱地址'))
  await fill(wrapper, 'invalid', 'short')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.text()).toContain('请输入有效邮箱'))
  await vi.waitFor(() => expect(wrapper.text()).toContain('密码需为 8–128'))
  expect(api.login).not.toHaveBeenCalled()
})
it('should_authenticate_and_show_real_success_state', async () => {
  vi.mocked(api.login).mockResolvedValue(authenticated())
  const { wrapper, scene } = await setup()
  await fill(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[data-testid="login-success"]').text()).toContain(
    'listener',
  )
  expect(wrapper.get('[data-testid="session-role"]').text()).toContain('用户')
  expect(scene.step).toBe('success')
  expect(document.activeElement.textContent).toBe('登录成功')
})
it('should_expand_alternatives_and_keep_email_when_switching_to_code', async () => {
  const { wrapper } = await setup()
  await fill(wrapper)
  await wrapper.get('[data-testid="other-methods"]').trigger('click')
  await wrapper.get('[data-testid="method-EMAIL_CODE"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="email-input"]').element.value).toBe(
    'listener@example.test',
  )
  expect(wrapper.find('[data-testid="password-input"]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="code-input"]').element.value).toBe('')
  expect(wrapper.find('#login-methods').exists()).toBe(false)
})
it('should_disable_inputs_and_switch_while_logging_in', async () => {
  const response = deferred()
  vi.mocked(api.login).mockReturnValue(response.promise)
  const { wrapper } = await setup()
  await fill(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(
    wrapper.get('[data-testid="login-submit"]').attributes('disabled'),
  ).toBeDefined()
  expect(
    wrapper.get('[data-testid="other-methods"]').attributes('disabled'),
  ).toBeDefined()
  response.resolve(authenticated())
  await flushPromises()
})
it.each([
  ['INVALID_CREDENTIALS', 401],
  ['ROLE_SELECTION_NOT_ALLOWED', 403],
  ['INTERNAL_ERROR', 500],
  ['NETWORK_ERROR', 0],
])('should_show_safe_%s_feedback', async (code, status) => {
  vi.mocked(api.login).mockRejectedValue(
    new ApiError({ code, status, detail: 'SQL hidden' }),
  )
  const { wrapper } = await setup()
  await fill(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[data-testid="login-error"]').text()).not.toContain('SQL')
  expect(wrapper.find('form').exists()).toBe(true)
})
it('should_send_code_only_after_valid_email', async () => {
  vi.mocked(api.sendLoginCode).mockResolvedValue({
    purpose: 'LOGIN',
    expiresAt: ticket().expiresAt,
  })
  const { wrapper } = await setup()
  await wrapper.get('[data-testid="other-methods"]').trigger('click')
  await wrapper.get('[data-testid="method-EMAIL_CODE"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-testid="send-code"]').trigger('click')
  await flushPromises()
  expect(api.sendLoginCode).not.toHaveBeenCalled()
  await wrapper.get('[data-testid="email-input"]').setValue('a@example.test')
  await wrapper.get('[data-testid="send-code"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="code-notice"]').text()).toContain(
    '验证码已发送',
  )
  expect(wrapper.get('[data-testid="send-code"]').text()).toContain('60 秒')
})
it.each(['USER', 'ADMIN'])(
  'should_select_%s_after_admin_authentication',
  async (role) => {
    vi.useFakeTimers()
    vi.mocked(api.login)
      .mockResolvedValueOnce({
        status: 'ROLE_SELECTION_REQUIRED',
        authentication: null,
        roleSelection: ticket(),
      })
      .mockResolvedValueOnce(authenticated(role))
    const { wrapper, scene } = await setup()
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(scene.step).toBe('role-selection')
    await vi.advanceTimersByTimeAsync(1100)
    await wrapper.get(`[data-testid="role-${role}"]`).trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="session-role"]').text()).toContain(
      role === 'ADMIN' ? '管理员' : '用户',
    )
  },
)

it('should_show_code_notice_original_error_and_recovery_together', async () => {
  const { wrapper } = await setup()
  await wrapper.get('[data-testid="other-methods"]').trigger('click')
  await wrapper.get('[data-testid="method-EMAIL_CODE"]').trigger('click')
  await wrapper
    .get('[data-testid="email-input"]')
    .setValue('listener@example.test')
  vi.mocked(api.sendLoginCode).mockResolvedValue({
    purpose: 'LOGIN',
    expiresAt: ticket().expiresAt,
  })
  await wrapper.get('[data-testid="send-code"]').trigger('click')
  await flushPromises()
  vi.mocked(api.login).mockRejectedValue(
    new ApiError({ code: 'AUTH_STATE_STORE_UNAVAILABLE', status: 503 }),
  )
  await wrapper.get('[data-testid="code-input"]').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[data-testid="code-notice"]').text()).toContain(
    '验证码已发送',
  )
  expect(wrapper.get('[data-testid="login-error"]').text()).toContain(
    '登录服务暂时不可用',
  )
  expect(wrapper.get('[data-testid="login-recovery"]').text()).toContain(
    '验证码可能已被使用',
  )
  expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
  expect(api.login).toHaveBeenCalledTimes(1)
})

it('should_recommend_restart_after_uncertain_role_selection_and_clear_sensitive_state', async () => {
  vi.useFakeTimers()
  const { wrapper, auth } = await setup()
  auth.roleSelection = ticket()
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1100)
  vi.mocked(api.login).mockRejectedValue(new ApiError({ code: 'TIMEOUT' }))
  await wrapper.get('[data-testid="role-USER"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="login-recovery"]').text()).toContain(
    '登录票据',
  )
  expect(wrapper.get('[data-testid="restart-login"]').classes()).toContain(
    'restart-recommended',
  )
  await wrapper.get('[data-testid="restart-login"]').trigger('click')
  await flushPromises()
  expect(auth.roleSelection).toBeNull()
  expect(wrapper.get('[data-testid="password-input"]').element.value).toBe('')
  expect(wrapper.find('[data-testid="login-recovery"]').exists()).toBe(false)
})
