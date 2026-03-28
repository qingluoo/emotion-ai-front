<template>
  <div class="app-root">
    <header class="app-header">
      <div class="app-logo">Emotion AI</div>
      <nav class="app-nav">
        <RouterLink to="/" class="nav-link">主页</RouterLink>
        <RouterLink to="/chat" class="nav-link">情景交流</RouterLink>
        <RouterLink to="/growth" class="nav-link">个人成长</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
</script>

