<script setup>
import { onScopeDispose, ref, watch } from 'vue'
import { getTrackCover } from '../../api/tracks.js'
import { useAuthStore } from '../../stores/auth.js'

const props = defineProps({
  trackId: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  alt: { type: String, default: '' },
})
const auth = useAuthStore()
const source = ref('')
let requestNumber = 0
let controller = null

function clearSource() {
  if (source.value) URL.revokeObjectURL(source.value)
  source.value = ''
}

async function load() {
  const current = ++requestNumber
  controller?.abort()
  clearSource()
  const session = auth.session
  if (!props.enabled || !session) return
  const revision = auth.getSessionRevision()
  const request = new AbortController()
  controller = request
  const isCurrent = () =>
    current === requestNumber &&
    !request.signal.aborted &&
    auth.session === session &&
    auth.getSessionRevision() === revision
  try {
    const blob = await getTrackCover(props.trackId, { signal: request.signal })
    if (isCurrent()) source.value = URL.createObjectURL(blob)
  } catch {
    if (isCurrent()) clearSource()
  }
}

function imageFailed(event) {
  if (event.target.getAttribute('src') === source.value) clearSource()
}

watch([() => props.trackId, () => props.enabled, () => auth.session], load, {
  immediate: true,
})
onScopeDispose(() => {
  requestNumber++
  controller?.abort()
  clearSource()
})
</script>

<template>
  <span
    class="track-cover"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : true"
  >
    <img
      v-if="source"
      :key="source"
      :src="source"
      alt=""
      @error="imageFailed"
    />
    <span
      v-else
      class="cover-placeholder"
      data-testid="track-cover-placeholder"
      aria-hidden="true"
    ></span>
  </span>
</template>

<style scoped>
.track-cover {
  display: inline-grid;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: #eaf1df;
  overflow: hidden;
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-placeholder {
  position: relative;
  width: 100%;
  height: 100%;
}
.cover-placeholder::before {
  content: '';
  position: absolute;
  width: 19px;
  height: 28px;
  left: 11px;
  top: 6px;
  border: 1px solid #8da779;
  border-radius: 100% 0 100% 0;
  transform: rotate(16deg);
  background: #d9e7c6;
}
</style>
