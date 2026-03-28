<template>
  <div class="page auth-page">
    <section class="auth-card">
      <div class="auth-header">
        <h1>登录 / 注册</h1>
        <p>先建立用户身份，再进入情绪记录和成长支持模块。</p>
      </div>

      <div class="auth-tabs">
        <button
          :class="['auth-tab', { active: mode === 'login' }]"
          @click="mode = 'login'"
        >
          登录
        </button>
        <button
          :class="['auth-tab', { active: mode === 'register' }]"
          @click="mode = 'register'"
        >
          注册
        </button>
      </div>

      <div class="auth-form">
        <label class="field">
          <span>用户名</span>
          <input v-model.trim="form.username" type="text" placeholder="至少 3 位" />
        </label>

        <label v-if="mode === 'register'" class="field">
          <span>昵称</span>
          <input v-model.trim="form.nickname" type="text" placeholder="可选" />
        </label>

        <label v-if="mode === 'register'" class="field">
          <span>邮箱</span>
          <input v-model.trim="form.email" type="email" placeholder="可选" />
        </label>

        <label class="field">
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="至少 6 位" />
        </label>

        <button class="btn btn-primary auth-submit" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中...' : mode === 'login' ? '登录' : '注册并登录' }}
        </button>
      </div>

      <div v-if="message" class="auth-message auth-success">{{ message }}</div>
      <div v-if="errorMessage" class="auth-message auth-error">{{ errorMessage }}</div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { login, register } from '../api/auth';
import { saveAuth } from '../utils/auth';

const router = useRouter();
const mode = ref('login');
const submitting = ref(false);
const message = ref('');
const errorMessage = ref('');

const form = reactive({
  username: '',
  password: '',
  nickname: '',
  email: ''
});

async function submit() {
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';

  try {
    const action = mode.value === 'login' ? login : register;
    const payload = mode.value === 'login'
      ? {
          username: form.username,
          password: form.password
        }
      : {
          username: form.username,
          password: form.password,
          nickname: form.nickname,
          email: form.email
        };

    const res = await action(payload);
    saveAuth(res.data);
    message.value = mode.value === 'login' ? '登录成功，正在进入系统。' : '注册成功，已自动登录。';
    setTimeout(() => {
      router.push('/growth');
    }, 400);
  } catch (error) {
    errorMessage.value = error?.response?.data?.message || '认证失败，请稍后重试。';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 140px);
}

.auth-card {
  width: 100%;
  max-width: 440px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.1);
}

.auth-header h1 {
  margin: 0 0 8px;
}

.auth-header p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 20px 0 16px;
}

.auth-tab {
  border: 1px solid #dbe2ea;
  background: #fff;
  border-radius: 12px;
  padding: 10px 0;
  cursor: pointer;
  font: inherit;
}

.auth-tab.active {
  background: #0f766e;
  color: #fff;
  border-color: #0f766e;
}

.auth-form {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

.field span {
  font-weight: 600;
}

.field input {
  width: 100%;
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  padding: 11px 12px;
  font: inherit;
}

.field input:focus {
  outline: none;
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.auth-submit {
  margin-top: 6px;
}

.auth-message {
  margin-top: 14px;
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
}

.auth-success {
  background: #ecfdf5;
  color: #047857;
}

.auth-error {
  background: #fef2f2;
  color: #b91c1c;
}
</style>
