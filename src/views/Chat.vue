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
            :style="callMode ? callOnStyle : null"
            @click="toggleCallMode"
            title="开启后，录音按钮会切换为点击开始/点击结束的通话模式"
          >
            Call {{ callMode ? 'ON' : 'OFF' }}
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
            <div v-if="msg.role === 'ai' && msg.ragSources?.length" class="rag-source-list">
              <div class="rag-source-header">检索依据</div>
              <div
                v-for="(source, sourceIdx) in msg.ragSources"
                :key="`${idx}-${sourceIdx}-${source.fileName}-${source.title}`"
                class="rag-source-card"
              >
                <div class="rag-source-file">{{ source.fileName }}</div>
                <div class="rag-source-title">{{ source.title }}</div>
              </div>
            </div>
            <div class="text markdown-body" v-html="renderMessageContent(msg.content)"></div>
            <div v-if="msg.attachments?.length" class="attachment-list">
              <div
                v-for="(attachment, attachmentIdx) in msg.attachments"
                :key="`${idx}-${attachmentIdx}`"
                class="attachment-card"
              >
                <div class="attachment-main">
                  <div class="attachment-name">{{ attachment.fileName }}</div>
                  <div class="attachment-meta">
                    {{ attachment.mimeType || 'application/octet-stream' }}
                    <span v-if="attachment.fileSizeLabel"> · {{ attachment.fileSizeLabel }}</span>
                  </div>
                </div>
                <div class="attachment-actions">
                  <button class="btn btn-ghost btn-small" @click="downloadAttachment(attachment)">
                    下载
                  </button>
                  <button
                    v-if="attachment.mimeType === 'application/pdf'"
                    class="btn btn-primary btn-small"
                    @click="previewAttachment(attachment)"
                  >
                    预览
                  </button>
                </div>
              </div>
            </div>
            <div class="time">{{ msg.time }}</div>
          </div>
        </div>
        <div
          v-if="showLiveTranscriptMessage"
          class="chat-message from-user is-live-transcript"
        >
          <div class="avatar">我</div>
          <div class="bubble">
            <div class="live-transcript-tag">
              实时字幕
            </div>
            <div class="text">{{ liveTranscriptText }}</div>
            <div class="time">{{ liveTranscriptStatusText }}</div>
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
            :class="['btn', 'btn-ghost', 'btn-record', { 'is-recording': isListening, 'is-recognizing': isRecognizing, 'is-call-mode': callMode }]"
            :disabled="isBusyForRecord"
            @mousedown.prevent="handleRecordMouseDown"
            @mouseup.prevent="handleRecordMouseUp"
            @mouseleave.prevent="handleRecordMouseLeave"
            @touchstart.prevent="handleRecordTouchStart"
            @touchend.prevent="handleRecordTouchEnd"
            @touchcancel.prevent="handleRecordTouchCancel"
            @click.prevent="handleRecordClick"
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
  getRealtimeAsrWsUrl,
  recognizeSpeech
} from '../api/emotionApp';
import { authState } from '../utils/auth';

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
const callMode = ref(false);
const voiceState = ref(VOICE_STATES.IDLE);
const uiNotice = reactive({
  message: '',
  type: 'info'
});
const callTranscript = reactive({
  interim: '',
  final: ''
});

const thinkOnStyle = {
  background: '#4f46e5',
  color: '#fff'
};

const voiceOnStyle = {
  background: '#0f766e',
  color: '#fff'
};

const callOnStyle = {
  background: '#b45309',
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
let realtimeAsrSocket = null;
let realtimeAsrChatId = '';
let pcmAudioContext = null;
let pcmSourceNode = null;
let pcmProcessorNode = null;
const BROWSER_TTS_RATE = 1.25;

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
  [VOICE_STATES.IDLE]: '可以输入文本，或开始一轮语音输入',
  [VOICE_STATES.LISTENING]: '正在采集麦克风输入，结束录音后会自动识别并发送',
  [VOICE_STATES.RECOGNIZING]: '语音已结束，正在进行语音识别',
  [VOICE_STATES.THINKING]: '识别完成，正在等待 AI 回复',
  [VOICE_STATES.SPEAKING]: 'AI 正在语音播报，开始下一轮录音会立即打断',
  [VOICE_STATES.ERROR]: '当前语音链路发生错误，请查看提示信息'
};

const voiceStateLabel = computed(() => voiceStateLabelMap[voiceState.value] || '空闲');
const voiceStateDescription = computed(() => voiceStateDescriptionMap[voiceState.value] || '');
const liveTranscriptText = computed(() => {
  const finalPart = callTranscript.final.trim();
  const interimPart = callTranscript.interim.trim();
  const merged = [finalPart, interimPart].filter(Boolean).join(' ');
  if (merged) {
    return merged;
  }
  if (isListening.value) {
    return '正在聆听...';
  }
  if (isRecognizing.value) {
    return '正在整理语音...';
  }
  return '';
});
const showLiveTranscriptMessage = computed(() => callMode.value && (isListening.value || isRecognizing.value || !!liveTranscriptText.value));
const liveTranscriptStatusText = computed(() => {
  if (isListening.value) return '正在说话';
  if (isRecognizing.value) return '识别中';
  return '通话模式';
});

const voiceTipText = computed(() => {
  if (callMode.value) {
    if (isListening.value) return '通话模式已开启，再点一次结束录音';
    if (isRecognizing.value) return '通话模式：正在识别语音...';
    if (isThinking.value) return '通话模式：正在等待 AI 回复...';
    if (isSpeaking.value) return '通话模式：点击录音按钮可立即打断并开始下一轮';
    if (isErrorState.value) return '通话模式：语音链路异常，请查看上方提示';
    return '通话模式：点击录音按钮开始说话，字幕由后端实时返回';
  }

  if (isListening.value) return '正在录音，松开即发送';
  if (isRecognizing.value) return '正在识别语音...';
  if (isThinking.value) return '正在等待 AI 回复...';
  if (isSpeaking.value) return 'AI 正在播报，按住说话会立即打断';
  if (isErrorState.value) return '语音链路异常，请查看上方提示';
  return '按 Enter 发送，Shift + Enter 换行，支持按住说话';
});

const recordButtonText = computed(() => {
  if (callMode.value) {
    if (isListening.value) return '结束通话输入';
    if (isRecognizing.value) return '识别中...';
    if (isThinking.value) return '等待中...';
    return '开始通话输入';
  }

  if (isListening.value) return '松开结束';
  if (isRecognizing.value) return '识别中...';
  if (isThinking.value) return '等待中...';
  return '按住说话';
});

const setVoiceState = (nextState) => {
  voiceState.value = nextState;
};

const clearCallTranscript = () => {
  callTranscript.interim = '';
  callTranscript.final = '';
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

const createMessage = (role, content) => ({
  role,
  content,
  time: formatTime(),
  attachments: [],
  ragSources: []
});

const ensureLastAiMessage = (chatId) => {
  const list = messagesMap.get(chatId) || [];
  const last = list[list.length - 1];
  if (!last || last.role !== 'ai') {
    const msg = createMessage('ai', '');
    list.push(msg);
    messagesMap.set(chatId, list);
    return msg;
  }
  if (!Array.isArray(last.attachments)) {
    last.attachments = [];
  }
  if (!Array.isArray(last.ragSources)) {
    last.ragSources = [];
  }
  return last;
};

const normalizeRagSource = (doc) => {
  const metadata = doc?.metadata || {};
  return {
    id: doc?.id || '',
    fileName: doc?.fileName || metadata.filename || metadata.fileName || '未命名文档',
    title: doc?.title || metadata.title || metadata.chunkTitle || metadata.header || '未命名分片',
    distance: typeof doc?.distance === 'number'
      ? doc.distance
      : typeof metadata.distance === 'number'
        ? metadata.distance
        : null
  };
};

const dedupeRagSources = (docs = []) => {
  const map = new Map();
  docs.forEach((doc) => {
    const item = normalizeRagSource(doc);
    const key = `${item.fileName}::${item.title}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
};

const formatFileSize = (base64) => {
  if (!base64) return '';
  const padding = (base64.match(/=*$/) || [''])[0].length;
  const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const applyInlineMarkdown = (value = '') =>
  value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

const renderMessageContent = (content = '') => {
  if (!content) return '';

  const normalized = escapeHtml(content).replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const html = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (/^---+$/.test(line)) {
      closeList();
      html.push('<hr />');
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${applyInlineMarkdown(bulletMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${applyInlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join('');
};

const markErrorState = (message, duration = 4500) => {
  setVoiceState(VOICE_STATES.ERROR);
  showNotice(message, 'error', duration);
};

const getChatStorageKey = () => {
  const userId = authState.user?.userId;
  return userId ? `chatData:${userId}` : 'chatData:guest';
};

const saveToLocalStorage = () => {
  try {
    const data = {
      sessions,
      messagesMap: Array.from(messagesMap.entries()),
      currentChatId: currentChatId.value,
      sessionIndex,
      voiceMode: voiceMode.value,
      callMode: callMode.value
    };
    localStorage.setItem(getChatStorageKey(), JSON.stringify(data));
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

const floatTo16BitPcm = (input) => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
};

const downsampleBuffer = (buffer, inputSampleRate, outputSampleRate) => {
  if (outputSampleRate === inputSampleRate) {
    return floatTo16BitPcm(buffer);
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    const sample = count > 0 ? accum / count : 0;
    result[offsetResult] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
};

const pcmToBase64 = (pcmSamples) => {
  const uint8 = new Uint8Array(pcmSamples.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const chunk = uint8.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const sendRealtimeAsrMessage = (payload) => {
  if (!realtimeAsrSocket || realtimeAsrSocket.readyState !== WebSocket.OPEN) {
    return;
  }
  realtimeAsrSocket.send(JSON.stringify(payload));
};

const closeRealtimeAsrSocket = () => {
  if (realtimeAsrSocket) {
    try {
      realtimeAsrSocket.close();
    } catch (e) {
      console.warn('close realtime ASR websocket failed', e);
    }
    realtimeAsrSocket = null;
  }
  realtimeAsrChatId = '';
};

const stopRealtimeAudioCapture = () => {
  if (pcmProcessorNode) {
    pcmProcessorNode.disconnect();
    pcmProcessorNode.onaudioprocess = null;
    pcmProcessorNode = null;
  }
  if (pcmSourceNode) {
    pcmSourceNode.disconnect();
    pcmSourceNode = null;
  }
  if (pcmAudioContext) {
    pcmAudioContext.close().catch(() => {});
    pcmAudioContext = null;
  }
};

const stopRealtimeAsrFlow = () => {
  stopRealtimeAudioCapture();
  closeRealtimeAsrSocket();
};

const setupRealtimeAsrSocket = (chatId) => {
  closeRealtimeAsrSocket();
  const socket = new WebSocket(getRealtimeAsrWsUrl(chatId));
  realtimeAsrSocket = socket;
  realtimeAsrChatId = chatId;

  socket.onopen = () => {
    sendRealtimeAsrMessage({
      type: 'start',
      chatId
    });
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      switch (payload.type) {
        case 'partial_transcript':
          callTranscript.interim = payload.text || '';
          break;
        case 'final_transcript':
          callTranscript.final = payload.text || '';
          callTranscript.interim = '';
          input.value = payload.text || '';
          autoSendRecognizedText(payload.text || '');
          break;
        case 'speech_started':
          setVoiceState(VOICE_STATES.LISTENING);
          break;
        case 'speech_stopped':
          if (!isThinking.value) {
            setVoiceState(VOICE_STATES.RECOGNIZING);
          }
          break;
        case 'error':
          markErrorState(payload.message || '实时语音识别失败');
          break;
        default:
          break;
      }
    } catch (e) {
      console.error('parse realtime ASR websocket message failed', e);
    }
  };

  socket.onerror = () => {
    markErrorState('实时语音识别连接失败');
  };

  socket.onclose = () => {
    realtimeAsrSocket = null;
  };
};

const startRealtimeAudioCapture = async (stream, chatId) => {
  setupRealtimeAsrSocket(chatId);

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('AudioContext is not supported');
  }

  pcmAudioContext = new AudioCtx();
  pcmSourceNode = pcmAudioContext.createMediaStreamSource(stream);
  pcmProcessorNode = pcmAudioContext.createScriptProcessor(4096, 1, 1);
  pcmProcessorNode.onaudioprocess = (event) => {
    if (!realtimeAsrSocket || realtimeAsrSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const inputData = event.inputBuffer.getChannelData(0);
    const pcm16 = downsampleBuffer(inputData, pcmAudioContext.sampleRate, 16000);
    sendRealtimeAsrMessage({
      type: 'audio_chunk',
      chatId,
      audioBase64: pcmToBase64(pcm16)
    });
  };

  pcmSourceNode.connect(pcmProcessorNode);
  pcmProcessorNode.connect(pcmAudioContext.destination);
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
  stopRealtimeAsrFlow();
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
  const msg = createMessage(role, content);
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
      list.push(createMessage('ai', chunk));
    } else {
      last.content += chunk;
      last.time = formatTime();
      if (!Array.isArray(last.attachments)) {
        last.attachments = [];
      }
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

const setAiMessage = (chatId, content) => {
  const list = messagesMap.get(chatId) || [];
  const last = list[list.length - 1];

  if (!last || last.role !== 'ai') {
      list.push(createMessage('ai', content));
    } else {
      last.content = content;
      last.time = formatTime();
      if (!Array.isArray(last.attachments)) {
        last.attachments = [];
      }
    }

  messagesMap.set(chatId, list);
  const session = sessions.find((s) => s.id === chatId);
  if (session) {
    session.lastMessage = content.slice(0, 30);
  }

  nextTickScroll();
  saveToLocalStorage();
};

const appendAgentStep = (chatId, content) => {
  if (!content) return;
  appendAiChunk(chatId, `\n[分析步骤] ${content}`);
};

const addAttachmentToAiMessage = (chatId, payload) => {
  const fileBase64 = payload?.fileBase64;
  if (!fileBase64) {
    showNotice('未收到可展示的文件内容', 'warning');
    return;
  }

  const lastAiMessage = ensureLastAiMessage(chatId);
  const attachment = {
    fileName: payload?.fileName || 'download.bin',
    mimeType: payload?.mimeType || 'application/octet-stream',
    fileBase64,
    fileSizeLabel: formatFileSize(fileBase64)
  };

  const exists = lastAiMessage.attachments.some(
    (item) => item.fileName === attachment.fileName && item.fileBase64 === attachment.fileBase64
  );
  if (!exists) {
    lastAiMessage.attachments.push(attachment);
    lastAiMessage.time = formatTime();
  }

  const list = messagesMap.get(chatId) || [];
  messagesMap.set(chatId, list);
  nextTickScroll();
  saveToLocalStorage();
};

const setRagSourcesToAiMessage = (chatId, ragDocuments) => {
  const lastAiMessage = ensureLastAiMessage(chatId);
  lastAiMessage.ragSources = dedupeRagSources(ragDocuments);
  lastAiMessage.time = formatTime();

  const list = messagesMap.get(chatId) || [];
  messagesMap.set(chatId, list);
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

const startChatEventStream = (url, chatId, options = {}) => {
  const {
    onComplete = null,
    includeAgentSteps = true
  } = options;

  eventSource = new EventSource(url);
  let aiBuffer = '';

  eventSource.addEventListener('delta', (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      const chunk = payload?.content || '';
      if (!chunk) return;
      aiBuffer += chunk;
      setAiMessage(chatId, aiBuffer);
    } catch (e) {
      console.error('parse delta event failed', e);
    }
  });

  eventSource.addEventListener('final', (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      const content = payload?.content || '';
      if (content) {
        aiBuffer = content;
        setAiMessage(chatId, aiBuffer);
      }
    } catch (e) {
      console.error('parse final event failed', e);
    } finally {
      closeStream();
      if (typeof onComplete === 'function') {
        onComplete();
      } else {
        resetVoiceStateIfQuiet();
      }
    }
  });

  eventSource.addEventListener('agent_step', (event) => {
    if (!includeAgentSteps || !event.data) return;
    try {
      const payload = JSON.parse(event.data);
      appendAgentStep(chatId, payload?.content || '');
    } catch (e) {
      console.error('parse agent_step event failed', e);
    }
  });

  eventSource.addEventListener('rag', (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      setRagSourcesToAiMessage(chatId, payload?.ragDocuments || []);
    } catch (e) {
      console.error('parse rag event failed', e);
    }
  });

  eventSource.addEventListener('file', (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      addAttachmentToAiMessage(chatId, payload);
    } catch (e) {
      console.error('parse file event failed', e);
      showNotice('文件下载失败', 'warning');
    }
  });

  eventSource.addEventListener('error', (event) => {
    let message = '实时对话发生异常';
    if (event?.data) {
      try {
        const payload = JSON.parse(event.data);
        message = payload?.content || message;
      } catch (e) {
        message = event.data || message;
      }
    }
    showNotice(message, 'warning');
    closeStream();
    resetVoiceStateIfQuiet();
  });

  eventSource.onerror = () => {
    showNotice('实时回复连接已中断', 'warning');
    closeStream();
    resetVoiceStateIfQuiet();
  };
};

const openEmotionStream = (message, chatId) => {
  setVoiceState(VOICE_STATES.THINKING);

  if (!voiceMode.value) {
    startChatEventStream(getChatStreamUrl(message, chatId), chatId, {
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

  eventSource.addEventListener('rag', (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      setRagSourcesToAiMessage(chatId, payload?.ragDocuments || []);
    } catch (e) {
      console.error('parse rag event failed', e);
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
  startChatEventStream(getManusChatStreamUrl(message, chatId), chatId, {
    includeAgentSteps: true,
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

const downloadAttachment = (attachment) => {
  const fileBase64 = attachment?.fileBase64;
  const fileName = attachment?.fileName || 'download.bin';
  const mimeType = attachment?.mimeType || 'application/octet-stream';
  if (!fileBase64) {
    showNotice('未收到可下载的文件内容', 'warning');
    return;
  }

  const blob = base64ToBlob(fileBase64, mimeType);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showNotice(`文件已下载：${fileName}`, 'info');
};

const previewAttachment = (attachment) => {
  const fileBase64 = attachment?.fileBase64;
  const mimeType = attachment?.mimeType || 'application/octet-stream';
  if (!fileBase64) {
    showNotice('未收到可预览的文件内容', 'warning');
    return;
  }

  const blob = base64ToBlob(fileBase64, mimeType);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
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

const toggleCallMode = () => {
  callMode.value = !callMode.value;
  if (callMode.value) {
    voiceMode.value = true;
    clearCallTranscript();
    showNotice('已进入通话模式，实时字幕将由后端返回', 'info');
  } else {
    if (isListening.value) {
      stopRecording();
    }
    stopRealtimeAsrFlow();
    showNotice('已退出通话模式，恢复按住说话', 'info');
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
  if (callMode.value) {
    sendRealtimeAsrMessage({
      type: 'stop',
      chatId: currentChatId.value
    });
    stopMediaStream();
    stopRealtimeAudioCapture();
    setVoiceState(VOICE_STATES.RECOGNIZING);
    return;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
};

const startRecording = async () => {
  if (isListening.value || isRecognizing.value || isThinking.value) {
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
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

    if (callMode.value) {
      await startRealtimeAudioCapture(mediaStream, currentChatId.value);
      setVoiceState(VOICE_STATES.LISTENING);
      return;
    }

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
        const recognizedText = response?.data?.text?.trim() || '';
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
    stopRealtimeAsrFlow();
  }
};

const startVoiceTurn = async () => {
  closeStream();
  stopAudioPlayback();
  setVoiceState(VOICE_STATES.IDLE);
  if (callMode.value) {
    clearCallTranscript();
  }
  recordingTriggeredByPress = true;
  await startRecording();
};

const stopVoiceTurn = () => {
  recordingTriggeredByPress = false;
  if (isListening.value) {
    stopRecording();
  }
};

const startPressRecording = async () => {
  if (callMode.value) return;
  await startVoiceTurn();
};

const stopPressRecording = () => {
  if (callMode.value) return;
  if (!recordingTriggeredByPress) {
    return;
  }
  stopVoiceTurn();
};

const handleRecordClick = async () => {
  if (!callMode.value) {
    return;
  }

  if (isListening.value) {
    stopVoiceTurn();
    return;
  }

  await startVoiceTurn();
};

const handleRecordMouseDown = async () => {
  if (callMode.value) return;
  await startPressRecording();
};

const handleRecordMouseUp = () => {
  if (callMode.value) return;
  stopPressRecording();
};

const handleRecordMouseLeave = () => {
  if (callMode.value) return;
  stopPressRecording();
};

const handleRecordTouchStart = async () => {
  if (callMode.value) return;
  await startPressRecording();
};

const handleRecordTouchEnd = () => {
  if (callMode.value) return;
  stopPressRecording();
};

const handleRecordTouchCancel = () => {
  if (callMode.value) return;
  stopPressRecording();
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
            time: formatTimeFromTimestamp(m.timestamp),
            attachments: [],
            ragSources: []
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
    const savedData = localStorage.getItem(getChatStorageKey());
    if (savedData) {
      const data = JSON.parse(savedData);
      sessions.length = 0;
      sessions.push(...data.sessions);
      messagesMap.clear();
      data.messagesMap.forEach(([key, value]) => {
          const normalizedValue = Array.isArray(value)
            ? value.map((msg) => ({
                ...msg,
                attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
                ragSources: Array.isArray(msg.ragSources) ? msg.ragSources : []
              }))
            : [];
          messagesMap.set(key, normalizedValue);
      });
      currentChatId.value = data.currentChatId;
      sessionIndex = data.sessionIndex;
      if (typeof data.voiceMode === 'boolean') {
        voiceMode.value = data.voiceMode;
      }
      if (typeof data.callMode === 'boolean') {
        callMode.value = data.callMode;
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
    // 清除当前用户的本地缓存，确保从后端获取最新数据
    localStorage.removeItem(getChatStorageKey());
    localStorage.removeItem('chatData');
    
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

// 监听用户登录状态变化，当用户改变时刷新会话列表
watch(() => authState.user, (newUser, oldUser) => {
  if (newUser && newUser.userId !== oldUser?.userId) {
    // 用户登录或切换，强制从后端获取最新会话列表
    loadInitialConversations();
  }
}, { deep: true });

onBeforeUnmount(() => {
  closeStream();
  stopAudioPlayback();
  stopRealtimeAsrFlow();
  recordingTriggeredByPress = false;
  if (noticeTimer) {
    clearTimeout(noticeTimer);
  }
  stopRecording();
  stopMediaStream();
  setVoiceState(VOICE_STATES.IDLE);
});
</script>

<style scoped>
.attachment-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.markdown-body :deep(p) {
  margin: 0 0 10px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 14px 0 8px;
  line-height: 1.4;
  font-weight: 700;
}

.markdown-body :deep(h1) { font-size: 22px; }
.markdown-body :deep(h2) { font-size: 20px; }
.markdown-body :deep(h3) { font-size: 18px; }
.markdown-body :deep(h4) { font-size: 16px; }

.markdown-body :deep(ul) {
  margin: 8px 0 12px;
  padding-left: 20px;
}

.markdown-body :deep(li) {
  margin: 6px 0;
  line-height: 1.7;
}

.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid rgba(100, 116, 139, 0.3);
  margin: 14px 0;
}

.markdown-body :deep(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.08);
  font-size: 0.92em;
}

.attachment-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
}

.attachment-main {
  min-width: 0;
  flex: 1;
}

.attachment-name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  word-break: break-all;
}

.attachment-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.attachment-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.from-user .attachment-card {
  background: rgba(255, 255, 255, 0.22);
}

.from-user .attachment-name,
.from-user .attachment-meta {
  color: inherit;
}
</style>
