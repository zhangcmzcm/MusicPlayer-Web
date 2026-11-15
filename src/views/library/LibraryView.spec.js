import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import LibraryView from './LibraryView.vue'
import LibraryToolbar from '../../components/library/LibraryToolbar.vue'
import TrackTable from '../../components/library/TrackTable.vue'
import { useTrackList } from '../../composables/useTrackList.js'
import { trackPage } from '../../test/factories.js'

vi.mock('../../composables/useTrackList.js', () => ({ useTrackList: vi.fn() }))
let flow
let queryRef
beforeEach(() => {
  const target = document.createElement('div')
  target.id = 'business-search'
  document.body.append(target)
  flow = {
    page: ref(trackPage()),
    pending: ref(false),
    error: ref(null),
    retryRemaining: ref(0),
    retry: vi.fn(),
  }
  useTrackList.mockImplementation((query) => {
    queryRef = query
    return flow
  })
})
afterEach(() => document.querySelector('#business-search')?.remove())
async function view(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'library', component: LibraryView }],
  })
  await router.push(path)
  const wrapper = mount(LibraryView, {
    attachTo: document.body,
    global: { plugins: [router, ElementPlus], stubs: { TrackCover: true } },
  })
  await flushPromises()
  return { wrapper, router }
}
it('should_render_a_real_library_and_focus_its_heading', async () => {
  const { wrapper } = await view()
  expect(wrapper.get('h1').text()).toBe('曲库')
  expect(wrapper.text()).toContain('风经过的地方')
  expect(document.activeElement).toBe(wrapper.get('h1').element)
})
it('should_persist_raw_search_reset_pagination_and_restore_history', async () => {
  const { wrapper, router } = await view('/?page=2')
  wrapper.getComponent(LibraryToolbar).vm.$emit('search-submitted', ' 林间 ')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ q: ' 林间 ' })
  expect(queryRef.value).toMatchObject({ q: ' 林间 ', page: 0 })
  wrapper.getComponent(LibraryToolbar).vm.$emit('sort-changed', 'title,asc')
  await flushPromises()
  wrapper.getComponent(LibraryToolbar).vm.$emit('size-changed', 50)
  await flushPromises()
  wrapper.getComponent(TrackTable).vm.$emit('page-changed', 1)
  await flushPromises()
  expect(queryRef.value).toMatchObject({
    q: ' 林间 ',
    page: 1,
    size: 50,
    sort: 'title,asc',
  })
  wrapper.getComponent(TrackTable).vm.$emit('reset-page')
  await flushPromises()
  expect(queryRef.value.page).toBe(0)
  router.back()
  await vi.waitFor(() => expect(queryRef.value.page).toBe(1))
})
it('should_refresh_identical_queries_and_allow_query_recovery', async () => {
  const { wrapper, router } = await view()
  wrapper.getComponent(LibraryToolbar).vm.$emit('search-submitted', '')
  await flushPromises()
  expect(flow.retry).toHaveBeenCalledTimes(1)
  await router.push('/?page=-1')
  await flushPromises()
  expect(queryRef.value).toBeNull()
  expect(wrapper.get('[role="alert"]').text()).toContain('查询条件无效')
  await wrapper.get('button[aria-label="恢复默认条件"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({})
})
it('should_offer_safe_feedback_when_query_navigation_fails', async () => {
  const { wrapper, router } = await view()
  vi.spyOn(router, 'push').mockRejectedValue(
    Error('private navigation failure'),
  )
  wrapper.getComponent(LibraryToolbar).vm.$emit('search-submitted', '林间')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法完成')
  expect(wrapper.text()).not.toContain('private navigation failure')
})
