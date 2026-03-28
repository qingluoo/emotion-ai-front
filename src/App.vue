<template>
  <div class="app-root">
    <header class="app-header">
      <div class="app-logo">Emotion AI</div>
      <nav class="app-nav">
        <RouterLink to="/" class="nav-link">首页</RouterLink>
        <RouterLink to="/chat" class="nav-link">情境交流</RouterLink>
        <RouterLink to="/growth" class="nav-link">个人成长</RouterLink>
        <RouterLink v-if="!authState.user" to="/auth" class="nav-link">登录</RouterLink>
        <button v-else class="nav-user" @click="handleLogout">
          {{ authState.user.nickname || authState.user.username }} 退出
        </button>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { logout } from './api/auth';
import { authState, clearAuth } from './utils/auth';

const router = useRouter();

async function handleLogout() {
  try {
    await logout();
  } catch (error) {
    // ignore network errors and clear local session anyway
  } finally {
    clearAuth();
    router.push('/auth');
  }
}
</script>
