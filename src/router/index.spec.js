import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import App from '../App.vue'
import { createAppRouter } from './index.js'
import { useAuthStore } from '../stores/auth.js'
import { authentication, trackPage } from '../test/factories.js'

vi.mock('../api/tracks.js', () => ({
  listTracks: vi.fn(async () => trackPage()),
  listManagementTracks: vi.fn(async () => trackPage({ status: 'DRAFT' })),
  getTrackCover: vi.fn(),
}))

it.each(['ADMIN', 'USER', null])(
  'should_protect_initial_import_route_for_%s',
  async (role) => {
    const router = createAppRouter({
      isAuthenticated: Boolean(role),
      session: role ? authentication(role) : null,
      clearSession: vi.fn(),
    })
    await router.push('/admin/tracks/import?status=DRAFT&size=50')
    expect(router.currentRoute.value.name).toBe(
      role === 'ADMIN' ? 'track-import' : role ? 'library' : 'login',
    )
    if (!role)
      expect(router.currentRoute.value.query.redirect).toBe(
        '/admin/tracks/import?status=DRAFT&size=50',
      )
    if (role === 'ADMIN')
      expect(router.currentRoute.value.meta).toMatchObject({
        requiresAuth: true,
        roles: ['ADMIN'],
        activeNavigation: 'track-management',
      })
  },
)

it.each(['ADMIN', 'USER'])(
  'should_mount_real_navigation_for_%s',
  async (role) => {
    const pinia = createPinia()
    const auth = useAuthStore(pinia)
    auth.session = authentication(role)
    const router = createAppRouter(auth)
    await router.push('/')
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia, router, ElementPlus] },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('曲库'))
    expect(wrapper.find('a[href="/admin/tracks"]').exists()).toBe(
      role === 'ADMIN',
    )
    if (role === 'ADMIN') {
      await wrapper.get('button[aria-label="打开侧边导航"]').trigger('click')
      await flushPromises()
      document.querySelector('nav[aria-label="手机侧边导航"] a').click()
      await vi.waitFor(() =>
        expect(router.currentRoute.value.name).toBe('track-management'),
      )
      await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('歌曲管理'))
      expect(
        wrapper
          .get('button[aria-label="打开侧边导航"]')
          .attributes('aria-expanded'),
      ).toBe('false')
      await router.push('/')
      await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('曲库'))
    }
  },
)

it.each(['ADMIN', 'USER', null])(
  'should_resolve_initial_management_navigation_for_%s',
  async (role) => {
    const router = createAppRouter({
      isAuthenticated: Boolean(role),
      session: role ? authentication(role) : null,
      clearSession: vi.fn(),
    })
    await router.push('/admin/tracks?status=DRAFT')
    expect(router.currentRoute.value.name).toBe(
      role === 'ADMIN' ? 'track-management' : role ? 'library' : 'login',
    )
    if (!role)
      expect(router.currentRoute.value.query.redirect).toBe(
        '/admin/tracks?status=DRAFT',
      )
    if (role === 'ADMIN')
      expect(router.currentRoute.value.meta).toMatchObject({
        requiresAuth: true,
        roles: ['ADMIN'],
        navigation: { section: 'sidebar', label: '歌曲管理', order: 20 },
      })
  },
)

it.each(['USER', 'ADMIN'])(
  'should_open_library_for_authenticated_%s',
  async (role) => {
    const auth = {
      isAuthenticated: true,
      session: authentication(role),
      clearSession: vi.fn(),
    }
    const router = createAppRouter(auth)
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('library')
    expect(router.currentRoute.value.meta.requiresAuth).toBe(true)
    expect(router.currentRoute.value.meta.navigation.label).toBe('音乐')
  },
)

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
