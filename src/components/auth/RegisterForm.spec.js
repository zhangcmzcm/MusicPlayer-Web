import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import ElementPlus from 'element-plus'
import RegisterForm from './RegisterForm.vue'
import { useRegistration } from '../../composables/useRegistration.js'

beforeEach(() => setActivePinia(createPinia()))
async function setup() {
  const scope = effectScope()
  const flow = scope.run(() => useRegistration())
  const wrapper = mount(RegisterForm, {
    attachTo: document.body,
    props: {
      modelValue: flow.form,
      rules: flow.rules,
      'onUpdate:modelValue': (value) => Object.assign(flow.form, value),
    },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return { wrapper, flow, scope }
}
it('should_associate_unique_required_labels_and_expand_only_for_email', async () => {
  const { wrapper, scope } = await setup()
  expect(wrapper.findAll('input')).toHaveLength(4)
  for (const input of wrapper.findAll('input')) {
    expect(
      wrapper.get(`label[for="${input.attributes('id')}"]`).text(),
    ).toContain(input.attributes('name') === 'email' ? '选填' : '*')
    expect(input.attributes('aria-required')).toBe(
      input.attributes('name') === 'email' ? 'false' : 'true',
    )
  }
  await wrapper.get('[name="email"]').setValue('a@example.test')
  expect(wrapper.findAll('input')).toHaveLength(5)
  await wrapper.get('[name="email"]').setValue('')
  expect(wrapper.find('[name="code"]').exists()).toBe(false)
  scope.stop()
})
it('should_revalidate_confirmation_when_password_changes', async () => {
  const { wrapper, scope } = await setup()
  await wrapper.get('[name="password"]').setValue('sample-password')
  await wrapper.get('[name="confirmPassword"]').setValue('sample-password')
  await wrapper.get('[name="password"]').setValue('changed-password')
  await flushPromises()
  await wrapper.vm.validate()
  await vi.waitFor(() =>
    expect(wrapper.text()).toContain('两次输入的密码必须一致'),
  )
  const confirmation = wrapper.get('[name="confirmPassword"]')
  expect(confirmation.attributes('aria-invalid')).toBe('true')
  expect(
    wrapper
      .get(`#${confirmation.attributes('aria-describedby')}`)
      .attributes('role'),
  ).toBe('alert')
  await confirmation.setValue('changed-password')
  await flushPromises()
  await confirmation.trigger('blur')
  await flushPromises()
  await vi.waitFor(() =>
    expect(confirmation.attributes('aria-invalid')).toBe('false'),
  )
  scope.stop()
})
it('should_validate_email_independently_and_emit_actions_with_busy_feedback', async () => {
  const { wrapper, flow, scope } = await setup()
  expect(await wrapper.vm.validateEmail()).toBe(false)
  await wrapper.get('[name="email"]').setValue('invalid')
  expect(await wrapper.vm.validateEmail()).toBe(false)
  await wrapper.get('[name="email"]').setValue('a@example.test')
  expect(await wrapper.vm.validateEmail()).toBe(true)
  await wrapper.get('[data-testid="register-send-code"]').trigger('click')
  expect(wrapper.emitted('send-code')).toHaveLength(1)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('submit')).toHaveLength(1)
  Object.assign(flow.form, {
    username: 'listener',
    password: 'sample-password',
    confirmPassword: 'sample-password',
    code: '012345',
  })
  expect(await wrapper.vm.validate()).toBe(true)
  await wrapper.setProps({
    busy: true,
    sending: true,
    sendRemaining: 60,
    submitRemaining: 10,
  })
  expect(wrapper.get('[name="username"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="register-send-code"]').text()).toContain(
    '60 秒后重发',
  )
  expect(wrapper.get('[data-testid="register-submit"]').text()).toContain(
    '10 秒后重试',
  )
  scope.stop()
})
