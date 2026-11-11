import { mount, flushPromises } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ElementPlus from 'element-plus'
import PasswordResetForm from './PasswordResetForm.vue'

it('should_emit_edits_validate_email_and_disable_pending_actions', async () => {
  let wrapper
  wrapper = mount(PasswordResetForm, {
    attachTo: document.body,
    props: {
      phase: 'email',
      modelValue: { email: '', code: '', newPassword: '', confirmPassword: '' },
      rules: {
        email: [{ required: true, message: '请输入邮箱', trigger: 'blur' }],
      },
      'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }),
    },
    global: { plugins: [ElementPlus] },
  })
  expect(await wrapper.vm.validate()).toBe(false)
  await wrapper.get('[name="email"]').setValue('listener@example.test')
  expect(await wrapper.vm.validate()).toBe(true)
  await wrapper.setProps({
    phase: 'code',
    maskedEmail: 'li*****er@example.test',
    canVerify: true,
    sendRemaining: 0,
  })
  await flushPromises()
  expect(await wrapper.vm.validate('request')).toBe(true)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '重新获取')
    .trigger('click')
  expect(wrapper.emitted('send-code')).toHaveLength(1)
  await wrapper.setProps({ busy: true })
  expect(wrapper.get('[name="code"]').attributes('disabled')).toBeDefined()
  await wrapper.setProps({ busy: false, phase: 'password', canComplete: true })
  await wrapper.get('[name="newPassword"]').setValue('sample-password')
  await wrapper.get('[name="confirmPassword"]').setValue('sample-password')
  await wrapper.get('[name="newPassword"]').setValue('changed-password')
  await flushPromises()
  expect(wrapper.get('label').text()).toBe('新密码')
})
