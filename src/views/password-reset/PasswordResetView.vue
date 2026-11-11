<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePasswordReset } from '../../composables/usePasswordReset.js'
import { useAuthFlowStore } from '../../stores/authFlow.js'
import { resolveSafeRedirect } from '../../utils/redirect.js'
import { getErrorMessage } from '../../utils/errors.js'
import PasswordResetForm from '../../components/auth/PasswordResetForm.vue'

const router = useRouter(),
  route = useRoute(),
  shared = useAuthFlowStore()
const flow = usePasswordReset()
const {
  form,
  rules,
  phase,
  busy,
  error,
  notice,
  remaining,
  sendRemaining,
  maskedEmail,
  canVerify,
  canComplete,
} = flow
const formRef = ref(),
  headingRef = ref()
const navigationNotice = ref('')
const title = computed(
  () =>
    ({
      email: '找回密码',
      code: '验证你的邮箱',
      password: '设置新密码',
      completed: '密码已重置',
    })[phase.value],
)
const intro = computed(
  () =>
    ({
      email: '使用账号绑定的邮箱，重新开启你的音乐时光。',
      code: '输入邮箱验证码，继续设置新密码。',
      password: '邮箱验证已通过，请设置一个新的登录密码。',
      completed: '请使用新密码登录。',
    })[phase.value],
)
const secondStep = computed(() =>
  ['password', 'completed'].includes(phase.value),
)
const loginTarget = computed(() => {
  const redirect = resolveSafeRedirect(router, route.query.redirect)
  return { name: 'login', query: redirect ? { redirect } : {} }
})
async function submit() {
  const result = await flow.submit(formRef.value)
  if (!result) return
  shared.completePasswordReset(result.email)
  try {
    const failure = await router.replace(loginTarget.value)
    if (failure) navigationNotice.value = '密码已重置，请点击返回登录继续。'
  } catch {
    navigationNotice.value = '密码已重置，请点击返回登录继续。'
  }
}
async function focusHeading() {
  await nextTick()
  headingRef.value?.focus()
}
watch(phase, focusHeading)
onMounted(focusHeading)
</script>

<template>
  <div class="reset-page" data-testid="password-reset-view">
    <header>
      <span class="brand">风与叶</span
      ><RouterLink :to="loginTarget">← 返回登录</RouterLink>
    </header>
    <main>
      <nav aria-label="找回密码进度" class="progress">
        <span
          :class="{ active: !secondStep, complete: secondStep }"
          :aria-current="!secondStep ? 'step' : undefined"
          ><b>{{ secondStep ? '✓' : '1' }}</b
          >验证邮箱</span
        ><i aria-hidden="true"></i
        ><span
          :class="{ active: secondStep }"
          :aria-current="secondStep ? 'step' : undefined"
          ><b>2</b>设置新密码</span
        >
      </nav>
      <h1 ref="headingRef" tabindex="-1">{{ title }}</h1>
      <p class="intro">{{ intro }}</p>
      <PasswordResetForm
        v-if="phase !== 'completed'"
        ref="formRef"
        :model-value="form"
        :rules="rules"
        :phase="phase"
        :busy="busy"
        :remaining="remaining"
        :send-remaining="sendRemaining"
        :masked-email="maskedEmail"
        :can-verify="canVerify"
        :can-complete="canComplete"
        @update:model-value="Object.assign(form, $event)"
        @send-code="flow.sendCode(formRef)"
        @verify-code="flow.verifyCode(formRef)"
        @submit="submit"
        @restart="flow.restart()"
      />
      <el-alert
        v-if="error"
        :title="getErrorMessage(error)"
        type="error"
        :closable="false"
        show-icon
        data-testid="reset-error"
      />
      <p v-if="notice" role="status" class="notice" data-testid="reset-notice">
        {{ notice }}
      </p>
      <p v-if="navigationNotice" role="status">{{ navigationNotice }}</p>
      <el-button v-if="notice && !busy" link @click="flow.restart()"
        >重新申请验证码</el-button
      >
      <RouterLink
        v-if="phase === 'completed' || (phase === 'password' && !canComplete)"
        :to="loginTarget"
        class="login-recovery"
        >返回登录</RouterLink
      >
    </main>
    <footer>一叶清新&nbsp;一曲自在</footer>
  </div>
</template>

<style scoped>
.reset-page {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  background: #fcfdf9;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 25px 45px;
  border-bottom: 1px solid #e9eee3;
  background: white;
}
.brand {
  font-family: var(--font-serif);
  letter-spacing: 2px;
  font-size: 21px;
}
a {
  font-size: 13px;
  color: var(--ink-muted);
  text-decoration: none;
}
a:hover {
  color: var(--green-action);
  text-decoration: underline;
}
main {
  width: 410px;
  max-width: calc(100% - 48px);
  margin: 58px auto 54px;
}
.progress {
  display: flex;
  align-items: center;
  font-size: 12px;
  margin-bottom: 39px;
}
.progress span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #7f8b77;
  white-space: nowrap;
}
.progress b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--line);
  border-radius: 50%;
  font-weight: 500;
  background: white;
}
.progress .active {
  color: var(--ink);
}
.progress .active b {
  background: var(--green-action);
  color: white;
  border-color: var(--green-action);
}
.progress .complete b {
  background: #eef4e5;
  color: var(--green-action);
}
.progress i {
  height: 1px;
  background: var(--line);
  flex: 1;
  margin: 0 18px;
}
h1 {
  font-family: var(--font-serif);
  font-size: 32px;
  font-weight: 500;
  letter-spacing: 2px;
  margin: 0 0 10px;
}
h1:focus {
  outline: none;
}
.intro {
  font-size: 13px;
  color: var(--ink-muted);
  margin: 0 0 31px;
}
.el-alert {
  margin-top: 22px;
}
.notice {
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  color: var(--ink-muted);
}
.login-recovery {
  display: block;
  margin-top: 18px;
}
footer {
  margin-top: auto;
  padding: 22px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 2px;
  color: #74816b;
}
@media (max-width: 600px) {
  header {
    padding: 23px 24px;
  }
  .brand {
    font-size: 19px;
  }
  main {
    margin-top: 42px;
  }
  .progress {
    margin-bottom: 34px;
  }
  .progress i {
    margin: 0 14px;
  }
  h1 {
    font-size: 29px;
  }
}
</style>
