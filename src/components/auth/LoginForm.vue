<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'
import { loginMethods } from '../../composables/useLogin.js'

const props = defineProps({
  resetTarget: { type: Object, default: () => ({ name: 'forgot-password' }) },
  registerTarget: { type: Object, default: () => ({ name: 'register' }) },
  modelValue: { type: Object, required: true },
  loginType: { type: String, required: true },
  rules: { type: Object, required: true },
  busy: Boolean,
  sending: Boolean,
  sendRemaining: { type: Number, default: 0 },
  loginRemaining: { type: Number, default: 0 },
})
const emit = defineEmits([
  'update:modelValue',
  'method-changed',
  'submit',
  'send-code',
])
const formRef = ref(),
  expanded = ref(false)
const formId = useId()
const isUsername = computed(() => props.loginType === 'USERNAME_PASSWORD')
const isCode = computed(() => props.loginType === 'EMAIL_CODE')
const alternatives = computed(() =>
  Object.entries(loginMethods).filter(([type]) => type !== props.loginType),
)
const sendLabel = computed(() =>
  props.sendRemaining ? `${props.sendRemaining} 秒后重发` : '发送验证码',
)
function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
function hasValue(value) {
  return String(value ?? '').length > 0
}
function errorAttributes(field) {
  const invalid = formRef.value?.getField(field)?.validateState === 'error'
  return {
    'aria-invalid': invalid,
    'aria-describedby': invalid ? `${formId}-${field}-error` : undefined,
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
  try {
    await formRef.value.validateField('email')
    return true
  } catch {
    return false
  }
}
watch(
  () => props.loginType,
  async () => {
    expanded.value = false
    await nextTick()
    formRef.value?.clearValidate()
  },
)
defineExpose({ validate, validateEmail })
</script>

<template>
  <el-form
    ref="formRef"
    :model="modelValue"
    :rules="rules"
    label-position="top"
    :disabled="busy"
    :class="{ 'is-busy': busy }"
    hide-required-asterisk
    novalidate
    @submit.prevent="emit('submit')"
    @keydown.enter="
      ($event.isComposing || $event.keyCode === 229) && $event.preventDefault()
    "
  >
    <el-form-item
      v-if="isUsername"
      key="username"
      label="用户名"
      prop="username"
      class="floating-field"
      :class="{ 'has-value': hasValue(modelValue.username) }"
    >
      <el-input
        :model-value="modelValue.username"
        autocomplete="username"
        name="username"
        v-bind="errorAttributes('username')"
        data-testid="username-input"
        @update:model-value="update('username', $event)"
      />
      <template #error="{ error }"
        ><div
          :id="`${formId}-username-error`"
          class="el-form-item__error"
          role="alert"
        >
          {{ error }}
        </div></template
      >
    </el-form-item>
    <el-form-item
      v-else
      key="email"
      label="邮箱"
      prop="email"
      class="floating-field"
      :class="{ 'has-value': hasValue(modelValue.email) }"
    >
      <el-input
        :model-value="modelValue.email"
        type="email"
        autocomplete="username"
        name="email"
        v-bind="errorAttributes('email')"
        data-testid="email-input"
        @update:model-value="update('email', $event)"
      />
      <template #error="{ error }"
        ><div
          :id="`${formId}-email-error`"
          class="el-form-item__error"
          role="alert"
        >
          {{ error }}
        </div></template
      >
    </el-form-item>
    <el-form-item
      v-if="isCode"
      key="code"
      label="验证码"
      prop="code"
      class="floating-field"
      :class="{ 'has-value': hasValue(modelValue.code) }"
    >
      <div class="code-row">
        <el-input
          :model-value="modelValue.code"
          inputmode="numeric"
          autocomplete="one-time-code"
          name="code"
          v-bind="errorAttributes('code')"
          data-testid="code-input"
          @update:model-value="update('code', $event)"
        />
        <el-button
          :loading="sending"
          :disabled="busy || sendRemaining > 0"
          native-type="button"
          data-testid="send-code"
          @click="emit('send-code')"
          >{{ sendLabel }}</el-button
        >
      </div>
      <template #error="{ error }"
        ><div
          :id="`${formId}-code-error`"
          class="el-form-item__error"
          role="alert"
        >
          {{ error }}
        </div></template
      >
    </el-form-item>
    <el-form-item
      v-else
      key="password"
      label="密码"
      prop="password"
      class="floating-field"
      :class="{ 'has-value': hasValue(modelValue.password) }"
    >
      <el-input
        :model-value="modelValue.password"
        type="password"
        show-password
        autocomplete="current-password"
        name="password"
        v-bind="errorAttributes('password')"
        data-testid="password-input"
        @update:model-value="update('password', $event)"
      >
        <template #password-icon="{ visible }">
          <button
            type="button"
            class="password-toggle"
            :aria-label="visible ? '隐藏密码' : '显示密码'"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              <path v-if="visible" d="m3 3 18 18" />
            </svg>
          </button>
        </template>
      </el-input>
      <template #error="{ error }"
        ><div
          :id="`${formId}-password-error`"
          class="el-form-item__error"
          role="alert"
        >
          {{ error }}
        </div></template
      >
    </el-form-item>
    <div class="password-assist-space">
      <RouterLink v-if="!isCode" :to="resetTarget">忘记密码？</RouterLink>
    </div>
    <el-button
      class="login-button"
      type="primary"
      native-type="submit"
      :loading="busy && !sending"
      :disabled="busy || loginRemaining > 0"
      data-testid="login-submit"
      >{{ loginRemaining ? `${loginRemaining} 秒后重试` : '登录' }}</el-button
    >
    <div class="method-switch">
      <button
        type="button"
        class="text-button"
        :disabled="busy"
        :aria-expanded="expanded"
        aria-controls="login-methods"
        data-testid="other-methods"
        @click="expanded = !expanded"
      >
        其他登录方式 <span aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
      </button>
      <div class="alternatives-space">
        <div v-if="expanded" id="login-methods" class="alternatives">
          <button
            v-for="[type, label] in alternatives"
            :key="type"
            type="button"
            class="text-button"
            :disabled="busy"
            :data-testid="`method-${type}`"
            @click="emit('method-changed', type)"
          >
            {{ label }}
          </button>
        </div>
      </div>
    </div>
    <div class="account-navigation-space">
      <RouterLink :to="registerTarget">还没有账号？去注册</RouterLink>
    </div>
  </el-form>
</template>

<style scoped>
.floating-field {
  position: relative;
}
.floating-field + .floating-field {
  margin-top: 12px;
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
  color: var(--ink-muted) !important;
  background: #fbfcf9;
}
.floating-field:focus-within :deep(.el-form-item__label) {
  color: var(--green-action) !important;
}
.floating-field.is-error :deep(.el-form-item__label) {
  color: var(--error-color) !important;
}
.is-busy .floating-field :deep(.el-form-item__label) {
  color: #88967c !important;
}
:deep(.el-form-item) {
  margin-bottom: 0;
}
:deep(.el-form-item__content) {
  min-height: 88px;
}
:deep(.el-form-item__error) {
  min-height: 42px;
}
.password-assist-space,
.account-navigation-space {
  min-height: 22px;
  font-size: 12px;
  line-height: 22px;
  color: var(--green-action);
}
.password-assist-space {
  text-align: right;
  font-size: 12px;
}
.password-assist-space a {
  color: var(--ink-muted);
  text-decoration: none;
}
.password-assist-space a:hover {
  color: var(--green-action);
  text-decoration: underline;
}
.account-navigation-space {
  text-align: center;
}
.account-navigation-space a {
  color: var(--green-action);
  text-decoration: none;
}
.account-navigation-space a:hover {
  text-decoration: underline;
}
.account-navigation-space a:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 3px;
}
.alternatives-space {
  min-height: 34px;
}
.code-row {
  display: flex;
  width: 100%;
  gap: 8px;
}
.code-row .el-input {
  min-width: 0;
}
.code-row .el-button {
  width: 106px;
  flex-shrink: 0;
  height: 46px;
  padding: 0 10px;
  font-size: 12px;
}
.login-button {
  width: 100%;
  height: 46px;
  border-radius: 30px;
  letter-spacing: 5px;
  margin-top: 4px;
}
.method-switch {
  text-align: center;
  margin-top: 10px;
  line-height: 28px;
}
.alternatives {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding-top: 4px;
}
.text-button {
  font: inherit;
  font-size: 12px;
  background: none;
  border: 0;
  color: var(--green-action);
  cursor: pointer;
  padding: 5px 2px;
}
.text-button:hover:not(:disabled) {
  text-decoration: underline;
}
.text-button:disabled {
  color: #88967c;
  cursor: not-allowed;
}
.text-button:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 4px;
  border-radius: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .floating-field :deep(.el-form-item__label) {
    transition: none;
  }
}
</style>
