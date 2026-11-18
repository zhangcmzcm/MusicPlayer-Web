import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ImportQueue from './ImportQueue.vue'
import { ApiError } from '../../utils/errors.js'
const item = (state, index = 0) => ({
  id: `item-${index}`,
  fileName: `track-${index}.mp3`,
  size: 1024,
  state,
  attempt: state === 'waiting' || state === 'invalid' ? 0 : 1,
  progress: null,
  error: null,
  validationMessage: null,
  result: null,
})
function setup(props = {}) {
  return mount(ImportQueue, {
    props: {
      items: [],
      counts: {
        total: 0,
        waiting: 0,
        invalid: 0,
        active: 0,
        succeeded: 0,
        failed: 0,
        blocked: 0,
        uncertain: 0,
      },
      batchState: 'idle',
      active: false,
      blockerId: null,
      error: null,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}
it('should_explain_empty_queue_and_emit_manual_start', async () => {
  const wrapper = setup()
  expect(wrapper.text()).toContain('选择文件后在这里查看导入队列')
  expect(wrapper.get('[aria-label="开始导入"]').element.disabled).toBe(true)
  await wrapper.setProps({
    items: [item('waiting')],
    counts: { total: 1, waiting: 1 },
  })
  await wrapper.get('[aria-label="开始导入"]').trigger('click')
  expect(wrapper.emitted('start')).toHaveLength(1)
  await wrapper.get('[aria-label="移除 track-0.mp3"]').trigger('click')
  expect(wrapper.emitted('item-removed')[0]).toEqual(['item-0'])
})
it('should_present_all_states_warnings_and_safe_errors', async () => {
  const states = [
    'waiting',
    'invalid',
    'sending',
    'processing',
    'succeeded',
    'failed',
    'blocked',
    'uncertain',
  ]
  const rows = states.map(item)
  rows[1].validationMessage = '仅支持 MP3 或 FLAC 文件。'
  rows[4].result = {
    track: { title: '清晨', artistName: '林间' },
    warnings: ['未找到内嵌封面。'],
  }
  rows[6].error = new ApiError({
    status: 429,
    code: 'TRACK_IMPORT_RATE_LIMITED',
    retryAfter: 12,
  })
  const wrapper = setup({
    items: rows,
    counts: {
      total: 8,
      waiting: 1,
      invalid: 1,
      active: 2,
      succeeded: 1,
      failed: 1,
      blocked: 1,
      uncertain: 1,
    },
    batchState: 'paused',
    blockerId: 'item-6',
  })
  for (const label of [
    '等待',
    '本地校验未通过',
    '正在发送',
    '服务端处理',
    '已导入',
    '导入失败',
    '待重试',
    '结果待确认',
  ])
    expect(wrapper.text()).toContain(label)
  expect(wrapper.text()).toContain('清晨 · 林间')
  expect(wrapper.text()).toContain('12 秒')
  expect(wrapper.get('details').text()).toContain('未找到内嵌封面。')
  await wrapper.get('[aria-label="重试当前项"]').trigger('click')
  expect(wrapper.emitted('retry-requested')).toHaveLength(1)
  await wrapper.get('[aria-label="查看草稿"]').trigger('click')
  expect(wrapper.emitted('drafts-requested')).toHaveLength(1)
  expect(wrapper.get('[aria-label="继续导入"]').element.disabled).toBe(true)
})
it('should_disable_duplicate_actions_while_running_or_pausing_and_show_transfer_progress', async () => {
  const wrapper = setup({
    items: [{ ...item('sending'), progress: 52 }],
    counts: { total: 1, active: 1, waiting: 1 },
    active: true,
    batchState: 'running',
  })
  expect(wrapper.get('[role=progressbar]').attributes('aria-valuenow')).toBe(
    '52',
  )
  expect(wrapper.get('[role=progressbar]').attributes('aria-label')).toBe(
    'track-0.mp3 发送进度',
  )
  await wrapper.get('[aria-label="完成当前项后暂停"]').trigger('click')
  expect(wrapper.emitted('pause-requested')).toHaveLength(1)
  await wrapper.setProps({ batchState: 'pausing' })
  expect(wrapper.get('[aria-label="完成当前项后暂停"]').element.disabled).toBe(
    true,
  )
  expect(wrapper.text()).toContain('完成当前项后暂停')
})
