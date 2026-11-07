import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'

export const useAuthFlowStore = defineStore('auth-flow', () => {
  const registrationSuccess = ref(null)
  const sendDeadlines = reactive(new Map())
  const ipDeadline = ref(0)
  function key(purpose, email) {
    return `${purpose}:${email.trim().toLowerCase()}`
  }
  function completeRegistration(username) {
    registrationSuccess.value = { username }
  }
  function clearHandoff() {
    registrationSuccess.value = null
  }
  function takeRegistrationSuccess() {
    const result = registrationSuccess.value
    clearHandoff()
    return result
  }
  function sendRemaining(purpose, email, now) {
    return Math.max(
      0,
      Math.ceil(
        (Math.max(
          ipDeadline.value,
          sendDeadlines.get(key(purpose, email)) || 0,
        ) -
          now) /
          1000,
      ),
    )
  }
  function recordSend(purpose, email, deadline) {
    for (const [entry, expiresAt] of sendDeadlines) {
      if (expiresAt <= Date.now()) sendDeadlines.delete(entry)
    }
    const entry = key(purpose, email)
    sendDeadlines.set(entry, Math.max(sendDeadlines.get(entry) || 0, deadline))
  }
  function recordLimit(purpose, email, error, now) {
    if (error.retryAfter === null) return
    const deadline = now + error.retryAfter * 1000
    if (['EMAIL_COOLDOWN', 'EMAIL_DAILY_LIMIT'].includes(error.scope))
      recordSend(purpose, email, deadline)
    else ipDeadline.value = Math.max(ipDeadline.value, deadline)
  }
  return {
    completeRegistration,
    clearHandoff,
    takeRegistrationSuccess,
    sendRemaining,
    recordSend,
    recordLimit,
  }
})
