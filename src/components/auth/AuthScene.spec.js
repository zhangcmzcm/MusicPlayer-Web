import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import App from '../../App.vue'
import { createAppRouter } from '../../router/index.js'
import { useAuthStore } from '../../stores/auth.js'

async function setup(reduced = true) {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  const pinia = createPinia()
  const router = createAppRouter(useAuthStore(pinia))
  await router.push('/login')
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia, router, ElementPlus] },
  })
  await flushPromises()
  return { router, wrapper }
}
it('should_keep_one_scene_and_move_heading_with_child_routes', async () => {
  const { router, wrapper } = await setup()
  const leaf = wrapper.get('[data-testid="main-leaf"]').element
  await router.push('/register')
  await flushPromises()
  expect(wrapper.get('[data-testid="main-leaf"]').element).toBe(leaf)
  expect(wrapper.get('[data-testid="auth-scene"]').classes()).toContain(
    'registration-scene',
  )
  expect(wrapper.get('h1').text()).toBe('让喜欢，就此启程')
  expect(wrapper.findAll('h1')).toHaveLength(1)
  expect(document.activeElement.textContent).toBe('让喜欢，就此启程')
  await router.push('/login')
  await flushPromises()
  expect(wrapper.get('[data-testid="auth-scene"]').classes()).not.toContain(
    'registration-scene',
  )
  expect(wrapper.get('h1').text()).toBe('听见，风的声音')
})
it('should_restore_interaction_after_navigation_is_rejected', async () => {
  const { router, wrapper } = await setup(false)
  router.beforeResolve((to) => (to.name === 'register' ? false : undefined))
  await router.push('/register')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('login')
  expect(wrapper.get('[data-testid="auth-scene"]').classes()).not.toContain(
    'scene-transitioning',
  )
  expect(
    wrapper.get('[data-testid="email-input"]').attributes('disabled'),
  ).toBeUndefined()
})
