<template>
  <div class="page page-home">
    <section class="hero">
      <h1>情绪陪伴 · Emotion AI</h1>
      <p class="subtitle">在这里，你可以与 AI 倾诉心情，记录情绪，并制定个人成长规划。</p>
    </section>

    <section class="cards">
      <div class="feature-card" @click="goChat">
        <h2>情景交流</h2>
        <p>以聊天室的方式与 AI 实时对话，释放当下情绪。</p>
        <span class="tag">实时 SSE 对话</span>
      </div>

      <div class="feature-card" @click="goGrowth">
        <h2>个人成长</h2>
        <p>记录每日情绪，生成基础成长规划，陪你一点点进步。</p>
        <span class="tag">情绪日记 & 规划</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const goChat = () => {
  router.push('/chat');
};

const goGrowth = () => {
  router.push('/growth');
};
</script>

