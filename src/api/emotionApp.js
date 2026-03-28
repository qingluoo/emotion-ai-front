import http from './http';

// 同步对话（普通请求，不是流式）
export function chatSync(message, chatId) {
  return http.get(`/ai/emotion_app/chat/sync`, {
    params: { message, chatId }
  });
}

// 获取情绪聊天 SSE 流地址（给 EventSource 使用）
export function getChatStreamUrl(message, chatId) {
  const params = new URLSearchParams({
    message,
    chatId
  });

  // http.defaults.baseURL 形如 "http://localhost:8123/api"
  const base = http.defaults.baseURL || '';
  return `${base}/ai/emotion_app/chat/stream?${params.toString()}`;
}

// 获取情绪聊天 SSE 流地址（文本 + TTS音频事件）
export function getChatStreamWithTtsUrl(message, chatId) {
  const params = new URLSearchParams({
    message,
    chatId
  });

  const base = http.defaults.baseURL || '';
  return `${base}/ai/emotion_app/chat/stream/tts?${params.toString()}`;
}

export function recognizeSpeech(file) {
  const formData = new FormData();
  formData.append('file', file);
  return http.post('/ai/asr/recognize', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
}

// 带报告的对话（个人成长规划）
export function chatWithReport(message, chatId) {
  return http.get(`/ai/emotion_app/chat/report`, {
    params: { message, chatId }
  });
}

// 获取所有会话概要列表（基于Redis）
export function getAllConversations() {
  return http.get(`/ai/redis/conversations`);
}

// 根据 conversationId 获取单个会话详情（基于Redis）
export function getConversationById(conversationId) {
  return http.get(`/ai/redis/conversations/${encodeURIComponent(conversationId)}`);
}

// 获取 Manus 智能体聊天 SSE 流地址（给 EventSource 使用）
export function getManusChatStreamUrl(message) {
  const params = new URLSearchParams({ message });
  const base = http.defaults.baseURL || '';
  return `${base}/ai/manus/chat?${params.toString()}`;
}

