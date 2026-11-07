<script setup>
import { provide, reactive, onUnmounted, ref, watch, nextTick } from 'vue'
import {
  RouterView,
  useRoute,
  useRouter,
  onBeforeRouteUpdate,
  isNavigationFailure,
  NavigationFailureType,
} from 'vue-router'
import { authSceneKey } from '../../composables/authScene.js'
import LeafArtwork from './LeafArtwork.vue'
import { useAuthSceneTransition } from '../../composables/useAuthSceneTransition.js'
import { useAuthFlowStore } from '../../stores/authFlow.js'

const route = useRoute()
const router = useRouter()
const shared = useAuthFlowStore()
const titleRef = ref()
const leafRef = ref()
const { transitioning, prepareNavigation, finishAtCurrentRoute } =
  useAuthSceneTransition({ route, leafRef })
onBeforeRouteUpdate((to) => prepareNavigation(to.name))
const removeAfterHook = router.afterEach((to, from, failure) => {
  if (isNavigationFailure(failure, NavigationFailureType.aborted))
    finishAtCurrentRoute()
})
const removeErrorHook = router.onError(finishAtCurrentRoute)
const scene = reactive({
  step: 'login',
  heading: null,
  focusHeading: () => titleRef.value?.focus(),
})
const isRegistration = ref(route.name === 'register')
watch(
  () => route.name,
  async (name) => {
    isRegistration.value = name === 'register'
    await nextTick()
    if (!transitioning.value) scene.focusHeading()
  },
)
watch(transitioning, async (value) => {
  if (!value) {
    await nextTick()
    scene.focusHeading()
  }
})
provide(authSceneKey, scene)
onUnmounted(() => {
  removeAfterHook()
  removeErrorHook()
  shared.clearHandoff()
  scene.step = 'login'
})
</script>

<template>
  <div
    class="auth-scene"
    :class="{
      'choosing-role': scene.step === 'role-selection',
      'registration-scene': isRegistration,
      'scene-transitioning': transitioning,
    }"
    data-testid="auth-scene"
  >
    <header class="masthead">
      <span class="brand"
        ><svg viewBox="0 0 32 38" aria-hidden="true">
          <path
            d="M9 30C0 17 13 7 27 4C26 18 25 26 9 30Z"
            fill="#62894b"
            fill-opacity=".2"
          />
          <path
            d="M7 34Q12 19 26 5M11 23Q4 21 4 16M16 16L24 15"
            fill="none"
            stroke="#587847"
            stroke-width="1.4"
          /></svg
        >风与叶</span
      >
      <span class="brand-note">BREEZE &amp; LEAF</span>
    </header>
    <svg
      class="wind"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="#f9ffe9">
        <path
          d="M-180 730C70 780 185 383 476 480S844 503 1065 263S1391 224 1590 44"
          stroke-width="22"
          opacity=".11"
        />
        <path
          d="M-180 713C70 763 185 366 476 463S844 486 1065 246S1391 207 1590 27"
          stroke-width="1.4"
          opacity=".35"
        />
      </g>
      <g class="far" stroke="#f7ffe9">
        <path
          d="M-160 200C106 208 71 454 365 362S657 217 918 402S1254 616 1600 344"
          opacity=".25"
        />
        <path
          d="M-160 213C106 221 71 467 365 375S657 230 918 415S1254 629 1600 357"
          stroke-width="9"
          opacity=".08"
        />
      </g>
    </svg>
    <div class="small-leaves" aria-hidden="true">
      <LeafArtwork :tint="isRegistration ? '#dce8c7' : '#ffffff'" /><LeafArtwork
        :tint="isRegistration ? '#dce8c7' : '#ffffff'"
      /><LeafArtwork :tint="isRegistration ? '#dce8c7' : '#ffffff'" />
    </div>
    <main class="scene-main">
      <LeafArtwork ref="leafRef" class="main-leaf" data-testid="main-leaf" />
      <div class="scene-content" :inert="transitioning">
        <div
          v-if="scene.heading"
          class="heading"
          :class="{ 'role-heading': scene.step === 'role-selection' }"
          data-testid="auth-heading"
        >
          <div class="eyebrow">{{ scene.heading.eyebrow }}</div>
          <h1 ref="titleRef" tabindex="-1" :data-testid="scene.heading.testId">
            {{ scene.heading.title }}
          </h1>
          <p class="intro">{{ scene.heading.intro }}</p>
        </div>
        <RouterView />
      </div>
    </main>
    <aside class="poem" data-testid="scene-poem" aria-hidden="true">
      <span>一叶清新</span><span>一曲自在</span>
    </aside>
  </div>
</template>

<style scoped>
.auth-scene {
  position: relative;
  isolation: isolate;
  min-height: 100svh;
  overflow: clip;
  background:
    radial-gradient(ellipse at 12% 2%, var(--green-light), transparent 61%),
    radial-gradient(ellipse at 88% 90%, #bed68e, transparent 65%),
    linear-gradient(125deg, var(--green-base), var(--green-deep));
}
.masthead {
  position: absolute;
  inset: 30px 44px auto;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  letter-spacing: 5px;
}
.brand svg {
  width: 30px;
  height: 36px;
}
.brand-note {
  font-size: 10px;
  letter-spacing: 3px;
  color: var(--ink-muted);
}
.scene-main {
  position: relative;
  min-height: 100svh;
  display: flow-root;
}
.main-leaf {
  position: absolute;
  top: -120px;
  left: 38%;
  transform: translateX(-50%);
  width: 1188px;
  height: max(1080px, calc(100svh + 120px));
  filter: drop-shadow(16px 23px 19px #56733236);
  transition:
    opacity 400ms,
    translate 700ms;
  pointer-events: none;
}
.scene-content {
  position: relative;
  width: 340px;
  margin-left: calc(38% - 170px);
  padding: max(160px, calc(160px + (100svh - 768px) * 0.2)) 0 4px;
}
.scene-content,
.poem {
  transition: opacity 180ms ease;
}
.scene-transitioning .scene-content,
.scene-transitioning .poem {
  opacity: 0;
  pointer-events: none;
}
.scene-transitioning .wind g {
  animation-duration: 2s;
}
.registration-scene .main-leaf {
  left: 62%;
  top: -400px;
  height: max(1400px, calc(1400px + (100svh - 768px) * 0.4));
  transform: translateX(-50%) scaleX(-1);
}
.registration-scene .scene-content {
  margin-left: calc(62% - 170px);
  padding-top: max(24px, calc(24px + (100svh - 768px) * 0.2));
}
.registration-scene .poem {
  left: min(24%, calc(62% - 600px));
}
.heading {
  padding-left: 48px;
}
.registration-scene .heading {
  padding-left: 12px;
}
.registration-scene h1 {
  font-size: 32px;
  letter-spacing: 1px;
  line-height: 1.35;
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
  margin: 0;
}
h1:focus {
  outline: none;
}
.intro {
  font-size: 12px;
  letter-spacing: 1px;
  line-height: 1.8;
  color: var(--ink-muted);
  margin: 0;
}
.role-heading {
  padding-left: 0;
  text-align: center;
}
.role-heading .eyebrow {
  justify-content: center;
}
.poem {
  position: absolute;
  left: max(76%, calc(38% + 600px));
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: row-reverse;
  gap: 24px;
  color: #526e40;
  transition: opacity 250ms;
}
.poem span {
  writing-mode: vertical-rl;
  font-family: var(--font-serif);
  font-size: 25px;
  letter-spacing: 11px;
  line-height: 1.8;
}
.wind {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
}
.wind g {
  animation: breeze 18s ease-in-out infinite alternate;
}
.wind .far {
  animation-duration: 22s;
  animation-direction: alternate-reverse;
}
.small-leaves {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: -1;
}
.small-leaves svg {
  position: absolute;
  width: 88px;
  height: 120px;
  opacity: 0.38;
  animation: float 16s ease-in-out infinite alternate;
}
.small-leaves svg:nth-child(1) {
  left: 5%;
  top: 63%;
  rotate: -55deg;
}
.small-leaves svg:nth-child(2) {
  right: 9%;
  top: 17%;
  rotate: 25deg;
  animation-delay: -6s;
}
.small-leaves svg:nth-child(3) {
  right: 14%;
  bottom: 7%;
  width: 60px;
  rotate: 95deg;
  animation-delay: -10s;
}
.choosing-role .main-leaf {
  opacity: 0;
  translate: 35px -55px;
}
.choosing-role .poem {
  opacity: 0;
  visibility: hidden;
}
.choosing-role .scene-content {
  width: min(100%, 1000px);
  margin: auto;
  padding: 155px 28px 90px;
}
.choosing-role .wind g {
  animation-duration: 3s;
}
@keyframes breeze {
  from {
    translate: -15px 8px;
    opacity: 0.55;
  }
  to {
    translate: 20px -12px;
    opacity: 0.95;
  }
}
@keyframes float {
  to {
    translate: 10px -14px;
  }
}
@media (max-width: 1050px) {
  .main-leaf,
  .registration-scene .main-leaf {
    left: 50%;
  }
  .scene-content,
  .registration-scene .scene-content {
    margin: auto;
  }
  .poem {
    display: none;
  }
}
@media (max-width: 600px) {
  .masthead {
    inset: 22px 22px auto;
  }
  .brand {
    font-size: 16px;
    gap: 7px;
    letter-spacing: 3px;
  }
  .brand svg {
    width: 24px;
    height: 28px;
  }
  .brand-note {
    display: none;
  }
  .main-leaf {
    width: 950px;
    top: -300px;
    height: 1180px;
  }
  .scene-main {
    min-height: 100svh;
  }
  .scene-content {
    width: min(300px, calc(100% - 64px));
    padding: 78px 0 20px;
  }
  .registration-scene .scene-content {
    padding-top: 64px;
    padding-bottom: 12px;
  }
  .registration-scene .main-leaf {
    top: -350px;
    height: 1400px;
  }
  .heading {
    padding-left: 0;
    position: absolute;
    top: 24px;
    right: 0;
  }
  h1 {
    font-size: 18px;
    letter-spacing: 0;
    line-height: 28px;
  }
  .registration-scene h1 {
    font-size: 18px;
    letter-spacing: 0;
    line-height: 28px;
  }
  .registration-scene .heading {
    padding-left: 0;
  }
  .registration-scene .small-leaves {
    z-index: 1;
  }
  .registration-scene .small-leaves svg:nth-child(1) {
    width: 88px;
    height: 120px;
    left: -55px;
    top: 85px;
  }
  .registration-scene .small-leaves svg:nth-child(2) {
    width: 88px;
    height: 120px;
    right: -55px;
    top: 15%;
  }
  .registration-scene .small-leaves svg:nth-child(3) {
    width: 45px;
    height: 60px;
    right: -20px;
    bottom: 0;
  }
  .eyebrow,
  .intro {
    display: none;
  }
  .role-heading {
    position: static;
    margin-bottom: 8px;
  }
  .choosing-role .scene-content {
    padding: 125px 20px 70px;
  }
  .small-leaves svg:nth-child(2) {
    right: -25px;
  }
  .small-leaves svg:nth-child(1) {
    left: -25px;
    top: 72px;
  }
  .small-leaves svg:nth-child(3) {
    right: -6px;
    bottom: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wind g,
  .small-leaves svg {
    animation: none;
  }
  .main-leaf,
  .poem {
    transition: none;
  }
}
</style>
