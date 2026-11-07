import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import App from '../../App.vue'
import { createAppRouter } from '../../router/index.js'
import { useAuthStore } from '../../stores/auth.js'
import { isNavigationFailure, NavigationFailureType } from 'vue-router'
import { deferred } from '../../test/factories.js'

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

function expectInteractive(router, wrapper, name) {
  expect(router.currentRoute.value.name).toBe(name)
  expect(wrapper.get('[data-testid="auth-scene"]').classes()).not.toContain(
    'scene-transitioning',
  )
  expect(wrapper.get('.scene-content').attributes('inert')).toBeUndefined()
  expect(document.activeElement).toBe(wrapper.get('h1').element)
}

it('should_complete_successor_navigation_during_preparation', async () => {
  const { router, wrapper } = await setup(false)
  const leaf = wrapper.get('[data-testid="main-leaf"]').element
  leaf.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
  const first = router.push('/register?attempt=first')
  await flushPromises()
  expect(wrapper.get('.scene-content').attributes('inert')).toBeDefined()
  const second = router.push('/register?attempt=second')
  const [failure, result] = await Promise.all([first, second])
  await flushPromises()
  expect(isNavigationFailure(failure, NavigationFailureType.cancelled)).toBe(
    true,
  )
  expect(result).toBeUndefined()
  expect(router.currentRoute.value.query.attempt).toBe('second')
  expectInteractive(router, wrapper, 'register')
  expect(
    wrapper.get('[data-testid="register-submit"]').attributes('disabled'),
  ).toBeUndefined()
})

it.each(['push', 'replace'])(
  'should_restore_interaction_after_same_route_%s_during_preparation',
  async (method) => {
    const { router, wrapper } = await setup(false)
    const first = router.push('/register')
    await flushPromises()
    expect(wrapper.get('.scene-content').attributes('inert')).toBeDefined()
    const duplicate = await router[method]('/login')
    expect(
      isNavigationFailure(duplicate, NavigationFailureType.duplicated),
    ).toBe(true)
    await first
    await flushPromises()
    expectInteractive(router, wrapper, 'login')
    const input = wrapper.get('[data-testid="email-input"]')
    await input.setValue('listener@example.test')
    expect(input.element.value).toBe('listener@example.test')
  },
)

it('should_restore_interaction_after_current_navigation_throws', async () => {
  const { router, wrapper } = await setup(false)
  const error = new Error('navigation failed')
  router.beforeResolve(() => {
    throw error
  })
  await expect(router.push('/register')).rejects.toBe(error)
  await flushPromises()
  expectInteractive(router, wrapper, 'login')
})

it('should_restore_interaction_when_successor_only_changes_current_query', async () => {
  const { router, wrapper } = await setup(false)
  const first = router.push('/register')
  await flushPromises()
  expect(wrapper.get('.scene-content').attributes('inert')).toBeDefined()
  expect(await router.push('/login?attempt=second')).toBeUndefined()
  expect(
    isNavigationFailure(await first, NavigationFailureType.cancelled),
  ).toBe(true)
  await flushPromises()
  expect(router.currentRoute.value.query.attempt).toBe('second')
  expectInteractive(router, wrapper, 'login')
})

it.each(['reject', 'throw'])(
  'should_ignore_late_%s_from_replaced_navigation',
  async (outcome) => {
    const { router, wrapper } = await setup(false)
    const waiting = deferred()
    const entered = deferred()
    router.beforeResolve(async (to) => {
      if (to.query.attempt === 'first') {
        entered.resolve()
        await waiting.promise
        if (outcome === 'throw') throw new Error('old navigation failed')
        return false
      }
    })
    const leaf = wrapper.get('[data-testid="main-leaf"]').element
    leaf.animate = vi.fn(() => ({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    }))
    // Attach the rejection handler before releasing the old asynchronous guard.
    const first = router.push('/register?attempt=first').catch((error) => error)
    await entered.promise
    const second = router.push('/register?attempt=second')
    await flushPromises()
    waiting.resolve()
    await first
    expect(wrapper.get('.scene-content').attributes('inert')).toBeDefined()
    expect(await second).toBeUndefined()
    await flushPromises()
    expectInteractive(router, wrapper, 'register')
    expect(router.currentRoute.value.query.attempt).toBe('second')
  },
)
