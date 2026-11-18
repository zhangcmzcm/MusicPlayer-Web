<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { managementReturnTarget } from '../../utils/trackList.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const mobileNavOpen = ref(false)
const navToggle = ref()
const links = computed(() =>
  router
    .getRoutes()
    .filter(
      (record) =>
        record.meta.navigation &&
        (!record.meta.roles ||
          record.meta.roles.includes(auth.session?.user.role)),
    )
    .sort(
      (left, right) => left.meta.navigation.order - right.meta.navigation.order,
    ),
)
const topLinks = computed(() =>
  links.value.filter((record) => record.meta.navigation.section === 'top'),
)
const sideLinks = computed(() =>
  links.value.filter((record) => record.meta.navigation.section === 'sidebar'),
)
const username = computed(() => auth.session?.user.username || '用户')
const activeName = computed(() => route.meta.activeNavigation || route.name)
function navigationTarget(link) {
  return link.name === 'track-management' && route.name === 'track-import'
    ? managementReturnTarget(route.query)
    : { name: link.name }
}
watch(
  () => route.fullPath,
  () => {
    mobileNavOpen.value = false
  },
)
function restoreToggleFocus() {
  navToggle.value?.$el.focus()
}
</script>

<template>
  <div class="business-layout">
    <header class="business-header">
      <el-button
        v-if="sideLinks.length"
        ref="navToggle"
        text
        class="nav-toggle"
        aria-label="打开侧边导航"
        :aria-expanded="mobileNavOpen"
        @click="mobileNavOpen = true"
        ><span aria-hidden="true">≡</span></el-button
      >
      <RouterLink
        :to="{ name: 'library' }"
        class="brand"
        aria-label="风与叶主页"
        ><span class="brand-leaf" aria-hidden="true"></span
        ><span>风与叶</span></RouterLink
      >
      <nav class="top-navigation" aria-label="顶部导航">
        <RouterLink
          v-for="link in topLinks"
          :key="link.name"
          :to="{ name: link.name }"
          >{{ link.meta.navigation.label }}</RouterLink
        >
      </nav>
      <div id="business-search" class="search-host"></div>
      <span
        class="session-user"
        :aria-label="`当前用户 ${username}`"
        :title="username"
        ><span class="user-mark" aria-hidden="true">{{
          username.slice(0, 1)
        }}</span
        ><span class="username">{{ username }}</span></span
      >
    </header>
    <div class="business-body">
      <aside v-if="sideLinks.length" class="business-sidebar">
        <nav aria-label="侧边导航">
          <RouterLink
            v-for="link in sideLinks"
            :key="link.name"
            :to="navigationTarget(link)"
            :class="{ 'navigation-active': activeName === link.name }"
            :aria-current="activeName === link.name ? 'page' : undefined"
            >{{ link.meta.navigation.label }}</RouterLink
          >
        </nav>
      </aside>
      <main class="business-main"><RouterView /></main>
    </div>
    <el-drawer
      v-if="sideLinks.length"
      v-model="mobileNavOpen"
      direction="ltr"
      size="240px"
      :show-close="false"
      @closed="restoreToggleFocus"
    >
      <template #header
        ><h2 class="drawer-title">导航</h2>
        <el-button text aria-label="关闭侧边导航" @click="mobileNavOpen = false"
          >关闭</el-button
        ></template
      >
      <nav class="drawer-navigation" aria-label="手机侧边导航">
        <RouterLink
          v-for="link in sideLinks"
          :key="link.name"
          :to="navigationTarget(link)"
          :class="{ 'navigation-active': activeName === link.name }"
          :aria-current="activeName === link.name ? 'page' : undefined"
          >{{ link.meta.navigation.label }}</RouterLink
        >
      </nav>
    </el-drawer>
  </div>
</template>

<style scoped>
.business-layout {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #f4f7f0;
}
.business-header {
  height: 68px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 30px;
  padding: 0 30px;
  background: white;
  border-bottom: 1px solid var(--line);
  position: relative;
  z-index: 10;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
  font-family: var(--font-serif);
  font-size: 23px;
  letter-spacing: 3px;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
}
.brand-leaf {
  width: 15px;
  height: 23px;
  border: 1px solid #62894b;
  border-radius: 100% 0 100% 0;
  transform: rotate(19deg);
  background: #e8efdd;
}
.top-navigation {
  display: flex;
  align-self: stretch;
  align-items: stretch;
  gap: 20px;
}
.top-navigation a {
  display: flex;
  align-items: center;
  position: relative;
  padding: 0 6px;
  text-decoration: none;
  color: var(--ink);
  font-size: 14px;
  white-space: nowrap;
}
.top-navigation .router-link-exact-active::after {
  content: '';
  position: absolute;
  left: calc(50% - 12px);
  bottom: 0;
  width: 24px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--green-action);
}
.search-host {
  width: min(440px, 45%);
  margin-right: auto;
  min-width: 0;
}
.session-user {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 12px;
}
.user-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #e6efcb;
  flex-shrink: 0;
}
.username {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.business-body {
  min-height: 0;
  display: flex;
  flex: 1;
}
.business-sidebar {
  width: 184px;
  flex-shrink: 0;
  background: #eaf1df;
  border-right: 1px solid var(--line);
  padding: 26px 16px;
  overflow-y: auto;
}
.business-sidebar nav,
.drawer-navigation {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.business-sidebar a,
.drawer-navigation a {
  display: block;
  color: var(--ink);
  padding: 13px 15px;
  text-decoration: none;
  border-radius: 6px;
  font-size: 13px;
}
.business-sidebar a:hover,
.drawer-navigation a:hover,
.business-sidebar .navigation-active,
.drawer-navigation .navigation-active {
  background: #dae7c9;
}
.business-main {
  background: white;
  min-width: 0;
  flex: 1;
  overflow-y: auto;
}
.nav-toggle {
  display: none;
}
.drawer-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--ink);
}
a:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 4px;
  border-radius: 4px;
}
@media (max-width: 720px) {
  .business-header {
    height: 60px;
    padding: 0 14px;
    gap: 13px;
  }
  .business-header:has(.search-container.is-open) {
    margin-bottom: 64px;
  }
  .brand {
    min-width: 0;
    font-size: 20px;
    letter-spacing: 2px;
    gap: 7px;
  }
  .brand-leaf {
    width: 11px;
    height: 17px;
  }
  .top-navigation {
    gap: 10px;
  }
  .top-navigation a {
    font-size: 13px;
    padding: 0 2px;
  }
  .search-host {
    width: 34px;
    margin-left: auto;
    margin-right: 0;
  }
  .username {
    display: none;
  }
  .user-mark {
    width: 28px;
    height: 28px;
  }
  .session-user {
    gap: 0;
  }
  .business-sidebar {
    display: none;
  }
  .nav-toggle {
    display: inline-flex;
    width: 26px;
    margin: 0;
    padding: 5px;
    font-size: 23px;
  }
}
</style>
