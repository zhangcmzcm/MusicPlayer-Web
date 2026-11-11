<script setup>
import { computed, inject, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { useLogin } from '../../composables/useLogin.js'
import { authSceneKey } from '../../composables/authScene.js'
import { getErrorMessage } from '../../utils/errors.js'
import { resolveSafeRedirect } from '../../utils/redirect.js'
import LoginForm from '../../components/auth/LoginForm.vue'
import RoleSelection from '../../components/auth/RoleSelection.vue'
import { useAuthFlowStore } from '../../stores/authFlow.js'

const auth = useAuthStore(),
  router = useRouter(),
  route = useRoute(),
  scene = inject(authSceneKey)
const flow = useLogin(auth)
const {
  form,
  loginType,
  busy,
  sending,
  error,
  codeNotice,
  recoveryNotice,
  selectedRole,
  step,
  rules,
  sendRemaining,
  loginRemaining,
} = flow
const formRef = ref()
const reset = useAuthFlowStore().takePasswordResetSuccess()
if (reset) flow.prefillResetEmail(reset.email)
const registered = useAuthFlowStore().takeRegistrationSuccess()
if (registered) flow.prefillRegisteredUsername(registered.username)
const title = computed(() =>
  step.value === 'role-selection'
    ? '此刻，以何种身份'
    : step.value === 'success'
      ? '登录成功'
      : '听见，风的声音',
)
const intro = computed(() =>
  step.value === 'role-selection'
    ? '让一阵风，带你去想去的地方。'
    : step.value === 'success'
      ? '让喜欢的旋律，自然发生。'
      : '让喜欢的旋律，自然发生。',
)
const safeError = computed(() =>
  error.value ? getErrorMessage(error.value) : '',
)
watch(
  step,
  async (value, previous) => {
    scene.step = value
    if (value === 'success') {
      const target = resolveSafeRedirect(router, route.query.redirect)
      if (target) await router.replace(target)
    }
    if (previous) {
      await nextTick()
      scene.focusHeading?.()
    }
  },
  { immediate: true },
)
watch(
  [title, intro],
  () => {
    scene.heading = {
      title: title.value,
      intro: intro.value,
      eyebrow: 'A LITTLE FRESH AIR',
      testId: 'login-title',
    }
  },
  { immediate: true },
)
const registerTarget = computed(() => {
  const redirect = resolveSafeRedirect(router, route.query.redirect)
  return { name: 'register', query: redirect ? { redirect } : {} }
})
const resetTarget = computed(() => ({
  name: 'forgot-password',
  query: registerTarget.value.query,
}))
function updateForm(value) {
  Object.assign(form, value)
}
</script>

<template>
  <section
    class="login-view"
    :class="{ 'role-view': step === 'role-selection' }"
    data-testid="login-view"
  >
    <div class="feedback-space">
      <p
        v-if="registered || reset"
        class="code-notice"
        role="status"
        :data-testid="reset ? 'password-reset-success' : 'registration-success'"
      >
        {{
          reset
            ? '密码已重置，请使用新密码登录。'
            : '注册成功，请使用新账号登录。'
        }}
      </p>
      <div
        v-if="safeError"
        class="feedback"
        role="alert"
        data-testid="login-error"
      >
        <p>{{ safeError }}</p>
        <p v-if="recoveryNotice" data-testid="login-recovery">
          {{ recoveryNotice }}
        </p>
      </div>
      <p
        v-if="codeNotice"
        class="code-notice"
        role="status"
        data-testid="code-notice"
      >
        {{ codeNotice }}
      </p>
    </div>
    <Transition name="step-content" mode="out-in">
      <LoginForm
        v-if="step === 'login'"
        ref="formRef"
        key="form"
        :model-value="form"
        :login-type="loginType"
        :rules="rules"
        :busy="busy"
        :sending="sending"
        :send-remaining="sendRemaining"
        :login-remaining="loginRemaining"
        :register-target="registerTarget"
        :reset-target="resetTarget"
        @update:model-value="updateForm"
        @method-changed="flow.changeMethod"
        @submit="flow.submit(formRef)"
        @send-code="flow.sendCode(formRef)"
      />
      <RoleSelection
        v-else-if="step === 'role-selection'"
        key="roles"
        :pending="busy"
        :selected-role="selectedRole"
        :retry-remaining="loginRemaining"
        :restart-recommended="Boolean(recoveryNotice)"
        @role-selected="flow.selectRole"
        @restart="flow.restart"
      />
      <div v-else class="success" role="status" data-testid="login-success">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="#edf5da" />
          <path
            d="m14 24 7 7 14-15"
            fill="none"
            stroke="#62894b"
            stroke-width="2"
          />
        </svg>
        <p>{{ auth.session.user.username }}，欢迎回来。</p>
        <p class="session-role" data-testid="session-role">
          本次身份：{{ auth.session.user.role === 'ADMIN' ? '管理员' : '用户' }}
        </p>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.feedback-space {
  min-height: 86px;
  padding-top: 4px;
}
.step-content-enter-active,
.step-content-leave-active {
  transition: opacity 180ms ease;
}
.step-content-enter-from,
.step-content-leave-to {
  opacity: 0;
}
.feedback {
  font-size: 13px;
  line-height: 20px;
  color: var(--error-color);
  margin: 0;
  overflow-wrap: anywhere;
}
.feedback p {
  margin: 0;
}
.feedback [data-testid='login-recovery'] {
  font-size: 12px;
  line-height: 18px;
  margin-top: 4px;
}
.code-notice {
  font-size: 12px;
  line-height: 18px;
  color: var(--green-action);
  margin: 4px 0 0;
}
.role-view .feedback-space {
  min-height: 90px;
}
.role-view .feedback {
  text-align: center;
}
.success {
  padding: 20px 0;
  font-size: 15px;
  line-height: 1.8;
}
.success svg {
  width: 48px;
  height: 48px;
}
.session-role {
  font-size: 13px;
  color: var(--ink-muted);
}
@media (max-width: 600px) {
  .feedback-space {
    min-height: 64px;
  }
  .feedback {
    font-size: 12px;
    line-height: 18px;
  }
}
</style>
