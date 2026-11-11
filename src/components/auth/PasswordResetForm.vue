<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Object, required: true },
  rules: { type: Object, required: true },
  phase: { type: String, required: true },
  busy: Boolean,
  remaining: { type: Number, default: 0 },
  sendRemaining: { type: Number, default: 0 },
  canVerify: Boolean,
  canComplete: Boolean,
  maskedEmail: { type: String, default: '' },
})
const emit = defineEmits([
  'update:modelValue',
  'send-code',
  'verify-code',
  'submit',
  'restart',
])
const formRef = ref()
const id = useId()
const fields = computed(() =>
  props.phase === 'email'
    ? [
        {
          name: 'email',
          label: '邮箱地址',
          type: 'email',
          autocomplete: 'email',
        },
      ]
    : props.phase === 'code'
      ? [
          {
            name: 'code',
            label: '邮箱验证码',
            type: 'text',
            autocomplete: 'one-time-code',
          },
        ]
      : [
          {
            name: 'newPassword',
            label: '新密码',
            type: 'password',
            autocomplete: 'new-password',
          },
          {
            name: 'confirmPassword',
            label: '确认新密码',
            type: 'password',
            autocomplete: 'new-password',
          },
        ],
)
const submitEvent = computed(
  () =>
    ({ email: 'send-code', code: 'verify-code', password: 'submit' })[
      props.phase
    ],
)
const label = computed(
  () =>
    ({ email: '获取验证码', code: '验证并继续', password: '重置密码' })[
      props.phase
    ],
)
const unavailable = computed(
  () =>
    props.busy ||
    props.remaining > 0 ||
    (props.phase === 'code' && !props.canVerify) ||
    (props.phase === 'password' && !props.canComplete),
)
function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
async function validate(operation) {
  if (operation === 'request' && props.phase === 'code') return true
  try {
    return await formRef.value.validate()
  } catch {
    return false
  }
}
watch(
  () => props.phase,
  async () => {
    await nextTick()
    formRef.value?.clearValidate()
  },
)
watch(
  () => props.modelValue.newPassword,
  async () => {
    if (props.phase !== 'password' || !props.modelValue.confirmPassword) return
    await nextTick()
    try {
      await formRef.value.validateField('confirmPassword')
    } catch {
      return false
    }
  },
)
defineExpose({ validate })
</script>

<template>
  <div v-if="phase === 'code'" class="mail-summary">
    <p>若该邮箱已绑定账号，你将收到验证码。</p>
    <strong>{{ maskedEmail }}</strong>
    <el-button link :disabled="busy" @click="emit('restart')"
      >修改邮箱</el-button
    >
  </div>
  <el-form
    ref="formRef"
    :model="modelValue"
    :rules="rules"
    :disabled="busy"
    label-position="top"
    hide-required-asterisk
    novalidate
    @submit.prevent="emit(submitEvent)"
    @keydown.enter="
      ($event.isComposing || $event.keyCode === 229) && $event.preventDefault()
    "
  >
    <el-form-item
      v-for="field in fields"
      :key="field.name"
      :prop="field.name"
      :label="field.label"
      :for="`${id}-${field.name}`"
    >
      <div class="input-row">
        <el-input
          :id="`${id}-${field.name}`"
          :name="field.name"
          :model-value="modelValue[field.name]"
          :type="field.type"
          :autocomplete="field.autocomplete"
          :show-password="field.type === 'password'"
          :inputmode="field.name === 'code' ? 'numeric' : undefined"
          :aria-invalid="
            formRef?.getField(field.name)?.validateState === 'error'
          "
          :aria-describedby="`${id}-${field.name}-error`"
          :data-testid="`reset-${field.name}`"
          @update:model-value="update(field.name, $event)"
        >
          <template
            v-if="field.type === 'password'"
            #password-icon="{ visible }"
            ><button
              type="button"
              class="visibility"
              :aria-label="`${visible ? '隐藏' : '显示'}${field.label}`"
            >
              {{ visible ? '隐藏' : '显示' }}
            </button></template
          >
        </el-input>
        <el-button
          v-if="field.name === 'code'"
          :disabled="busy || sendRemaining > 0"
          @click="emit('send-code')"
          >{{
            sendRemaining ? `${sendRemaining} 秒后重发` : '重新获取'
          }}</el-button
        >
      </div>
      <template #error="{ error }"
        ><div
          :id="`${id}-${field.name}-error`"
          class="el-form-item__error"
          role="alert"
        >
          {{ error }}
        </div></template
      >
      <p v-if="field.name === 'email'" class="help">
        未绑定邮箱的账号暂不支持自助找回。
      </p>
      <p v-if="field.name === 'code'" class="help">
        请查看收件箱或垃圾邮件文件夹。
      </p>
      <p v-if="field.name === 'newPassword'" class="help">
        8–72 位英文、数字或英文符号，不能全为空格。
      </p>
    </el-form-item>
    <el-button
      native-type="submit"
      type="primary"
      class="primary"
      :loading="busy"
      :disabled="unavailable"
      data-testid="reset-continue"
      >{{ remaining ? `${remaining} 秒后重试` : label }}</el-button
    >
  </el-form>
  <div v-if="phase === 'password'" class="restart">
    <el-button link :disabled="busy" @click="emit('restart')"
      >重新验证邮箱</el-button
    >
  </div>
</template>

<style scoped>
.mail-summary {
  border-bottom: 1px solid var(--line);
  padding-bottom: 20px;
  margin-bottom: 24px;
  font-size: 13px;
  color: var(--ink-muted);
}
.mail-summary p {
  margin: 0 0 6px;
}
.mail-summary strong {
  color: var(--ink);
  font-weight: 500;
  margin-right: 10px;
  overflow-wrap: anywhere;
}
.input-row {
  display: flex;
  gap: 12px;
  width: 100%;
}
.input-row .el-input {
  min-width: 0;
}
.input-row > .el-button {
  height: 46px;
  margin-left: 0;
}
.help {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-muted);
  margin: 8px 0 0;
}
.primary {
  width: 100%;
  min-height: 47px;
  border-radius: 7px;
  margin-top: 6px;
  letter-spacing: 1px;
}
.restart {
  text-align: center;
  margin-top: 22px;
}
.visibility {
  background: transparent;
  border: 0;
  color: var(--green-action);
  cursor: pointer;
  padding: 3px;
  font-size: 12px;
}
.visibility:focus-visible {
  outline: 2px solid var(--green-action);
}
:deep(.el-input__wrapper) {
  border-radius: 7px;
  background: white;
}
</style>
