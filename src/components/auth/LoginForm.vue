<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { loginMethods } from '../../composables/useLogin.js'

const props = defineProps({
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
    >
      <el-input
        :model-value="modelValue.username"
        autocomplete="username"
        name="username"
        placeholder="你的用户名"
        data-testid="username-input"
        @update:model-value="update('username', $event)"
      />
    </el-form-item>
    <el-form-item v-else key="email" label="邮箱" prop="email">
      <el-input
        :model-value="modelValue.email"
        type="email"
        autocomplete="username"
        name="email"
        placeholder="你的邮箱地址"
        data-testid="email-input"
        @update:model-value="update('email', $event)"
      />
    </el-form-item>
    <el-form-item v-if="isCode" key="code" label="验证码" prop="code">
      <div class="code-row">
        <el-input
          :model-value="modelValue.code"
          inputmode="numeric"
          autocomplete="one-time-code"
          name="code"
          placeholder="6 位数字验证码"
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
    </el-form-item>
    <el-form-item v-else key="password" label="密码" prop="password">
      <el-input
        :model-value="modelValue.password"
        type="password"
        show-password
        autocomplete="current-password"
        name="password"
        placeholder="你的登录密码"
        data-testid="password-input"
        @update:model-value="update('password', $event)"
      />
    </el-form-item>
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
  </el-form>
</template>

<style scoped>
.code-row {
  display: flex;
  width: 100%;
  gap: 8px;
}
.code-row .el-input {
  min-width: 0;
}
.code-row .el-button {
  height: 46px;
  padding: 0 10px;
  font-size: 12px;
}
.login-button {
  width: 100%;
  height: 46px;
  border-radius: 30px;
  letter-spacing: 5px;
  margin-top: 8px;
}
.method-switch {
  text-align: center;
  margin-top: 19px;
}
.alternatives {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 12px;
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
</style>
