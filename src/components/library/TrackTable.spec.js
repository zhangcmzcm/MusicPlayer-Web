import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import TrackTable from './TrackTable.vue'
import { trackPage } from '../../test/factories.js'
import { DEFAULT_LIBRARY_QUERY } from '../../utils/trackList.js'
import { ApiError } from '../../utils/errors.js'

function table(props = {}) {
  return mount(TrackTable, {
    props: {
      page: trackPage(),
      query: { ...DEFAULT_LIBRARY_QUERY },
      pending: false,
      error: null,
      ...props,
    },
    global: { plugins: [ElementPlus], stubs: { TrackCover: true } },
  })
}
it('should_render_the_song_metadata_and_nullable_fields', async () => {
  const wrapper = table({
    page: trackPage({ albumName: null, durationMs: null }),
  })
  await flushPromises()
  expect(wrapper.text()).toContain('风经过的地方')
  expect(wrapper.text()).toContain('林间来信')
  expect(wrapper.text()).toContain('未标注专辑')
  expect(wrapper.text()).toContain('--:--')
})
it('should_distinguish_loading_empty_and_error_states', async () => {
  const wrapper = table({ pending: true, page: null })
  expect(wrapper.get('[role="status"]').text()).toContain('读取曲库')
  await wrapper.setProps({
    pending: false,
    page: trackPage({ items: [], totalElements: '0', totalPages: '0' }),
  })
  expect(wrapper.text()).toContain('曲库暂时没有歌曲')
  await wrapper.setProps({ query: { ...DEFAULT_LIBRARY_QUERY, q: '林间' } })
  expect(wrapper.text()).toContain('没有找到相关歌曲')
  await wrapper.setProps({
    error: new ApiError({ code: 'TRACK_STORE_UNAVAILABLE', status: 503 }),
  })
  expect(wrapper.get('[role="alert"]').text()).toContain('曲库暂时无法读取')
  await wrapper.get('button[aria-label="重试读取曲库"]').trigger('click')
  expect(wrapper.emitted('retry')).toHaveLength(1)
})
it('should_recover_from_a_legal_empty_page', async () => {
  const wrapper = table({
    page: trackPage({
      items: [],
      page: 2,
      totalElements: '1',
      totalPages: '1',
      hasNext: false,
    }),
    query: { ...DEFAULT_LIBRARY_QUERY, page: 2 },
  })
  expect(wrapper.text()).toContain('当前页暂无歌曲')
  await wrapper.get('button[aria-label="回到第一页"]').trigger('click')
  expect(wrapper.emitted('reset-page')).toHaveLength(1)
})
it('should_preserve_large_counts_and_enforce_deep_pagination', async () => {
  const wrapper = table({
    page: trackPage({
      totalElements: '9223372036854775807',
      totalPages: '9223372036854775807',
      hasNext: true,
      page: 500,
    }),
    query: { ...DEFAULT_LIBRARY_QUERY, page: 500 },
  })
  expect(wrapper.text()).toContain('9223372036854775807')
  expect(
    wrapper.get('button[aria-label="下一页"]').attributes('disabled'),
  ).toBeDefined()
  await wrapper.get('button[aria-label="上一页"]').trigger('click')
  expect(wrapper.emitted('page-changed')[0]).toEqual([499])
  await wrapper.get('input[aria-label="页码"]').setValue('502')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.text()).toContain('501'))
  expect(wrapper.emitted('page-changed')).toHaveLength(1)
  await wrapper.get('input[aria-label="页码"]').setValue('2')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('page-changed')[1]).toEqual([1])
})
it('should_emit_next_page_and_block_limited_search_retry', async () => {
  const wrapper = table({ page: trackPage({ hasNext: true }) })
  expect(
    wrapper.get('button[aria-label="上一页"]').attributes('disabled'),
  ).toBeDefined()
  await wrapper.get('button[aria-label="下一页"]').trigger('click')
  expect(wrapper.emitted('page-changed')[0]).toEqual([1])
  await wrapper.setProps({
    query: { ...DEFAULT_LIBRARY_QUERY, q: '林间' },
    error: new ApiError({ code: 'TRACK_SEARCH_RATE_LIMITED', status: 429 }),
    retryRemaining: 3,
  })
  expect(
    wrapper.get('button[aria-label="重试读取曲库"]').attributes('disabled'),
  ).toBeDefined()
})
it('should_merge_secondary_metadata_for_compact_screens', async () => {
  const listeners = []
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: (_name, listener) => listeners.push(listener),
    removeEventListener: vi.fn(),
  })
  const wrapper = table()
  await flushPromises()
  expect(wrapper.get('.song-secondary').attributes('title')).toBe(
    '林间来信 / 叶影',
  )
  await wrapper.setProps({ page: trackPage({ albumName: null }) })
  expect(wrapper.get('.song-secondary').attributes('title')).toBe(
    '林间来信 / 未标注专辑',
  )
  expect(wrapper.findAll('th').some((cell) => cell.text() === '艺术家')).toBe(
    false,
  )
  listeners.forEach((listener) => listener({ matches: false }))
  await flushPromises()
  expect(wrapper.findAll('th').some((cell) => cell.text() === '艺术家')).toBe(
    true,
  )
})
