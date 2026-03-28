<template>
  <div class="page page-chat">
    <aside class="chat-sidebar">
      <div class="sidebar-header">
        <h2>会话列表</h2>
        <button class="btn btn-primary btn-small" @click="createNewChat">
          新建会话
        </button>
      </div>
      <ul class="chat-list">
        <li
          v-for="session in sessions"
          :key="session.id"
          :class="['chat-list-item', { active: session.id === currentChatId }]"
          @click="switchChat(session.id)"
        >
          <div class="chat-title">会话 {{ session.index }}</div>
          <div class="chat-subtitle">
            {{ session.lastMessage || '暂无内容' }}
          </div>
        </li>
      </ul>
    </aside>

    <section class="chat-main">
      <header class="chat-header">
        <h2>情感交流</h2>
        <div class="chat-header-right">
          <button
            class="btn btn-ghost btn-small"
            :style="voiceMode ? voiceOnStyle : null"
            @click="toggleVoiceMode"
            title="控制是否开启语音播报"
          >
            Voice {{ voiceMode ? 'ON' : 'OFF' }}
          </button>
          <button
            class="btn btn-ghost btn-small"
            :style="thinkMode ? thinkOnStyle : null"
            @click="thinkMode = !thinkMode"
            title="开启后将调用 Manus 智能体接口"
          >
            Think {{ thinkMode ? 'ON' : 'OFF' }}
          </button>
          <span class="chat-id">当前会话 ID：{{ currentChatId }}</span>
        </div>
      </header>

      <div class="voice-state-bar">
        <span :class="['state-pill', `state-${voiceState}`]">
          {{ voiceStateLabel }}
        </span>
        <span class="state-text">{{ voiceStateDescription }}</span>
      </div>

      <div v-if="uiNotice.message" :class="['chat-status', `status-${uiNotice.type}`]">
        {{ uiNotice.message }}
      </div>

      <div class="chat-window" ref="chatWindowRef">
        <div v-if="currentMessages.length === 0" class="chat-empty">
          这是一个安全的空间，你可以随时和我说说你现在的感受。
        </div>
        <div
          v-for="(msg, idx) in currentMessages"
          :key="idx"
          :class="['chat-message', msg.role === 'user' ? 'from-user' : 'from-ai']"
        >
          <div class="avatar">
            {{ msg.role === 'user' ? '我' : 'AI' }}
          </div>
          <div class="bubble">
            <div class="text">{{ msg.content }}</div>
            <div class="time">{{ msg.time }}</div>
          </div>
        </div>
      </div>

      <footer class="chat-input-area">
        <textarea
          v-model="input"
          class="chat-input"
          placeholder="告诉我，你现在的心情如何？"
          @keydown.enter.exact.prevent="handleSend"
        ></textarea>
        <div class="chat-input-actions">
          <span :class="['tip', { 'tip-recording': isListening }]">
            {{ voiceTipText }}
          </span>
          <button
            :class="['btn', 'btn-ghost', 'btn-record', { 'is-recording': isListening, 'is-recognizing': isRecognizing }]"
            :disabled="isBusyForRecord"
            @mousedown.prevent="startPressRecording"
            @mouseup.prevent="stopPressRecording"
            @mouseleave.prevent="stopPressRecording"
            @touchstart.prevent="startPressRecording"
            @touchend.prevent="stopPressRecording"
            @touchcancel.prevent="stopPressRecording"
            @click.prevent
          >
            {{ recordButtonText }}
          </button>
          <button
            class="btn btn-primary"
            :disabled="isThinking || !input.trim()"
            @click="handleSend"
          >
            {{ isThinking ? '发送中...' : '发送' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  getAllConversations,
  getChatStreamUrl,
  getChatStreamWithTtsUrl,
  getManusChatStreamUrl,
  recognizeSpeech
} from '../api/emotionApp';

const VOICE_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  RECOGNIZING: 'recognizing',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ERROR: 'error'
};

const sessions = reactive([]);
const messagesMap = reactive(new Map());
const currentChatId = ref('');
const currentMessages = ref([]);
const input = ref('');
const thinkMode = ref(false);
const voiceMode = ref(true);
const voiceState = ref(VOICE_STATES.IDLE);
const uiNotice = reactive({
  message: '',
  type: 'info'
});

const thinkOnStyle = {
  background: '#4f46e5',
  color: '#fff'
};

const voiceOnStyle = {
  background: '#0f766e',
  color: '#fff'
};

const chatWindowRef = ref(null);

let eventSource = null;
let sessionIndex = 1;
let audioQueue = [];
let isAudioPlaying = false;
let currentAudio = null;
let audioContext = null;
let currentAudioSource = null;
let mediaRecorder = null;
let mediaStream = null;
let recordingChunks = [];
let recordingTriggeredByPress = false;
let noticeTimer = null;

const BROWSER_TTS_RATE = 1.25;

const isIdle = computed(() => voiceState.value === VOICE_STATES.IDLE);
const isListening = computed(() => voiceState.value === VOICE_STATES.LISTENING);
const isRecognizing = computed(() => voiceState.value === VOICE_STATES.RECOGNIZING);
const isThinking = computed(() => voiceState.value === VOICE_STATES.THINKING);
const isSpeaking = computed(() => voiceState.value === VOICE_STATES.SPEAKING);
const isErrorState = computed(() => voiceState.value === VOICE_STATES.ERROR);
const isBusyForRecord = computed(() => isRecognizing.value || isThinking.value);

const voiceStateLabelMap = {
  [VOICE_STATES.IDLE]: '空闲',
  [VOICE_STATES.LISTENING]: '录音中',
  [VOICE_STATES.RECOGNIZING]: '识别中',
  [VOICE_STATES.THINKING]: '思考中',
  [VOICE_STATES.SPEAKING]: '播报中',
  [VOICE_STATES.ERROR]: '异常'
};

const voiceStateDescriptionMap = {
  [VOICE_STATES.IDLE]: '可以输入文本，或按住说话开始语音输入',
  [VOICE_STATES.LISTENING]: '正在采集麦克风输入，松开后会自动识别并发送',
  [VOICE_STATES.RECOGNIZING]: '语音已结束，正在进行语音识别',
  [VOICE_STATES.THINKING]: '识别完成，正在等待 AI 回复',
  [VOICE_STATES.SPEAKING]: 'AI 正在语音播报，按住说话会立即打断',
  [VOICE_STATES.ERROR]: '当前语音链路发生错误，请查看提示信息'
};

const voiceStateLabel = computed(() => voiceStateLabelMap[voiceState.value] || '空闲');
const voiceStateDescription = computed(() => voiceStateDescriptionMap[voiceState.value] || '');

const voiceTipText = computed(() => {
  if (isListening.value) return '正在录音，松开即发送';
  if (isRecognizing.value) return '正在识别语音...';
  if (isThinking.value) return '正在等待 AI 回复...';
  if (isSpeaking.value) return 'AI 正在播报，按住说话会立即打断';
  if (isErrorState.value) return '语音链路异常，请查看上方提示';
  return '按 Enter 发送，Shift + Enter 换行，支持按住说话';
});

const recordButtonText = computed(() => {
  if (isListening.value) return '松开结束';
  if (isRecognizing.value) return '识别中...';
  if (isThinking.value) return '等待中...';
  return '按住说话';
});

const setVoiceState = (nextState) => {
  voiceState.value = nextState;
};

const resetVoiceStateIfQuiet = () => {
  if (!recordingTriggeredByPress && !isAudioPlaying && audioQueue.length === 0 && !isListening.value && !isRecognizing.value) {
    setVoiceState(VOICE_STATES.IDLE);
  }
};

const formatTime = () => {
  const d = new Date();
  const pad = (n) => (n < 10 ? `0${n}` : n);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatTimeFromTimestamp = (ts) => {
  if (!ts) return formatTime();
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return formatTime();
  }
  const pad = (n) => (n < 10 ? `0${n}` : n);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const nextTickScroll = () => {
  requestAnimationFrame(() => {
    const el = chatWindowRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
};

const showNotice = (message, type = 'info', duration = 3200) => {
  uiNotice.message = message;
  uiNotice.type = type;
  if (noticeTimer) {
    clearTimeout(noticeTimer);
  }
  if (duration > 0) {
    noticeTimer = setTimeout(() => {
      uiNotice.message = '';
      noticeTimer = null;
    }, duration);
  }
};

const markErrorState = (message, duration = 4500) => {
  setVoiceState(VOICE_STATES.ERROR);
  showNotice(message, 'error', duration);
};

const saveToLocalStorage = () => {
  try {
    const data = {
      sessions,
      messagesMap: Array.from(messagesMap.entries()),
      currentChatId: currentChatId.value,
      sessionIndex,
      voiceMode: voiceMode.value
    };
    localStorage.setItem('chatData', JSON.stringify(data));
  } catch (e) {
    console.error('保存数据到 localStorage 失败', e);
  }
};

const createSession = () => {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  sessions.unshift({
    id,
    index: sessionIndex++,
    lastMessage: ''
  });
  messagesMap.set(id, []);
  currentChatId.value = id;
  saveToLocalStorage();
};

const closeStream = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
};

const stopAudioPlayback = () => {
  audioQueue = [];
  if (currentAudioSource) {
    try {
      currentAudioSource.stop(0);
    } catch (e) {
      console.warn('stop AudioBufferSourceNode failed', e);
    }
    currentAudioSource = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isAudioPlaying = false;
};

const resetActiveVoiceFlow = () => {
  closeStream();
  stopAudioPlayback();
  setVoiceState(VOICE_STATES.IDLE);
};

const createNewChat = () => {
  resetActiveVoiceFlow();
  createSession();
};

const switchChat = (id) => {
  if (id === currentChatId.value) return;
  resetActiveVoiceFlow();
  currentChatId.value = id;
  saveToLocalStorage();
};

const appendMessage = (chatId, role, content) => {
  const list = messagesMap.get(chatId) || [];
  const msg = {
    role,
    content,
    time: formatTime()
  };
  list.push(msg);
  messagesMap.set(chatId, list);

  const session = sessions.find((s) => s.id === chatId);
  if (session) {
    session.lastMessage = content.slice(0, 30);
  }

  nextTickScroll();
  saveToLocalStorage();
};

const appendAiChunk = (chatId, chunk) => {
  if (!chunk) return;
  const list = messagesMap.get(chatId) || [];
  const last = list[list.length - 1];

  if (!last || last.role !== 'ai') {
    list.push({
      role: 'ai',
      content: chunk,
      time: formatTime()
    });
  } else {
    last.content += chunk;
    last.time = formatTime();
  }

  messagesMap.set(chatId, list);
  const session = sessions.find((s) => s.id === chatId);
  if (session) {
    const current = list[list.length - 1]?.content || '';
    session.lastMessage = current.slice(0, 30);
  }

  nextTickScroll();
  saveToLocalStorage();
};

const startStream = (url, chatId, options = {}) => {
  const {
    eventNames = [],
    closeOnComplete = false,
    showEventName = false,
    handleDefaultMessage = true,
    onComplete = null
  } = options;

  eventSource = new EventSource(url);
  let aiBuffer = '';

  const upsertAiMessage = (content) => {
    const list = messagesMap.get(chatId) || [];
    const last = list[list.length - 1];

    if (!last || last.role !== 'ai' || isThinking.value) {
      const msg = {
        role: 'ai',
        content,
        time: formatTime()
      };
      if (!last || last.role !== 'ai') {
        list.push(msg);
      } else {
        last.content = content;
        last.time = formatTime();
      }
      messagesMap.set(chatId, list);
    } else {
      last.content = content;
    }

    const session = sessions.find((s) => s.id === chatId);
    if (session) {
      session.lastMessage = content.slice(0, 30);
    }

    nextTickScroll();
    saveToLocalStorage();
  };

  const appendChunk = (chunk) => {
    if (!chunk) return;
    aiBuffer += chunk;
    upsertAiMessage(aiBuffer);
  };

  eventSource.onmessage = (event) => {
    if (!handleDefaultMessage || !event.data) return;
    appendChunk(event.data);
  };

  const bindEvent = (name) => {
    eventSource.addEventListener(name, (event) => {
      const data = event?.data ?? '';
      if (!data) return;

      if (name === 'complete' && closeOnComplete) {
        appendChunk(showEventName ? `\n[${name}] ${data}` : `\n${data}`);
        closeStream();
        if (typeof onComplete === 'function') {
          onComplete();
        } else {
          resetVoiceStateIfQuiet();
        }
        return;
      }

      appendChunk(showEventName ? `\n[${name}] ${data}` : `\n${data}`);
    });
  };

  eventNames.forEach(bindEvent);

  eventSource.onerror = () => {
    showNotice('实时回复连接已中断', 'warning');
    closeStream();
    resetVoiceStateIfQuiet();
  };
};

const openEmotionStream = (message, chatId) => {
  setVoiceState(VOICE_STATES.THINKING);

  if (!voiceMode.value) {
    startStream(getChatStreamUrl(message, chatId), chatId, {
      onComplete: () => setVoiceState(VOICE_STATES.IDLE)
    });
    return;
  }

  const url = getChatStreamWithTtsUrl(message, chatId);
  startStream(url, chatId, {
    handleDefaultMessage: false,
    onComplete: () => resetVoiceStateIfQuiet()
  });

  eventSource.addEventListener('text', (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      appendAiChunk(chatId, payload?.content || '');
    } catch (e) {
      appendAiChunk(chatId, event.data);
    }
  });

  eventSource.addEventListener('audio', (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      const base64 = payload?.audioBase64;
      const mimeType = payload?.mimeType || 'audio/mpeg';
      if (!base64) return;
      setVoiceState(VOICE_STATES.SPEAKING);
      enqueueAudio(base64, mimeType, payload?.content || '');
    } catch (e) {
      console.error('解析 audio 事件失败', e);
    }
  });

  eventSource.addEventListener('done', () => {
    closeStream();
    resetVoiceStateIfQuiet();
  });

  eventSource.addEventListener('tts_error', (event) => {
    if (!event?.data) return;
    showNotice('语音合成失败，已停止本段播报', 'warning');
    console.warn('TTS 事件错误:', event.data);
    resetVoiceStateIfQuiet();
  });
};

const openManusStream = (message, chatId) => {
  setVoiceState(VOICE_STATES.THINKING);
  startStream(getManusChatStreamUrl(message), chatId, {
    eventNames: [
      'start',
      'step_start',
      'thinking_start',
      'thinking',
      'acting_start',
      'acting_complete',
      'step_complete',
      'complete'
    ],
    closeOnComplete: true,
    showEventName: true,
    onComplete: () => setVoiceState(VOICE_STATES.IDLE)
  });
};

const base64ToBlob = (base64, mimeType) => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const ensureAudioContext = async () => {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }

  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (e) {
      console.warn('AudioContext resume failed', e);
    }
  }

  return audioContext;
};

const playWithWebAudio = async (audioBase64) => {
  const ctx = await ensureAudioContext();
  if (!ctx || ctx.state !== 'running') {
    throw new Error('AudioContext is not running');
  }

  const arrayBuffer = base64ToArrayBuffer(audioBase64);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

  await new Promise((resolve) => {
    const source = ctx.createBufferSource();
    currentAudioSource = source;
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      currentAudioSource = null;
      resolve();
    };
    source.start(0);
  });
};

const playWithHtmlAudio = async (audioBase64, mimeType) => {
  const blob = base64ToBlob(audioBase64, mimeType);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;

  await new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };

    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(e);
    };

    audio.play().catch(reject);
  });
};

const pickChineseVoice = () => {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices() || [];
  return voices.find((v) => v.lang === 'zh-CN') || voices.find((v) => v.lang?.startsWith('zh')) || null;
};

const speakWithBrowserTts = async (text) => {
  const synth = window.speechSynthesis;
  if (!synth || !text?.trim()) {
    return;
  }

  await new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickChineseVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'zh-CN';
    utterance.rate = BROWSER_TTS_RATE;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    synth.speak(utterance);
  });
};

const enqueueAudio = (audioBase64, mimeType, text = '') => {
  if (!voiceMode.value) return;
  audioQueue.push({ audioBase64, mimeType, text });
  playNextAudio();
};

const playNextAudio = async () => {
  if (isAudioPlaying || audioQueue.length === 0) {
    if (audioQueue.length === 0 && isSpeaking.value) {
      setVoiceState(VOICE_STATES.IDLE);
    }
    return;
  }

  isAudioPlaying = true;
  setVoiceState(VOICE_STATES.SPEAKING);
  const { audioBase64, mimeType, text } = audioQueue.shift();

  try {
    try {
      await playWithWebAudio(audioBase64);
    } catch (webAudioErr) {
      console.warn('WebAudio play failed, fallback to HTMLAudio', webAudioErr);
      try {
        await playWithHtmlAudio(audioBase64, mimeType);
      } catch (htmlAudioErr) {
        console.warn('HTMLAudio play failed, fallback to browser TTS', htmlAudioErr);
        await speakWithBrowserTts(text);
      }
    }
  } catch (e) {
    console.error('Audio playback failed', e);
  }

  isAudioPlaying = false;
  if (audioQueue.length === 0) {
    setVoiceState(VOICE_STATES.IDLE);
  }
  playNextAudio();
};

const toggleVoiceMode = () => {
  voiceMode.value = !voiceMode.value;
  if (!voiceMode.value) {
    stopAudioPlayback();
    if (isSpeaking.value) {
      setVoiceState(VOICE_STATES.IDLE);
    }
  }
  saveToLocalStorage();
};

const resolveRecordingMimeType = () => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
};

const stopMediaStream = () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
};

const stopRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
};

const startRecording = async () => {
  if (isListening.value || isRecognizing.value || isThinking.value) {
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    markErrorState('当前浏览器不支持录音');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const mimeType = resolveRecordingMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
    recordingChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordingChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      setVoiceState(VOICE_STATES.RECOGNIZING);
      stopMediaStream();

      if (recordingChunks.length === 0) {
        setVoiceState(VOICE_STATES.IDLE);
        return;
      }

      const finalMimeType = mediaRecorder?.mimeType || mimeType || 'audio/webm';
      const extension = finalMimeType.includes('mp4') ? 'm4a' : finalMimeType.includes('ogg') ? 'ogg' : 'webm';
      const audioBlob = new Blob(recordingChunks, { type: finalMimeType });
      const audioFile = new File([audioBlob], `speech-input.${extension}`, { type: finalMimeType });
      recordingChunks = [];

      try {
        const response = await recognizeSpeech(audioFile);
        const recognizedText = response?.data?.text || '';
        if (recognizedText) {
          input.value = recognizedText;
          await autoSendRecognizedText(recognizedText);
        } else {
          showNotice('未识别到清晰语音，请重试', 'warning');
          setVoiceState(VOICE_STATES.IDLE);
        }
      } catch (e) {
        markErrorState('语音识别失败，请稍后重试');
        console.error('语音识别失败', e);
      } finally {
        mediaRecorder = null;
      }
    };

    mediaRecorder.start();
    setVoiceState(VOICE_STATES.LISTENING);
  } catch (e) {
    markErrorState('麦克风权限获取失败，请检查浏览器设置');
    console.error('启动录音失败', e);
    stopMediaStream();
  }
};

const startPressRecording = async () => {
  closeStream();
  stopAudioPlayback();
  setVoiceState(VOICE_STATES.IDLE);
  recordingTriggeredByPress = true;
  await startRecording();
};

const stopPressRecording = () => {
  if (!recordingTriggeredByPress) {
    return;
  }
  recordingTriggeredByPress = false;
  if (isListening.value) {
    stopRecording();
  }
};

const autoSendRecognizedText = async (text) => {
  const normalized = text?.trim();
  if (!normalized || !currentChatId.value) {
    showNotice('当前没有可用会话，无法发送语音识别结果', 'warning');
    setVoiceState(VOICE_STATES.IDLE);
    return;
  }

  appendMessage(currentChatId.value, 'user', normalized);
  input.value = '';

  closeStream();
  stopAudioPlayback();
  if (thinkMode.value) {
    openManusStream(normalized, currentChatId.value);
  } else {
    openEmotionStream(normalized, currentChatId.value);
  }
};

const handleSend = () => {
  const text = input.value.trim();
  if (!text || !currentChatId.value) {
    if (!currentChatId.value) {
      showNotice('当前没有可用会话，请先新建会话', 'warning');
    }
    return;
  }

  if (voiceMode.value) {
    ensureAudioContext();
  }

  appendMessage(currentChatId.value, 'user', text);
  input.value = '';

  closeStream();
  stopAudioPlayback();
  if (thinkMode.value) {
    openManusStream(text, currentChatId.value);
  } else {
    openEmotionStream(text, currentChatId.value);
  }
};

watch(
  currentChatId,
  (id) => {
    currentMessages.value = messagesMap.get(id) || [];
    nextTickScroll();
  },
  { immediate: true }
);

const mapConversationToSession = (conversation, index) => {
  const { conversationId, messages, lastUpdateTime } = conversation;
  const list = Array.isArray(messages)
    ? messages.map((m) => ({
        role: m.messageType && m.messageType.toLowerCase().includes('user') ? 'user' : 'ai',
        content: m.content || '',
        time: formatTimeFromTimestamp(m.timestamp)
      }))
    : [];

  messagesMap.set(conversationId, list);

  const lastMsg = list[list.length - 1];
  sessions.push({
    id: conversationId,
    index,
    lastMessage: lastMsg ? lastMsg.content.slice(0, 30) : ''
  });

  return {
    id: conversationId,
    lastUpdateTime
  };
};

const loadFromLocalStorage = () => {
  try {
    const savedData = localStorage.getItem('chatData');
    if (savedData) {
      const data = JSON.parse(savedData);
      sessions.length = 0;
      sessions.push(...data.sessions);
      messagesMap.clear();
      data.messagesMap.forEach(([key, value]) => {
        messagesMap.set(key, value);
      });
      currentChatId.value = data.currentChatId;
      sessionIndex = data.sessionIndex;
      if (typeof data.voiceMode === 'boolean') {
        voiceMode.value = data.voiceMode;
      }
      return true;
    }
  } catch (e) {
    console.error('从 localStorage 加载数据失败', e);
  }
  return false;
};

const loadInitialConversations = async () => {
  try {
    const res = await getAllConversations();
    const convs = Array.isArray(res.data) ? res.data : [];

    if (convs.length === 0) {
      createSession();
      return;
    }

    sessions.length = 0;
    messagesMap.clear();

    const infoList = convs.map((conv, idx) => mapConversationToSession(conv, idx + 1));
    sessionIndex = sessions.length + 1;

    let latest = infoList[0];
    for (let i = 1; i < infoList.length; i++) {
      const cur = infoList[i];
      if (!latest.lastUpdateTime) {
        latest = cur;
        continue;
      }
      if (cur.lastUpdateTime && cur.lastUpdateTime > latest.lastUpdateTime) {
        latest = cur;
      }
    }

    currentChatId.value = latest.id;
    saveToLocalStorage();
  } catch (e) {
    console.error('加载会话列表失败，将创建本地新会话', e);
    if (!currentChatId.value) {
      createSession();
    }
  }
};

onMounted(() => {
  const hasLocalData = loadFromLocalStorage();
  if (!hasLocalData) {
    loadInitialConversations();
  }
});

onBeforeUnmount(() => {
  closeStream();
  stopAudioPlayback();
  recordingTriggeredByPress = false;
  if (noticeTimer) {
    clearTimeout(noticeTimer);
  }
  stopRecording();
  stopMediaStream();
  setVoiceState(VOICE_STATES.IDLE);
});
</script>
