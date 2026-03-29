import http from './http';
import { appendTokenParams } from '../utils/auth';

export function chatSync(message, chatId) {
  return http.get('/ai/emotion_app/chat/sync', {
    params: { message, chatId }
  });
}

export function getChatStreamUrl(message, chatId) {
  const params = appendTokenParams(new URLSearchParams({
    message,
    chatId
  }));

  const base = http.defaults.baseURL || '';
  return `${base}/ai/emotion_app/chat/stream?${params.toString()}`;
}

export function getChatStreamWithTtsUrl(message, chatId) {
  const params = appendTokenParams(new URLSearchParams({
    message,
    chatId
  }));

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

export function chatWithReport(message, chatId) {
  return http.get('/ai/emotion_app/chat/report', {
    params: { message, chatId }
  });
}

export function createEmotionDiary(data) {
  return http.post('/ai/emotion-growth/diaries', data);
}

export function getEmotionDiary(diaryId) {
  return http.get(`/ai/emotion-growth/diaries/${encodeURIComponent(diaryId)}`);
}

export function listEmotionDiaries(params) {
  return http.get('/ai/emotion-growth/diaries', { params });
}

export function updateEmotionDiary(diaryId, data) {
  return http.put(`/ai/emotion-growth/diaries/${encodeURIComponent(diaryId)}`, data);
}

export function deleteEmotionDiary(diaryId) {
  return http.delete(`/ai/emotion-growth/diaries/${encodeURIComponent(diaryId)}`);
}

export function recognizeEmotion(data) {
  return http.post('/ai/emotion-growth/recognize', data);
}

export function getEmotionTrends(params) {
  return http.get('/ai/emotion-growth/trends', { params });
}

export function generateGrowthPlan(data) {
  return http.post('/ai/emotion-growth/plans/generate', data);
}

export function getLatestGrowthPlan() {
  return http.get('/ai/emotion-growth/plans/latest');
}

export function rebuildGrowthProfile(data) {
  return http.post('/ai/emotion-growth/profile/rebuild', data);
}

export function getLatestGrowthProfile() {
  return http.get('/ai/emotion-growth/profile');
}

export function getAllConversations() {
  return http.get('/ai/redis/conversations');
}

export function getConversationById(conversationId) {
  return http.get(`/ai/redis/conversations/${encodeURIComponent(conversationId)}`);
}

export function getManusChatStreamUrl(message) {
  const params = appendTokenParams(new URLSearchParams({ message }));
  const base = http.defaults.baseURL || '';
  return `${base}/ai/manus/chat?${params.toString()}`;
}

export function getRealtimeAsrWsUrl(chatId) {
  const base = http.defaults.baseURL || '';
  const httpUrl = new URL(base);
  const wsProtocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = appendTokenParams(new URLSearchParams());
  if (chatId) {
    params.set('chatId', chatId);
  }
  const basePath = (httpUrl.pathname || '').replace(/\/$/, '');
  return `${wsProtocol}//${httpUrl.host}${basePath}/ws/asr/realtime${params.toString() ? `?${params.toString()}` : ''}`;
}
