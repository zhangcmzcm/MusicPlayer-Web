<template>
  <main class="not-found" data-testid="not-found">
    <h1>这里还没有旋律</h1>
    <p>你访问的页面不存在。</p>
    <RouterLink to="/login" data-testid="back-to-login">前往登录</RouterLink>
  </main>
</template>
<style scoped>
.not-found {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--green-light);
  text-align: center;
}
h1 {
  font-family: var(--font-serif);
  font-weight: 400;
}
p {
  color: var(--ink-muted);
}
a {
  color: var(--green-action);
  padding: 12px;
}
a:focus-visible {
  outline: 2px solid var(--green-action);
}
</style>
