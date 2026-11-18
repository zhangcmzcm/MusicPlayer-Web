import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import TrackImportView from './TrackImportView.vue'
import ImportFilePicker from '../../components/management/ImportFilePicker.vue'
import ImportQueue from '../../components/management/ImportQueue.vue'
import { useAuthStore } from '../../stores/auth.js'
import { useTrackImportStore } from '../../stores/trackImport.js'
import { importTrack } from '../../api/trackImports.js'
import { authentication, deferred, importResult } from '../../test/factories.js'
vi.mock('../../api/trackImports.js', () => ({ importTrack: vi.fn() }))
let pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().session = authentication('ADMIN')
  vi.mocked(importTrack).mockReset()
})
async function setup(query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/tracks/import',
        name: 'track-import',
        component: TrackImportView,
      },
      {
        path: '/admin/tracks',
        name: 'track-management',
        component: { template: '<h1>歌曲管理</h1>' },
      },
      { path: '/', name: 'library', component: { template: '<h1>曲库</h1>' } },
    ],
  })
  await router.push(`/admin/tracks/import${query}`)
  const wrapper = mount(
    { template: '<RouterView />' },
    {
      attachTo: document.body,
      global: { plugins: [pinia, router, ElementPlus] },
    },
  )
  await flushPromises()
  return { wrapper, router, store: useTrackImportStore() }
}
it('should_pause_on_leave_keep_current_request_and_restore_query', async () => {
  const pending = deferred()
  vi.mocked(importTrack).mockReturnValueOnce(pending.promise)
  const { wrapper, router, store } = await setup(
    '?q=%20林间%20&status=PUBLISHED&page=2&size=50&sort=title,asc',
  )
  expect(document.activeElement).toBe(wrapper.get('h1').element)
  wrapper
    .getComponent(ImportFilePicker)
    .vm.$emit('files-selected', [
      new File(['a'], 'one.mp3'),
      new File(['b'], 'two.flac'),
    ])
  await flushPromises()
  wrapper.getComponent(ImportQueue).vm.$emit('start')
  await flushPromises()
  await wrapper.get('[aria-label="返回歌曲管理"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({
    q: ' 林间 ',
    status: 'PUBLISHED',
    page: '2',
    size: '50',
    sort: 'title,asc',
  })
  expect(importTrack.mock.calls[0][1].signal.aborted).toBe(false)
  await router.push('/admin/tracks/import')
  await flushPromises()
  expect(store.batchState).toBe('pausing')
  pending.resolve(importResult())
  await flushPromises()
  expect(store.batchState).toBe('paused')
  expect(importTrack).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(wrapper.get('h1').element)
})
it('should_return_to_drafts_and_keep_size_sort_after_success', async () => {
  vi.mocked(importTrack).mockResolvedValue(importResult())
  const { wrapper, router } = await setup(
    '?q=林间&status=ARCHIVED&page=3&size=50&sort=id,asc',
  )
  wrapper
    .getComponent(ImportFilePicker)
    .vm.$emit('files-selected', [new File(['a'], 'song.mp3')])
  await flushPromises()
  wrapper.getComponent(ImportQueue).vm.$emit('start')
  await flushPromises()
  wrapper.getComponent(ImportQueue).vm.$emit('drafts-requested')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({
    status: 'DRAFT',
    size: '50',
    sort: 'id,asc',
  })
})
it('should_use_defaults_for_invalid_return_query_and_hide_queue_after_role_loss', async () => {
  const { wrapper } = await setup('?page=-1')
  expect(wrapper.findComponent(ImportFilePicker).exists()).toBe(true)
  useAuthStore().session.user.role = 'USER'
  await flushPromises()
  expect(wrapper.findComponent(ImportQueue).exists()).toBe(false)
  expect(wrapper.text()).toContain('权限')
})
it('should_show_safe_navigation_error_and_handle_cancelled_navigation', async () => {
  const { wrapper, router } = await setup()
  const stop = router.beforeEach(() => false)
  await wrapper.get('[aria-label="返回歌曲管理"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('操作')
  stop()
  vi.spyOn(router, 'push').mockRejectedValueOnce(Error('internal'))
  await wrapper.get('[aria-label="返回歌曲管理"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role=alert]').text()).not.toContain('internal')
})
