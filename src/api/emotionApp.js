import http from './http';

// 同步对话
export function chatSync(message, chatId) {
  return http.get('/ai/emotion_app/chat/sync', {
    params: { message, chatId }
  });
}

// 获取文本流式聊天 SSE 地址
export function getChatStreamUrl(message, chatId) {
  const params = new URLSearchParams({
    message,
    chatId
  });

  const base = http.defaults.baseURL || '';
  return `${base}/ai/emotion_app/chat/stream?${params.toString()}`;
}

// 获取文本加 TTS 的 SSE 地址
export function getChatStreamWithTtsUrl(message, chatId) {
  const params = new URLSearchParams({
    message,
    chatId
  });

  const base = http.defaults.baseURL || '';
  return `${base}/ai/emotion_app/chat/stream/tts?${params.toString()}`;
}

// 上传音频做 ASR
export function recognizeSpeech(file) {
  const formData = new FormData();
  formData.append('file', file);
  return http.post('/ai/asr/recognize', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
}

export function chatWithReport(message, chatId) {
  return http.get('/ai/emotion_app/chat/report', {
    params: { message, chatId }
  });
}

export function getAllConversations() {
  return http.get('/ai/redis/conversations');
}

export function getConversationById(conversationId) {
  return http.get(`/ai/redis/conversations/${encodeURIComponent(conversationId)}`);
}

export function getManusChatStreamUrl(message) {
  const params = new URLSearchParams({ message });
  const base = http.defaults.baseURL || '';
  return `${base}/ai/manus/chat?${params.toString()}`;
}

export function getRealtimeAsrWsUrl(chatId) {
  const base = http.defaults.baseURL || '';
  const httpUrl = new URL(base);
  const wsProtocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  if (chatId) {
    params.set('chatId', chatId);
  }
  const basePath = (httpUrl.pathname || '').replace(/\/$/, '');
  return `${wsProtocol}//${httpUrl.host}${basePath}/ws/asr/realtime${params.toString() ? `?${params.toString()}` : ''}`;
}
