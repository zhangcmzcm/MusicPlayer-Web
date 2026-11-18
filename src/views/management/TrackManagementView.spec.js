import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import TrackManagementView from './TrackManagementView.vue'
import LibraryToolbar from '../../components/library/LibraryToolbar.vue'
import TrackTable from '../../components/library/TrackTable.vue'
import { useTrackList } from '../../composables/useTrackList.js'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../stores/auth.js'
import { authentication, trackPage } from '../../test/factories.js'
import { ApiError } from '../../utils/errors.js'
import { listManagementTracks } from '../../api/tracks.js'
import { ElRadioGroup } from 'element-plus'

vi.mock('../../composables/useTrackList.js', () => ({ useTrackList: vi.fn() }))
let flow
let queryRef
beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().session = authentication('ADMIN')
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
async function view(path = '/admin/tracks') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/tracks/import',
        name: 'track-import',
        component: { template: '<h1>批量导入</h1>' },
      },
      {
        path: '/admin/tracks',
        name: 'track-management',
        component: TrackManagementView,
      },
      { path: '/', name: 'library', component: { template: '<h1>曲库</h1>' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(TrackManagementView, {
    attachTo: document.body,
    global: { plugins: [router, ElementPlus], stubs: { TrackCover: true } },
  })
  await flushPromises()
  return { wrapper, router }
}
it('should_open_import_with_all_five_submitted_query_fields', async () => {
  const { wrapper, router } = await view(
    '/admin/tracks?q=%20林间%20&status=ARCHIVED&page=2&size=50&sort=id,asc',
  )
  await wrapper.get('a.upload-entry').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value).toMatchObject({
    name: 'track-import',
    query: {
      q: ' 林间 ',
      status: 'ARCHIVED',
      page: '2',
      size: '50',
      sort: 'id,asc',
    },
  })
})
it('should_render_a_real_library_and_focus_its_heading', async () => {
  const { wrapper } = await view()
  expect(wrapper.get('h1').text()).toBe('歌曲管理')
  expect(wrapper.text()).toContain('风经过的地方')
  expect(document.activeElement).toBe(wrapper.get('h1').element)
})
it('should_persist_raw_search_reset_pagination_and_restore_history', async () => {
  const { wrapper, router } = await view('/admin/tracks?page=2')
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
  await router.push('/admin/tracks?page=-1')
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

it('should_submit_status_and_reset_page', async () => {
  const { wrapper, router } = await view('/admin/tracks?page=2')
  wrapper.getComponent(ElRadioGroup).vm.$emit('change', 'ARCHIVED')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ status: 'ARCHIVED' })
  expect(queryRef.value).toMatchObject({ page: 0, status: 'ARCHIVED' })
  expect(useTrackList).toHaveBeenCalledWith(expect.any(Object), {
    fetchPage: listManagementTracks,
  })
  wrapper.getComponent(LibraryToolbar).vm.$emit('search-submitted', ' 林间 ')
  await flushPromises()
  expect(queryRef.value).toMatchObject({ q: ' 林间 ', status: 'ARCHIVED' })
  wrapper.getComponent(LibraryToolbar).vm.$emit('search-submitted', '')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ status: 'ARCHIVED' })
  wrapper.getComponent(ElRadioGroup).vm.$emit('change', 'ALL')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({})
})
it('should_preserve_focus_after_async_data_and_disable_limited_status_search', async () => {
  const { wrapper } = await view('/admin/tracks?q=林间')
  const input = document.querySelector('input[aria-label="搜索音乐"]')
  input.focus()
  flow.page.value = trackPage({ status: 'DRAFT' })
  flow.retryRemaining.value = 2
  await flushPromises()
  expect(document.activeElement).toBe(input)
  expect(wrapper.getComponent(ElRadioGroup).props('disabled')).toBe(true)
  flow.retryRemaining.value = 0
  await flushPromises()
  expect(wrapper.getComponent(ElRadioGroup).props('disabled')).toBe(false)
})
it('should_hide_management_data_after_role_change_and_api_forbidden', async () => {
  const { wrapper } = await view()
  flow.error.value = new ApiError({ status: 403 })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('权限')
  expect(wrapper.get('a').attributes('href')).toBe('/')
  expect(wrapper.findComponent(TrackTable).exists()).toBe(false)
  flow.error.value = null
  useAuthStore().session = authentication('USER')
  await flushPromises()
  expect(queryRef.value).toBeNull()
  expect(wrapper.text()).not.toContain('风经过的地方')
  expect(wrapper.findComponent(LibraryToolbar).exists()).toBe(false)
})
it('should_choose_management_empty_text_and_recover_invalid_status', async () => {
  const { wrapper, router } = await view()
  flow.page.value = trackPage({
    items: [],
    totalElements: '0',
    totalPages: '0',
  })
  await flushPromises()
  expect(wrapper.text()).toContain('暂无歌曲')
  await router.push('/admin/tracks?status=DRAFT')
  await flushPromises()
  expect(wrapper.text()).toContain('当前状态暂无歌曲')
  await router.push('/admin/tracks?status=ALL')
  await flushPromises()
  expect(queryRef.value).toBeNull()
  expect(wrapper.text()).toContain('歌曲管理查询条件无效')
  await wrapper.get('button[aria-label="恢复默认条件"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({})
})
