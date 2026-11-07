<script setup>
import { computed, inject, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authSceneKey } from '../../composables/authScene.js'
import { useRegistration } from '../../composables/useRegistration.js'
import { useAuthFlowStore } from '../../stores/authFlow.js'
import { getErrorMessage, ApiError } from '../../utils/errors.js'
import { reportError } from '../../utils/logger.js'
import { resolveSafeRedirect } from '../../utils/redirect.js'
import RegisterForm from '../../components/auth/RegisterForm.vue'

const scene = inject(authSceneKey)
const router = useRouter(),
  route = useRoute(),
  shared = useAuthFlowStore()
const flow = useRegistration()
const {
  form,
  rules,
  busy,
  sending,
  error,
  recoveryNotice,
  codeNotice,
  sendRemaining,
  submitRemaining,
} = flow
const formRef = ref()
const registrationCompleted = ref(false)
scene.step = 'register'
scene.heading = {
  title: '让喜欢，就此启程',
  eyebrow: 'A NEW MELODY',
  intro: '从一片叶，遇见你的旋律。',
  testId: 'register-title',
}
const safeError = computed(() =>
  error.value ? getErrorMessage(error.value) : '',
)
const loginTarget = computed(() => {
  const redirect = resolveSafeRedirect(router, route.query.redirect)
  return { name: 'login', query: redirect ? { redirect } : {} }
})
function updateForm(value) {
  const { email, ...fields } = value
  Object.assign(form, fields)
  form.email = email
}
async function submit() {
  if (registrationCompleted.value) return
  const result = await flow.submit(formRef.value)
  if (!result) return
  registrationCompleted.value = true
  shared.completeRegistration(result.username)
  try {
    await router.replace(loginTarget.value)
  } catch {
    reportError(new ApiError({ code: 'CLIENT_ERROR' }))
  }
}
</script>

<template>
  <section data-testid="register-view">
    <div class="feedback-space">
      <p
        v-if="registrationCompleted"
        class="code-notice"
        role="status"
        data-testid="registration-completed"
      >
        注册成功，请点击下方链接前往登录。
      </p>
      <div
        v-if="safeError"
        role="alert"
        class="feedback"
        data-testid="register-error"
      >
        <p>{{ safeError }}</p>
        <p v-if="recoveryNotice" data-testid="register-recovery">
          {{ recoveryNotice }}
        </p>
      </div>
      <p
        v-if="codeNotice"
        class="code-notice"
        role="status"
        data-testid="register-code-notice"
      >
        {{ codeNotice }}
      </p>
    </div>
    <RegisterForm
      ref="formRef"
      :model-value="form"
      :rules="rules"
      :busy="busy || registrationCompleted"
      :sending="sending"
      :send-remaining="sendRemaining"
      :submit-remaining="submitRemaining"
      @update:model-value="updateForm"
      @submit="submit"
      @send-code="flow.sendCode(formRef)"
    />
    <div class="account-navigation">
      <RouterLink :to="loginTarget">已有账号？去登录</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.feedback-space {
  min-height: 64px;
  padding-top: 4px;
}
.feedback {
  font-size: 12px;
  line-height: 18px;
  color: var(--error-color);
  overflow-wrap: anywhere;
}
.feedback p {
  margin: 0;
}
.feedback p + p {
  margin-top: 4px;
}
.code-notice {
  font-size: 12px;
  line-height: 18px;
  margin: 4px 0 0;
  color: var(--green-action);
}
.account-navigation {
  text-align: center;
  min-height: 30px;
  padding-top: 8px;
  font-size: 12px;
  line-height: 22px;
}
a {
  color: var(--green-action);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
a:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 3px;
}
@media (max-width: 600px) {
  .feedback-space {
    min-height: 64px;
  }
}
</style>
