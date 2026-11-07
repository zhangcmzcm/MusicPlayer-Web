import { effectScope, nextTick, reactive, shallowRef } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuthSceneTransition } from './useAuthSceneTransition.js'
import { deferred } from '../test/factories.js'

beforeEach(() => vi.useFakeTimers())
function setup(name = 'login', reduced = false) {
  const media = {
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.mocked(window.matchMedia).mockReturnValue(media)
  const leaf = document.createElement('div')
  leaf.style.cssText =
    'left:38%;top:-120px;width:1188px;height:1080px;transform:translateX(-50%)'
  const finished = deferred()
  const animation = {
    finished: finished.promise,
    cancel: vi.fn(() => finished.reject(new Error('cancelled'))),
  }
  leaf.animate = vi.fn(() => animation)
  const route = reactive({ name })
  const scope = effectScope()
  const flow = scope.run(() =>
    useAuthSceneTransition({ route, leafRef: shallowRef({ $el: leaf }) }),
  )
  return { flow, route, scope, leaf, animation, finished, media }
}
it('should_open_registration_in_stable_pose_without_animation', () => {
  const { flow, scope, leaf } = setup('register')
  expect(flow.settledPage.value).toBe('register')
  expect(flow.transitioning.value).toBe(false)
  expect(leaf.animate).not.toHaveBeenCalled()
  scope.stop()
})
it.each([
  ['login', 'register'],
  ['register', 'login'],
])('should_flip_from_%s_to_%s_and_settle', async (from, to) => {
  const { flow, route, scope, leaf, finished, animation } = setup(from)
  const prepared = flow.prepareNavigation(to)
  expect(flow.transitioning.value).toBe(true)
  await vi.advanceTimersByTimeAsync(180)
  expect(await prepared).toBe(true)
  route.name = to
  await nextTick()
  await nextTick()
  expect(leaf.animate).toHaveBeenCalledTimes(1)
  const [frames, options] = leaf.animate.mock.calls[0]
  expect(options.duration).toBe(2240)
  expect(frames[1].transform).toContain('scaleX(')
  finished.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(flow.settledPage.value).toBe(to)
  expect(flow.transitioning.value).toBe(false)
  expect(animation.cancel).toHaveBeenCalled()
  scope.stop()
})
it('should_cancel_pending_navigation_and_clear_listeners_on_dispose', async () => {
  const { flow, scope, media } = setup()
  const prepared = flow.prepareNavigation('register')
  scope.stop()
  expect(await prepared).toBe(false)
  expect(flow.transitioning.value).toBe(false)
  expect(media.removeEventListener).toHaveBeenCalledWith(
    'change',
    expect.any(Function),
  )
})
it('should_settle_current_route_when_motion_preference_changes', async () => {
  const { flow, media, route, scope } = setup()
  const prepared = flow.prepareNavigation('register')
  media.matches = true
  media.addEventListener.mock.calls[0][1]()
  expect(await prepared).toBe(true)
  route.name = 'register'
  await nextTick()
  expect(flow.settledPage.value).toBe('register')
  expect(flow.transitioning.value).toBe(false)
  expect(await flow.prepareNavigation('login')).toBe(true)
  expect(await flow.prepareNavigation('register')).toBe(true)
  expect(await flow.prepareNavigation('not-found')).toBe(true)
  scope.stop()
})
it('should_ignore_old_animation_after_another_navigation', async () => {
  const { flow, route, scope, finished } = setup()
  const prepared = flow.prepareNavigation('register')
  await vi.advanceTimersByTimeAsync(180)
  await prepared
  route.name = 'register'
  await nextTick()
  await nextTick()
  flow.finishAtCurrentRoute()
  route.name = 'login'
  finished.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(flow.settledPage.value).toBe('login')
  expect(flow.transitioning.value).toBe(false)
  scope.stop()
})
