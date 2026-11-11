import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import {
  requestPasswordReset,
  verifyPasswordReset,
  completePasswordReset,
} from '../api/passwordReset.js'
import { useAuthFlowStore } from '../stores/authFlow.js'
import { useAuthStore } from '../stores/auth.js'
import { ApiError } from '../utils/errors.js'
import { reportError } from '../utils/logger.js'

export function usePasswordReset() {
  const shared = useAuthFlowStore()
  const auth = useAuthStore()
  const form = reactive({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  })
  const phase = ref('email'),
    busy = ref(false),
    error = ref(null),
    notice = ref('')
  const now = ref(Date.now())
  const challenge = ref(null),
    ticket = ref(null)
  let generation = 0,
    controller,
    disposed = false
  const email = computed(() => form.email.trim().toLowerCase())
  const maskedEmail = computed(() => {
    const [local, domain] = email.value.split('@')
    return `${local.length > 4 ? local.slice(0, 2) + '*****' + local.slice(-2) : '*****'}@${domain || ''}`
  })
  const remaining = computed(() =>
    shared.passwordResetRemaining(
      phase.value === 'password'
        ? 'complete'
        : phase.value === 'code'
          ? 'verify'
          : 'request',
      email.value,
      now.value,
    ),
  )
  const sendRemaining = computed(() =>
    shared.passwordResetRemaining('request', email.value, now.value),
  )
  const canVerify = computed(
    () =>
      !!challenge.value && now.value < Date.parse(challenge.value.expiresAt),
  )
  const canComplete = computed(
    () => !!ticket.value && now.value < Date.parse(ticket.value.expiresAt),
  )
  const rule = (accept, message) => [
    {
      validator: (_, value, done) =>
        done(accept(value) ? undefined : new Error(message)),
      trigger: 'blur',
    },
  ]
  const rules = {
    email: rule(
      (value) =>
        value.trim().length <= 120 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
      '请输入有效邮箱，最多 120 个字符',
    ),
    code: rule((value) => /^[0-9]{6}$/.test(value), '请输入 6 位数字验证码'),
    newPassword: rule(
      (value) => /^[\x20-\x7e]{8,72}$/.test(value) && /[^ ]/.test(value),
      '密码需为 8–72 位英文、数字或英文符号，不能全为空格',
    ),
    confirmPassword: rule(
      (value) => !!value && value === form.newPassword,
      '两次输入的密码必须一致',
    ),
  }
  function clearSensitive() {
    form.code = ''
    form.newPassword = ''
    form.confirmPassword = ''
  }
  function invalidate() {
    generation++
    controller?.abort()
    busy.value = false
    clearSensitive()
    challenge.value = null
    ticket.value = null
  }
  function restart() {
    invalidate()
    phase.value = 'email'
    notice.value = ''
    error.value = null
  }
  function fail(failure, operation, requestEmail, sessionSnapshot) {
    if (failure?.code === 'CANCELLED') return
    error.value =
      failure instanceof ApiError
        ? failure
        : new ApiError({ code: 'CLIENT_ERROR' })
    if (!(failure instanceof ApiError)) reportError(error.value)
    if (error.value.status === 429 && error.value.retryAfter !== null) {
      now.value = Date.now()
      const deadline = now.value + error.value.retryAfter * 1000
      shared.recordPasswordResetWait(operation, requestEmail, deadline)
      shared.recordPasswordResetWait(operation, 'all', deadline)
    }
    const uncertain =
      ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(
        error.value.code,
      ) || error.value.status >= 500
    if (uncertain) {
      if (operation === 'request') {
        now.value = Date.now()
        shared.recordPasswordResetWait(
          'request',
          requestEmail,
          now.value + 60000,
        )
        notice.value = '申请结果暂未确认，请留意邮箱，并在允许获取后重新申请。'
      }
      if (operation === 'verify') {
        challenge.value = null
        form.code = ''
        notice.value = '验证结果暂未确认，请重新申请验证码后继续。'
      }
      if (operation === 'complete') {
        auth.clearSessionIfCurrent(sessionSnapshot)
        ticket.value = null
        clearSensitive()
        notice.value =
          '密码重置结果暂未确认，可尝试使用新密码登录核实，必要时重新申请。'
      }
    }
    if (
      operation === 'complete' &&
      error.value.code === 'PASSWORD_RESET_VERIFICATION_FAILED'
    ) {
      ticket.value = null
      clearSensitive()
      notice.value = '设置密码的凭据无效，请重新验证邮箱。'
    }
  }
  async function run(operation, component) {
    now.value = Date.now()
    const wait = shared.passwordResetRemaining(
      operation,
      email.value,
      now.value,
    )
    if (busy.value || wait || disposed || phase.value === 'completed')
      return null
    if (operation === 'verify' && !canVerify.value) return null
    if (operation === 'complete' && !canComplete.value) return null
    const current = ++generation
    controller = new AbortController()
    const request = controller
    const sessionSnapshot = {
      session: auth.session,
      roleSelection: auth.roleSelection,
      revision: auth.getSessionRevision(),
    }
    busy.value = true
    error.value = null
    notice.value = ''
    try {
      if (
        !(await component.validate(operation)) ||
        current !== generation ||
        disposed
      )
        return null
      const requestEmail = email.value
      if (operation === 'request') {
        const response = await requestPasswordReset(requestEmail, {
          signal: request.signal,
        })
        if (current !== generation || request.signal.aborted || disposed)
          return null
        challenge.value = response
        ticket.value = null
        clearSensitive()
        now.value = Date.now()
        shared.recordPasswordResetWait(
          'request',
          requestEmail,
          now.value + 60000,
        )
        phase.value = 'code'
      } else if (operation === 'verify') {
        const response = await verifyPasswordReset(
          { challengeId: challenge.value.challengeId, code: form.code },
          { signal: request.signal },
        )
        if (current !== generation || request.signal.aborted || disposed)
          return null
        ticket.value = response
        challenge.value = null
        clearSensitive()
        phase.value = 'password'
      } else {
        await completePasswordReset(
          {
            resetTicket: ticket.value.resetTicket,
            newPassword: form.newPassword,
          },
          { signal: request.signal },
        )
        if (current !== generation || request.signal.aborted || disposed)
          return null
        auth.clearSessionIfCurrent(sessionSnapshot)
        clearSensitive()
        ticket.value = null
        phase.value = 'completed'
        return { email: requestEmail }
      }
    } catch (failure) {
      if (current === generation && !request.signal.aborted && !disposed)
        fail(failure, operation, email.value, sessionSnapshot)
    } finally {
      if (current === generation) busy.value = false
    }
    return null
  }
  watch(() => form.email, restart, { flush: 'sync' })
  const timer = setInterval(() => {
    now.value = Date.now()
    if (busy.value) return
    if (challenge.value && !canVerify.value) {
      challenge.value = null
      form.code = ''
      notice.value = '找回申请已过期，请重新获取验证码。'
    }
    if (ticket.value && !canComplete.value) {
      ticket.value = null
      clearSensitive()
      notice.value = '设置密码的凭据已过期，请重新验证邮箱。'
    }
  }, 500)
  onScopeDispose(() => {
    disposed = true
    invalidate()
    form.email = ''
    clearInterval(timer)
  })
  return {
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
    restart,
    sendCode: (component) => run('request', component),
    verifyCode: (component) => run('verify', component),
    submit: (component) => run('complete', component),
  }
}
