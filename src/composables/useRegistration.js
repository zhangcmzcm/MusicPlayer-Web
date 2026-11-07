import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { registerUser, sendRegistrationCode } from '../api/auth.js'
import { useAuthFlowStore } from '../stores/authFlow.js'
import { ApiError } from '../utils/errors.js'
import { reportError } from '../utils/logger.js'

export function useRegistration() {
  const shared = useAuthFlowStore()
  const form = reactive({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    code: '',
  })
  const pending = ref(false),
    sending = ref(false),
    error = ref(null)
  const codeNotice = ref(''),
    recoveryNotice = ref(''),
    now = ref(Date.now())
  const registrationDeadline = ref(0)
  const busy = computed(() => pending.value || sending.value)
  const normalizedEmail = computed(() => form.email.trim().toLowerCase())
  const sendRemaining = computed(() =>
    shared.sendRemaining('REGISTER', normalizedEmail.value, now.value),
  )
  const submitRemaining = computed(() =>
    Math.max(0, Math.ceil((registrationDeadline.value - now.value) / 1000)),
  )
  const rule = (accept, message) => [
    {
      validator: (_, value, done) =>
        done(accept(value) ? undefined : new Error(message)),
      trigger: 'blur',
    },
  ]
  const rules = {
    username: rule(
      (value) => /^[A-Za-z0-9_]{3,20}$/.test(value),
      '用户名需为 3–20 位字母、数字或下划线',
    ),
    password: rule(
      (value) => /^[\x20-\x7e]{8,72}$/.test(value) && /[^ ]/.test(value),
      '密码需为 8–72 位英文、数字或英文符号，不能全为空格',
    ),
    confirmPassword: rule(
      (value) => !!value && value === form.password,
      '两次输入的密码必须一致',
    ),
    email: rule(
      (value) =>
        value === '' ||
        (value.trim().length <= 120 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())),
      '请输入有效邮箱，最多 120 个字符',
    ),
    code: rule(
      (value) => !form.email.length || /^\d{6}$/.test(value),
      '请输入 6 位数字验证码',
    ),
  }
  let controller,
    generation = 0,
    disposed = false,
    codeExpiry = 0
  function clearSensitive() {
    form.password = ''
    form.confirmPassword = ''
    form.code = ''
  }
  function fail(failure, phase) {
    if (failure.code === 'CANCELLED') return
    error.value =
      failure instanceof ApiError
        ? failure
        : new ApiError({ code: 'CLIENT_ERROR' })
    if (!(failure instanceof ApiError)) reportError(error.value)
    const uncertain =
      ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(
        error.value.code,
      ) || error.value.status >= 500
    if (uncertain)
      recoveryNotice.value =
        phase === 'register'
          ? '注册结果暂未确认，可尝试登录核实。'
          : '发送结果暂未确认，请留意邮箱，并在允许发送后重试。'
    if (error.value.status === 429) {
      now.value = Date.now()
      if (phase === 'send')
        shared.recordLimit(
          'REGISTER',
          normalizedEmail.value,
          error.value,
          now.value,
        )
      else if (error.value.retryAfter !== null)
        registrationDeadline.value = now.value + error.value.retryAfter * 1000
    }
  }
  async function run(phase, formComponent) {
    if (
      busy.value ||
      (phase === 'send' ? sendRemaining.value : submitRemaining.value)
    )
      return null
    const current = ++generation
    controller = new AbortController()
    const request = controller
    pending.value = true
    sending.value = phase === 'send'
    error.value = null
    recoveryNotice.value = ''
    try {
      const valid =
        phase === 'send'
          ? await formComponent.validateEmail()
          : await formComponent.validate()
      if (!valid || disposed || current !== generation) return null
      const email = normalizedEmail.value
      if (phase === 'send') {
        codeNotice.value = ''
        const response = await sendRegistrationCode(email, {
          signal: request.signal,
        })
        if (disposed || current !== generation || request.signal.aborted)
          return null
        now.value = Date.now()
        shared.recordSend('REGISTER', email, now.value + 60000)
        codeExpiry = Date.parse(response.expiresAt)
        codeNotice.value = '验证码已发送，请及时查收。'
      } else {
        const username = form.username
        const payload = { username, password: form.password }
        if (form.email.length)
          Object.assign(payload, { email, code: form.code })
        await registerUser(payload, { signal: request.signal })
        if (disposed || current !== generation || request.signal.aborted)
          return null
        clearSensitive()
        return { username }
      }
    } catch (failure) {
      if (!disposed && current === generation && !request.signal.aborted)
        fail(failure, phase)
    } finally {
      if (current === generation) {
        pending.value = false
        sending.value = false
      }
    }
    return null
  }
  watch(
    () => form.email,
    () => {
      generation++
      controller?.abort()
      pending.value = false
      sending.value = false
      form.code = ''
      codeNotice.value = ''
      codeExpiry = 0
      recoveryNotice.value = ''
      error.value = null
    },
    { flush: 'sync' },
  )
  const timer = setInterval(() => {
    now.value = Date.now()
    if (codeExpiry && now.value >= codeExpiry) {
      codeNotice.value = ''
      codeExpiry = 0
    }
  }, 500)
  onScopeDispose(() => {
    disposed = true
    generation++
    controller?.abort()
    clearInterval(timer)
    clearSensitive()
  })
  return {
    form,
    rules,
    busy,
    sending,
    error,
    codeNotice,
    recoveryNotice,
    sendRemaining,
    submitRemaining,
    submit: (formComponent) => run('register', formComponent),
    sendCode: (formComponent) => run('send', formComponent),
  }
}
