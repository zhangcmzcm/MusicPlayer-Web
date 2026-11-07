import { beforeEach, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthFlowStore } from './authFlow.js'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(1000)
})

it('should_read_expired_deadlines_without_mutating_computed_dependencies', () => {
  const flow = useAuthFlowStore()
  flow.recordSend('REGISTER', 'a@example.test', 61000)
  const remaining = computed(() =>
    flow.sendRemaining('REGISTER', 'a@example.test', 1000),
  )
  expect(remaining.value).toBe(60)
  expect(flow.sendRemaining('REGISTER', 'a@example.test', 61000)).toBe(0)
  expect(remaining.value).toBe(60)
  vi.setSystemTime(62000)
  flow.recordSend('REGISTER', 'b@example.test', 122000)
  expect(flow.sendRemaining('REGISTER', 'a@example.test', 62000)).toBe(0)
  expect(flow.sendRemaining('REGISTER', 'b@example.test', 62000)).toBe(60)
})

it('should_consume_registration_success_only_once', () => {
  const flow = useAuthFlowStore()
  flow.completeRegistration('listener')
  expect(flow.takeRegistrationSuccess()).toEqual({ username: 'listener' })
  expect(flow.takeRegistrationSuccess()).toBeNull()
  flow.completeRegistration('another')
  flow.clearHandoff()
  expect(flow.takeRegistrationSuccess()).toBeNull()
  expect(sessionStorage.length).toBe(0)
})

it('should_keep_purpose_limits_separate_and_share_ip_limit', () => {
  const flow = useAuthFlowStore()
  flow.recordSend('REGISTER', 'A@example.test', 61000)
  expect(flow.sendRemaining('REGISTER', 'a@example.test', 1000)).toBe(60)
  expect(flow.sendRemaining('LOGIN', 'a@example.test', 1000)).toBe(0)
  expect(flow.sendRemaining('REGISTER', 'b@example.test', 1000)).toBe(0)
  flow.recordLimit(
    'LOGIN',
    'b@example.test',
    { scope: 'IP_RATE_LIMIT', retryAfter: 90 },
    1000,
  )
  expect(flow.sendRemaining('REGISTER', 'a@example.test', 1000)).toBe(90)
  expect(flow.sendRemaining('LOGIN', 'c@example.test', 1000)).toBe(90)
  expect(flow.sendRemaining('REGISTER', 'a@example.test', 92000)).toBe(0)
})

it.each(['EMAIL_COOLDOWN', 'EMAIL_DAILY_LIMIT'])(
  'should_retain_%s_for_original_email',
  (scope) => {
    const flow = useAuthFlowStore()
    flow.recordLimit(
      'REGISTER',
      'a@example.test',
      { scope, retryAfter: 120 },
      1000,
    )
    expect(flow.sendRemaining('REGISTER', 'b@example.test', 1000)).toBe(0)
    expect(flow.sendRemaining('REGISTER', 'a@example.test', 1000)).toBe(120)
    flow.recordSend('REGISTER', 'a@example.test', 2000)
    expect(flow.sendRemaining('REGISTER', 'a@example.test', 1000)).toBe(120)
  },
)

it('should_handle_missing_zero_and_unknown_scope_limits', () => {
  const flow = useAuthFlowStore()
  flow.recordLimit('REGISTER', 'a@example.test', { retryAfter: null }, 1000)
  flow.recordLimit('REGISTER', 'a@example.test', { retryAfter: 0 }, 1000)
  expect(flow.sendRemaining('REGISTER', 'a@example.test', 1000)).toBe(0)
  flow.recordLimit('REGISTER', 'a@example.test', { retryAfter: 2 }, 1000)
  expect(flow.sendRemaining('LOGIN', 'b@example.test', 1000)).toBe(2)
})
