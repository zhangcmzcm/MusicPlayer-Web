<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Object, required: true },
  rules: { type: Object, required: true },
  busy: Boolean,
  sending: Boolean,
  sendRemaining: { type: Number, default: 0 },
  submitRemaining: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue', 'submit', 'send-code'])
const formRef = ref()
const formId = useId()
const fields = computed(() => [
  { name: 'username', label: '用户名', autocomplete: 'username' },
  {
    name: 'password',
    label: '密码',
    autocomplete: 'new-password',
    password: true,
  },
  {
    name: 'confirmPassword',
    label: '确认密码',
    autocomplete: 'new-password',
    password: true,
  },
  {
    name: 'email',
    label: '邮箱（选填）',
    autocomplete: 'email',
    optional: true,
  },
  ...(props.modelValue.email.length
    ? [{ name: 'code', label: '邮箱验证码', autocomplete: 'one-time-code' }]
    : []),
])
function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
function errorAttributes(name) {
  const invalid = formRef.value?.getField(name)?.validateState === 'error'
  return {
    'aria-invalid': invalid,
    'aria-describedby': invalid ? `${formId}-${name}-error` : undefined,
  }
}
async function validate() {
  try {
    return await formRef.value.validate()
  } catch {
    return false
  }
}
async function validateEmail() {
  if (!props.modelValue.email.length) return false
  try {
    await formRef.value.validateField('email')
    return true
  } catch {
    return false
  }
}
async function validateConfirmation() {
  try {
    await formRef.value?.validateField('confirmPassword')
    return true
  } catch {
    return false
  }
}
watch(
  () => props.modelValue.password,
  async () => {
    if (!props.modelValue.confirmPassword) return
    await nextTick()
    await validateConfirmation()
  },
)
defineExpose({ validate, validateEmail })
</script>

<template>
  <el-form
    ref="formRef"
    :model="modelValue"
    :rules="rules"
    :disabled="busy"
    label-position="top"
    hide-required-asterisk
    scroll-to-error
    novalidate
    class="registration-form"
    @submit.prevent="emit('submit')"
    @keydown.enter="
      ($event.isComposing || $event.keyCode === 229) && $event.preventDefault()
    "
  >
    <TransitionGroup name="registration-field">
      <el-form-item
        v-for="(field, index) in fields"
        :key="field.name"
        :prop="field.name"
        class="floating-field"
        :class="{
          'has-value': modelValue[field.name].length,
          'last-field': index === fields.length - 1,
        }"
      >
        <template #label
          >{{ field.label
          }}<span
            v-if="!field.optional"
            class="required-mark"
            aria-hidden="true"
          >
            *</span
          ></template
        >
        <div class="field-row">
          <el-input
            :id="`${formId}-${field.name}`"
            :model-value="modelValue[field.name]"
            :type="
              field.password
                ? 'password'
                : field.name === 'email'
                  ? 'email'
                  : 'text'
            "
            :show-password="field.password"
            :autocomplete="field.autocomplete"
            :name="field.name"
            :inputmode="field.name === 'code' ? 'numeric' : undefined"
            :aria-required="!field.optional"
            v-bind="errorAttributes(field.name)"
            :data-testid="`register-${field.name}`"
            @update:model-value="update(field.name, $event)"
          >
            <template v-if="field.password" #password-icon="{ visible }">
              <button
                type="button"
                class="password-toggle"
                :aria-label="`${visible ? '隐藏' : '显示'}${field.label}`"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  <path v-if="visible" d="m3 3 18 18" />
                </svg>
              </button>
            </template>
          </el-input>
          <el-button
            v-if="field.name === 'code'"
            native-type="button"
            :loading="sending"
            :disabled="busy || sendRemaining > 0"
            data-testid="register-send-code"
            @click="emit('send-code')"
            >{{
              sendRemaining ? `${sendRemaining} 秒后重发` : '发送验证码'
            }}</el-button
          >
        </div>
        <template #error="{ error }"
          ><div
            :id="`${formId}-${field.name}-error`"
            class="el-form-item__error"
            role="alert"
          >
            {{ error }}
          </div></template
        >
      </el-form-item>
    </TransitionGroup>
    <p class="email-help">
      {{
        modelValue.email.length
          ? '可用于邮箱登录，后续找回密码也将使用该邮箱。'
          : '未绑定邮箱的账号暂不支持自助找回密码。'
      }}
    </p>
    <el-button
      type="primary"
      native-type="submit"
      class="register-button"
      :loading="busy && !sending"
      :disabled="busy || submitRemaining > 0"
      data-testid="register-submit"
      >{{ submitRemaining ? `${submitRemaining} 秒后重试` : '注册' }}</el-button
    >
  </el-form>
</template>

<style scoped>
.floating-field {
  position: relative;
  margin-bottom: 12px;
}
.floating-field.last-field {
  margin-bottom: 0;
}
.floating-field :deep(.el-form-item__content) {
  min-height: 88px;
}
.floating-field :deep(.el-form-item__error) {
  min-height: 42px;
}
.floating-field :deep(.el-form-item__label) {
  position: absolute;
  top: 23px;
  left: 14px;
  z-index: 2;
  transform: translateY(-50%);
  height: 18px !important;
  padding: 0 !important;
  font-size: 13px !important;
  line-height: 18px !important;
  color: #78836f !important;
  cursor: text;
  transition:
    top 150ms,
    font-size 150ms,
    color 150ms;
}
.floating-field.has-value :deep(.el-form-item__label),
.floating-field:focus-within :deep(.el-form-item__label),
.floating-field.is-error :deep(.el-form-item__label) {
  top: 0;
  left: 9px;
  padding: 0 5px !important;
  font-size: 11px !important;
  background: #fbfcf9;
}
.floating-field:focus-within :deep(.el-form-item__label) {
  color: var(--green-action) !important;
}
.floating-field.is-error :deep(.el-form-item__label),
.required-mark {
  color: var(--error-color) !important;
}
.field-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.field-row .el-input {
  min-width: 0;
}
.field-row .el-button {
  flex-shrink: 0;
  width: 106px;
  height: 46px;
  padding: 0 10px;
  font-size: 12px;
}
.password-toggle {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.password-toggle svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.password-toggle:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 3px;
}
.email-help {
  min-height: 18px;
  font-size: 11px;
  line-height: 18px;
  color: var(--ink-muted);
  margin: 0 0 8px;
}
.register-button {
  width: 100%;
  height: 46px;
  border-radius: 30px;
  letter-spacing: 5px;
}
.registration-field-enter-active,
.registration-field-leave-active {
  transition:
    opacity 180ms,
    transform 180ms;
}
.registration-field-enter-from,
.registration-field-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .floating-field :deep(.el-form-item__label),
  .registration-field-enter-active,
  .registration-field-leave-active {
    transition: none;
  }
}
</style>
