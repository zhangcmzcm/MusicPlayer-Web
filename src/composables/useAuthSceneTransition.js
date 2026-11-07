import { nextTick, onScopeDispose, ref, watch } from 'vue'

export function useAuthSceneTransition({ route, leafRef }) {
  const transitioning = ref(false)
  const settledPage = ref(route.name)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let animation,
    delay,
    releaseDelay,
    generation = 0,
    source = null
  const element = () => leafRef.value?.$el || leafRef.value
  const snapshot = () => {
    const style = getComputedStyle(element())
    return {
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height,
      transform: style.transform,
      filter: style.filter,
    }
  }
  function finishAtCurrentRoute() {
    generation++
    clearTimeout(delay)
    releaseDelay?.(false)
    releaseDelay = null
    animation?.cancel()
    animation = null
    source = null
    settledPage.value = route.name
    transitioning.value = false
  }
  async function prepareNavigation(name) {
    if (!['login', 'register'].includes(name) || name === route.name)
      return true
    finishAtCurrentRoute()
    if (motion.matches) return true
    source = snapshot()
    transitioning.value = true
    return new Promise((resolve) => {
      releaseDelay = resolve
      delay = setTimeout(() => {
        releaseDelay = null
        resolve(true)
      }, 180)
    })
  }
  watch(
    () => route.name,
    async (name, previous) => {
      const current = ++generation
      if (
        motion.matches ||
        !source ||
        !['login', 'register'].includes(name) ||
        !['login', 'register'].includes(previous)
      ) {
        finishAtCurrentRoute()
        return
      }
      const start = source
      await nextTick()
      if (current !== generation) return
      const end = snapshot()
      const fromSign = previous === 'register' ? -1 : 1
      const toSign = name === 'register' ? -1 : 1
      animation = element().animate(
        [
          { ...start, offset: 0 },
          {
            left: '50%',
            top: `${Math.min(parseFloat(start.top), parseFloat(end.top)) - 55}px`,
            width: end.width,
            height: end.height,
            transform: `translateX(-50%) rotate(-8deg) skewY(-12deg) scaleX(${fromSign * 0.24})`,
            filter: 'drop-shadow(24px 30px 22px #56733224)',
            offset: 0.48,
          },
          {
            left: '50%',
            top: `${Math.min(parseFloat(start.top), parseFloat(end.top)) - 55}px`,
            width: end.width,
            height: end.height,
            transform: `translateX(-50%) rotate(-8deg) skewY(12deg) scaleX(${toSign * 0.24})`,
            filter: 'drop-shadow(-18px 24px 16px #56733230)',
            offset: 0.4801,
          },
          {
            ...end,
            transform: `translateX(-50%) rotate(1.2deg) scaleX(${toSign})`,
            offset: 0.88,
          },
          { ...end, offset: 1 },
        ],
        { duration: 2240, easing: 'cubic-bezier(.36,0,.2,1)' },
      )
      await Promise.allSettled([animation.finished])
      if (current === generation) finishAtCurrentRoute()
    },
    { flush: 'post' },
  )
  function onMotionChanged() {
    if (motion.matches) {
      clearTimeout(delay)
      const resume = releaseDelay
      releaseDelay = null
      resume?.(true)
    }
    finishAtCurrentRoute()
  }
  motion.addEventListener('change', onMotionChanged)
  onScopeDispose(() => {
    finishAtCurrentRoute()
    motion.removeEventListener('change', onMotionChanged)
  })
  return { transitioning, settledPage, prepareNavigation, finishAtCurrentRoute }
}
