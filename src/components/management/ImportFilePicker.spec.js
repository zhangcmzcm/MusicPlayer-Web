import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ImportFilePicker from './ImportFilePicker.vue'

function setup(props) {
  return mount(ImportFilePicker, { props, global: { plugins: [ElementPlus] } })
}
it('should_emit_original_files_and_clear_real_native_selection', async () => {
  const wrapper = setup()
  const input = wrapper.get('input[type=file]')
  const transfer = new DataTransfer()
  transfer.items.add(new File(['a'], 'first.mp3'))
  transfer.items.add(new File(['b'], 'other.txt'))
  input.element.files = transfer.files
  expect(input.element.files.length).toBe(2)
  expect(input.element.value).not.toBe('')
  await input.trigger('change')
  expect(
    wrapper.emitted('files-selected')[0][0].map((file) => file.name),
  ).toEqual(['first.mp3', 'other.txt'])
  expect(input.element.files.length).toBe(0)
  expect(input.element.value).toBe('')
  await input.trigger('change')
  expect(wrapper.emitted('files-selected')).toHaveLength(1)
})
it('should_accept_drop_and_prevent_selection_when_disabled', async () => {
  const wrapper = setup()
  const transfer = new DataTransfer()
  transfer.items.add(new File(['a'], 'track.flac'))
  await wrapper
    .get('[data-testid=file-drop]')
    .trigger('drop', { dataTransfer: transfer })
  expect(wrapper.emitted('files-selected')[0][0][0].name).toBe('track.flac')
  await wrapper.setProps({ disabled: true })
  expect(wrapper.get('button').element.disabled).toBe(true)
  const input = wrapper.get('input')
  input.element.files = transfer.files
  input.element.dispatchEvent(new Event('change'))
  await wrapper
    .get('[data-testid=file-drop]')
    .trigger('drop', { dataTransfer: transfer })
  expect(wrapper.emitted('files-selected')).toHaveLength(1)
  expect(input.element.files.length).toBe(0)
})
