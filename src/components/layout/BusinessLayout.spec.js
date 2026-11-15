import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import BusinessLayout from './BusinessLayout.vue'
import { useAuthStore } from '../../stores/auth.js'
import { authentication } from '../../test/factories.js'

async function layout(role = 'USER', withSidebar = true) {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.session = authentication(role)
  const children = [
    {
      path: '',
      name: 'library',
      component: { template: '<h1>曲库</h1>' },
      meta: { navigation: { section: 'top', label: '音乐', order: 0 } },
    },
  ]
  if (withSidebar)
    children.push(
      {
        path: 'favorites',
        name: 'test-favorites',
        component: { template: '<p>收藏测试</p>' },
        meta: {
          navigation: { section: 'sidebar', label: '我的收藏', order: 1 },
        },
      },
      {
        path: 'admin',
        name: 'test-management',
        component: { template: '<p>管理测试</p>' },
        meta: {
          roles: ['ADMIN'],
          navigation: { section: 'sidebar', label: '歌曲管理', order: 2 },
        },
      },
    )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: BusinessLayout, children }],
  })
  await router.push('/')
  const wrapper = mount(
    { template: '<RouterView />' },
    {
      attachTo: document.body,
      global: { plugins: [pinia, router, ElementPlus] },
    },
  )
  await flushPromises()
  return { wrapper, router, auth }
}
it.each(['USER', 'ADMIN'])(
  'should_only_show_management_for_current_ADMIN_role_%s',
  async (role) => {
    const { wrapper, auth } = await layout(role)
    expect(wrapper.text().includes('歌曲管理')).toBe(role === 'ADMIN')
    expect(wrapper.text()).toContain('我的收藏')
    expect(wrapper.get('#business-search').exists()).toBe(true)
    auth.clearSession()
    await flushPromises()
    expect(wrapper.text()).not.toContain('歌曲管理')
  },
)
it('should_render_only_available_routes_and_expand_the_real_sidebar', async () => {
  const { wrapper } = await layout('USER', false)
  expect(wrapper.find('button[aria-label="打开侧边导航"]').exists()).toBe(false)
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(wrapper.text()).toContain('曲库')
})
it('should_open_and_close_mobile_navigation', async () => {
  const { wrapper } = await layout()
  const toggle = wrapper.get('button[aria-label="打开侧边导航"]')
  await toggle.trigger('click')
  await flushPromises()
  expect(toggle.attributes('aria-expanded')).toBe('true')
  document.querySelector('button[aria-label="关闭侧边导航"]').click()
  await flushPromises()
  expect(toggle.attributes('aria-expanded')).toBe('false')
})
