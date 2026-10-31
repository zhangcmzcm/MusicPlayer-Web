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
  selectedRole,
  step,
  rules,
  sendRemaining,
  loginRemaining,
} = flow
const formRef = ref(),
  titleRef = ref()
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
      titleRef.value?.focus()
    }
  },
  { immediate: true },
)
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
    <div class="heading">
      <div class="eyebrow">A LITTLE FRESH AIR</div>
      <h1 ref="titleRef" tabindex="-1" data-testid="login-title">
        {{ title }}
      </h1>
      <p class="intro">{{ intro }}</p>
    </div>
    <div
      v-if="safeError"
      class="feedback"
      role="alert"
      data-testid="login-error"
    >
      {{ safeError }}
    </div>
    <p
      v-if="codeNotice"
      class="code-notice"
      role="status"
      data-testid="code-notice"
    >
      {{ codeNotice }}
    </p>
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
.step-content-enter-active,
.step-content-leave-active {
  transition: opacity 180ms ease;
}
.step-content-enter-from,
.step-content-leave-to {
  opacity: 0;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 9px;
  letter-spacing: 2.7px;
  color: var(--green-action);
}
.eyebrow::before {
  content: '';
  width: 22px;
  height: 1px;
  background: #97b47c;
}
h1 {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 35px;
  letter-spacing: 3px;
  line-height: 1.5;
  margin: 15px 0 10px;
}
h1:focus {
  outline: none;
}
.intro {
  font-size: 12px;
  letter-spacing: 1px;
  line-height: 1.8;
  color: var(--ink-muted);
  margin: 0 0 28px;
}
.feedback {
  font-size: 13px;
  line-height: 1.7;
  color: var(--error-color);
  margin: 0 0 16px;
  overflow-wrap: anywhere;
}
.code-notice {
  font-size: 12px;
  line-height: 1.7;
  color: var(--green-action);
  margin-bottom: 16px;
}
.role-view .heading {
  text-align: center;
}
.role-view .eyebrow {
  justify-content: center;
}
.role-view .feedback {
  text-align: center;
}
.role-view .intro {
  margin-bottom: 0;
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
  h1 {
    font-size: clamp(24px, 7vw, 31px);
    letter-spacing: 2px;
  }
  .eyebrow {
    font-size: 8px;
    letter-spacing: 2px;
  }
  .intro {
    font-size: 11px;
  }
}
</style>
