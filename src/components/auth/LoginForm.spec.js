import { mount, flushPromises } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ElementPlus from 'element-plus'
import LoginForm from './LoginForm.vue'

async function setup(loginType = 'EMAIL_PASSWORD') {
  let wrapper
  wrapper = mount(LoginForm, {
    attachTo: document.body,
    props: {
      loginType,
      modelValue: { email: '', username: '', password: '', code: '' },
      rules: {
        email: [{ required: true, message: '请输入邮箱地址', trigger: 'blur' }],
      },
      'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }),
    },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

it.each([
  ['EMAIL_PASSWORD', ['email', 'password']],
  ['USERNAME_PASSWORD', ['username', 'password']],
  ['EMAIL_CODE', ['email', 'code']],
])('should_associate_real_floating_labels_for_%s', async (method, fields) => {
  const wrapper = await setup(method)
  for (const field of fields) {
    const input = wrapper.get(`[name="${field}"]`)
    const label = wrapper.get(`label[for="${input.attributes('id')}"]`)
    expect(label.text()).not.toBe('')
    expect(input.element.closest('.floating-field')).not.toBeNull()
    expect(input.attributes('placeholder')).toBeUndefined()
  }
})

it('should_keep_input_ids_unique_between_form_instances', async () => {
  const first = await setup(),
    second = await setup()
  const ids = [...first.findAll('input'), ...second.findAll('input')].map(
    (input) => input.attributes('id'),
  )
  expect(new Set(ids).size).toBe(ids.length)
})

it('should_float_filled_and_prefilled_values_and_preserve_password_spaces', async () => {
  const wrapper = await setup()
  const email = wrapper.get('[name="email"]')
  expect(
    email.element.closest('.floating-field').classList.contains('has-value'),
  ).toBe(false)
  await email.setValue('listener@example.test')
  expect(
    email.element.closest('.floating-field').classList.contains('has-value'),
  ).toBe(true)
  await email.setValue('')
  expect(
    email.element.closest('.floating-field').classList.contains('has-value'),
  ).toBe(false)
  await wrapper.setProps({
    modelValue: {
      email: 'prefilled@example.test',
      username: '',
      password: '  ',
      code: '',
    },
    busy: true,
  })
  expect(
    wrapper
      .get('[name="password"]')
      .element.closest('.floating-field')
      .classList.contains('has-value'),
  ).toBe(true)
  expect(wrapper.get('[name="password"]').element.value).toBe('  ')
  expect(wrapper.get('[name="email"]').attributes('disabled')).toBeDefined()
})

it('should_associate_visible_validation_error_with_its_input', async () => {
  const wrapper = await setup()
  expect(await wrapper.vm.$.exposed.validateEmail()).toBe(false)
  const input = wrapper.get('[name="email"]')
  expect(input.attributes('aria-invalid')).toBe('true')
  await expect
    .poll(() =>
      wrapper.find(`#${input.attributes('aria-describedby')}`).exists(),
    )
    .toBe(true)
  expect(wrapper.get(`#${input.attributes('aria-describedby')}`).text()).toBe(
    '请输入邮箱地址',
  )
  await input.setValue('listener@example.test')
  expect(await wrapper.vm.$.exposed.validateEmail()).toBe(true)
  expect(input.attributes('aria-invalid')).toBe('false')
  expect(input.attributes('aria-describedby')).toBeUndefined()
})

it.each([
  { name: 'null', value: null, text: '', filled: false },
  { name: 'missing', value: undefined, text: '', filled: false },
  { name: 'numeric_zero', value: 0, text: '0', filled: true },
])(
  'should_match_native_input_display_for_$name',
  async ({ value, text, filled }) => {
    const wrapper = await setup()
    await wrapper.setProps({
      modelValue: { email: value, username: '', password: '', code: '' },
    })
    const input = wrapper.get('[name="email"]')
    expect(input.element.value).toBe(text)
    expect(
      input.element.closest('.floating-field').classList.contains('has-value'),
    ).toBe(filled)
  },
)
