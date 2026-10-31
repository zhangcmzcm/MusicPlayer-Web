<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import LeafArtwork from './LeafArtwork.vue'

defineProps({
  pending: Boolean,
  selectedRole: { type: String, default: null },
  retryRemaining: { type: Number, default: 0 },
})
const emit = defineEmits(['role-selected', 'restart'])
const ready = ref(false)
let timer
let media
function onMotionChange(event) {
  if (event.matches) {
    clearTimeout(timer)
    ready.value = true
  }
}
onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', onMotionChange)
  if (media.matches) ready.value = true
  else
    timer = setTimeout(() => {
      ready.value = true
    }, 1000)
})
onUnmounted(() => {
  clearTimeout(timer)
  media?.removeEventListener('change', onMotionChange)
})
const roles = [
  {
    value: 'USER',
    title: '用户身份',
    note: '以用户身份进入音乐世界',
    tint: '#ffffff',
  },
  {
    value: 'ADMIN',
    title: '管理员身份',
    note: '以管理员身份进入管理工作',
    tint: '#edf5da',
  },
]
</script>

<template>
  <section
    class="role-selection"
    data-testid="role-selection"
    :aria-busy="!ready || pending"
  >
    <div class="role-leaves">
      <button
        v-for="role in roles"
        :key="role.value"
        class="role-leaf"
        type="button"
        :class="{ 'admin-leaf': role.value === 'ADMIN' }"
        :disabled="!ready || pending || retryRemaining > 0"
        :data-testid="`role-${role.value}`"
        @click="emit('role-selected', role.value)"
      >
        <LeafArtwork :tint="role.tint" />
        <span class="role-copy"
          ><span class="role-eyebrow">{{
            role.value === 'USER' ? 'LISTEN & BREATHE' : 'CARE & CREATE'
          }}</span
          ><strong>{{ role.title }}</strong
          ><span class="role-note">{{ role.note }}</span
          ><span class="role-action">{{
            pending && selectedRole === role.value
              ? '正在登录…'
              : '以此身份继续 →'
          }}</span></span
        >
      </button>
    </div>
    <p v-if="retryRemaining" class="role-note" role="status">
      {{ retryRemaining }} 秒后可重新选择
    </p>
    <button
      type="button"
      class="text-button"
      :disabled="pending"
      data-testid="restart-login"
      @click="emit('restart')"
    >
      返回重新登录
    </button>
  </section>
</template>

<style scoped>
.role-selection {
  text-align: center;
}
.role-leaves {
  display: flex;
  justify-content: center;
  gap: 0;
}
.role-leaf {
  position: relative;
  border: 0;
  padding: 0;
  background: none;
  width: 430px;
  height: 480px;
  color: var(--ink);
  cursor: pointer;
  flex: 0 1 430px;
  animation: arrive 950ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  filter: drop-shadow(9px 15px 12px #56733229);
  transition: filter 150ms;
}
.role-leaf svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.admin-leaf {
  animation-delay: 100ms;
}
.role-copy {
  position: absolute;
  top: 39%;
  left: 22%;
  right: 17%;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 18px;
}
.role-eyebrow {
  font-size: 8px;
  letter-spacing: 2px;
  color: var(--green-action);
}
.role-copy strong {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 28px;
  letter-spacing: 3px;
}
.role-note {
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.8;
}
.role-action {
  font-size: 12px;
  color: var(--green-action);
  margin-top: 7px;
}
.role-leaf:hover:not(:disabled) {
  filter: drop-shadow(10px 17px 16px #56733245);
}
.role-leaf:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: -45px;
  border-radius: 45%;
}
.role-leaf:disabled {
  cursor: default;
}
.role-leaf:disabled .role-action {
  opacity: 0.7;
}
.text-button {
  border: 0;
  background: none;
  padding: 10px;
  font: inherit;
  font-size: 12px;
  color: var(--ink-muted);
  cursor: pointer;
}
.text-button:hover:not(:disabled) {
  text-decoration: underline;
}
.text-button:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 3px;
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: translate(-90px, 35px) rotate(-12deg);
  }
  to {
    opacity: 1;
    transform: translate(0, 0) rotate(0);
  }
}
@media (max-width: 600px) {
  .role-leaves {
    flex-direction: column;
    align-items: center;
    gap: 0;
  }
  .role-leaf {
    flex: auto;
    width: min(380px, calc(100vw + 20px));
    height: 395px;
    margin: -12px 0;
  }
  .role-copy {
    gap: 12px;
  }
  .role-copy strong {
    font-size: 25px;
  }
  .role-note {
    font-size: 11px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .role-leaf {
    animation: none;
    transition: none;
  }
}
</style>
