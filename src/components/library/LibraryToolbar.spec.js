import { afterEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LibraryToolbar from './LibraryToolbar.vue'
import { DEFAULT_LIBRARY_QUERY } from '../../utils/trackList.js'

function toolbar(props = {}) {
  const target = document.createElement('div')
  target.id = 'business-search'
  document.body.append(target)
  return mount(LibraryToolbar, {
    attachTo: document.body,
    props: {
      query: { ...DEFAULT_LIBRARY_QUERY },
      pending: false,
      retryRemaining: 0,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}
const search = () => new DOMWrapper(document.querySelector('#business-search'))
afterEach(() => document.querySelector('#business-search')?.remove())
it('should_submit_raw_keywords_and_reject_contract_boundaries', async () => {
  const wrapper = toolbar()
  const input = search().get('input[aria-label="搜索音乐"]')
  await input.setValue(' 林间 ')
  await search().get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('search-submitted')[0]).toEqual([' 林间 '])
  await input.setValue('😀'.repeat(101))
  await search().get('form').trigger('submit')
  await flushPromises()
  await vi.waitFor(() => expect(search().text()).toContain('100'))
  expect(wrapper.emitted('search-submitted')).toHaveLength(1)
})
it('should_allow_a_new_search_while_an_older_query_is_pending', async () => {
  const wrapper = toolbar({ pending: true })
  expect(
    search().get('button[type="submit"]').attributes('disabled'),
  ).toBeDefined()
  await search().get('input[aria-label="搜索音乐"]').setValue('林间')
  expect(
    search().get('button[type="submit"]').attributes('disabled'),
  ).toBeUndefined()
  await search().get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('search-submitted')).toHaveLength(1)
})
it('should_keep_plain_list_recovery_available_during_search_limit', async () => {
  const wrapper = toolbar({
    query: { ...DEFAULT_LIBRARY_QUERY, q: '林间' },
    retryRemaining: 5,
  })
  expect(wrapper.text()).toContain('5 秒')
  expect(
    search().get('button[type="submit"]').attributes('disabled'),
  ).toBeDefined()
  await search().get('input[aria-label="搜索音乐"]').setValue('')
  await search().get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('search-submitted')[0]).toEqual([''])
})
it('should_emit_sort_and_size_changes_and_sync_browser_navigation', async () => {
  const wrapper = toolbar()
  wrapper.getComponent({ name: 'ElSelect' }).vm.$emit('change', 'title,asc')
  wrapper.getComponent({ name: 'ElInputNumber' }).vm.$emit('change', 50)
  expect(wrapper.emitted('sort-changed')[0]).toEqual(['title,asc'])
  expect(wrapper.emitted('size-changed')[0]).toEqual([50])
  await wrapper.setProps({ query: { ...DEFAULT_LIBRARY_QUERY, q: '新查询' } })
  expect(search().get('input[aria-label="搜索音乐"]').element.value).toBe(
    '新查询',
  )
})
it('should_preserve_ime_composition_and_merge_validation_submits', async () => {
  const wrapper = toolbar()
  const input = search().get('input[aria-label="搜索音乐"]')
  await input.setValue('林间')
  await input.trigger('compositionstart')
  await search().get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('search-submitted')).toBeUndefined()
  await input.trigger('compositionend')
  await Promise.all([
    search().get('form').trigger('submit'),
    search().get('form').trigger('submit'),
  ])
  await flushPromises()
  expect(wrapper.emitted('search-submitted')).toHaveLength(1)
})
