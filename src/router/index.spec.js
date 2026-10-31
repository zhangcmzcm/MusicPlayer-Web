import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import App from '../App.vue'
import { createAppRouter } from './index.js'
import { useAuthStore } from '../stores/auth.js'

it('should_keep_parent_scene_mounted_between_its_child_routes', async () => {
  const pinia = createPinia(),
    auth = useAuthStore(pinia),
    router = createAppRouter(auth)
  router.addRoute('auth-scene', {
    path: 'test-auth-child',
    name: 'test-auth-child',
    component: { template: '<p data-testid="test-child">测试子路由</p>' },
  })
  await router.push('/login')
  const wrapper = mount(App, {
    global: { plugins: [pinia, router, ElementPlus] },
  })
  await vi.waitFor(() =>
    expect(wrapper.find('[data-testid="email-input"]').exists()).toBe(true),
  )
  const scene = wrapper.get('[data-testid="auth-scene"]').element
  await router.push('/test-auth-child')
  await flushPromises()
  expect(wrapper.get('[data-testid="auth-scene"]').element).toBe(scene)
  expect(wrapper.get('[data-testid="test-child"]').text()).toBe('测试子路由')
  expect(wrapper.find('[data-testid="email-input"]').exists()).toBe(false)
  await router.push('/unknown')
  await vi.waitFor(() =>
    expect(wrapper.find('[data-testid="not-found"]').exists()).toBe(true),
  )
  await router.push('/')
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
})
