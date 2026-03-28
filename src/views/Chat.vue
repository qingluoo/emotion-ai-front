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
        <h2>情景交流</h2>
        <div class="chat-header-right">
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

      <div class="chat-window" ref="chatWindowRef">
        <div v-if="currentMessages.length === 0" class="chat-empty">
          这是一个安全的空间，可以随时和我说说你现在的感受。
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
          <span class="tip">按 Enter 发送，Shift + Enter 换行</span>
          <button
            class="btn btn-primary"
            :disabled="sending || !input.trim()"
            @click="handleSend"
          >
            {{ sending ? '发送中...' : '发送' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { getChatStreamUrl, getChatStreamWithTtsUrl, getAllConversations, getManusChatStreamUrl } from '../api/emotionApp';

const sessions = reactive([]);
const messagesMap = reactive(new Map());
const currentChatId = ref('');
const input = ref('');
const sending = ref(false);
const thinkMode = ref(false);
const thinkOnStyle = {
  background: '#4f46e5',
  color: '#fff'
};
const chatWindowRef = ref(null);
let eventSource = null;
let sessionIndex = 1;
let audioQueue = [];
let isAudioPlaying = false;

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

const createNewChat = () => {
  closeStream();
  createSession();
};

const switchChat = (id) => {
  if (id === currentChatId.value) return;
  closeStream();
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

const nextTickScroll = () => {
  requestAnimationFrame(() => {
    const el = chatWindowRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
};

const startStream = (url, chatId, options = {}) => {
  const { eventNames = [], closeOnComplete = false, showEventName = false, handleDefaultMessage = true } = options;

  eventSource = new EventSource(url);
  let aiBuffer = '';

  const upsertAiMessage = (content) => {
    const list = messagesMap.get(chatId) || [];
    const last = list[list.length - 1];

    if (!last || last.role !== 'ai' || sending.value) {
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

  // 默认 message 事件（emotion_app/chat/stream 这种常见 SSE 用法）
  eventSource.onmessage = (event) => {
    if (!handleDefaultMessage) return;
    if (!event.data) return;
    appendChunk(event.data);
  };

  // Manus：后端通过 "event:xxx" 推送自定义事件名
  const bindEvent = (name) => {
    eventSource.addEventListener(name, (event) => {
      const data = event?.data ?? '';
      if (!data) return;

      if (name === 'complete' && closeOnComplete) {
        if (showEventName) {
          appendChunk(`\n[${name}] ${data}`);
        } else {
          appendChunk(`\n${data}`);
        }
        closeStream();
        return;
      }

      if (showEventName) {
        appendChunk(`\n[${name}] ${data}`);
      } else {
        appendChunk(`\n${data}`);
      }
    });
  };

  eventNames.forEach(bindEvent);

  eventSource.onerror = () => {
    closeStream();
  };
};

const openEmotionStream = (message, chatId) => {
  const url = getChatStreamWithTtsUrl(message, chatId);
  startStream(url, chatId, {
    handleDefaultMessage: false
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

  eventSource.addEventListener('audio', async (event) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      const base64 = payload?.audioBase64;
      const mimeType = payload?.mimeType || 'audio/mpeg';
      if (!base64) return;
      enqueueAudio(base64, mimeType);
    } catch (e) {
      console.error('解析 audio 事件失败', e);
    }
  });

  eventSource.addEventListener('done', () => {
    closeStream();
  });

  eventSource.addEventListener('error', () => {
    closeStream();
  });
};

const openManusStream = (message, chatId) => {
  startStream(getManusChatStreamUrl(message), chatId, {
    // 这些事件名与你后端示例一致；即使后端少发部分，也不会影响
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
    showEventName: true
  });
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

const base64ToBlob = (base64, mimeType) => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const enqueueAudio = (audioBase64, mimeType) => {
  audioQueue.push({ audioBase64, mimeType });
  playNextAudio();
};

const playNextAudio = async () => {
  if (isAudioPlaying || audioQueue.length === 0) {
    return;
  }
  isAudioPlaying = true;
  const { audioBase64, mimeType } = audioQueue.shift();

  try {
    const blob = base64ToBlob(audioBase64, mimeType);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      isAudioPlaying = false;
      playNextAudio();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      isAudioPlaying = false;
      playNextAudio();
    };

    await audio.play();
  } catch (e) {
    console.error('音频播放失败', e);
    isAudioPlaying = false;
    playNextAudio();
  }
};

const closeStream = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
};

const handleSend = () => {
  const text = input.value.trim();
  if (!text || !currentChatId.value) return;
  sending.value = true;

  appendMessage(currentChatId.value, 'user', text);
  input.value = '';

  closeStream();
  if (thinkMode.value) {
    openManusStream(text, currentChatId.value);
  } else {
    openEmotionStream(text, currentChatId.value);
  }

  setTimeout(() => {
    sending.value = false;
  }, 300);
};

const currentMessages = ref([]);

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

const saveToLocalStorage = () => {
  try {
    const data = {
      sessions: sessions,
      messagesMap: Array.from(messagesMap.entries()),
      currentChatId: currentChatId.value,
      sessionIndex: sessionIndex
    };
    localStorage.setItem('chatData', JSON.stringify(data));
  } catch (e) {
    console.error('保存数据到localStorage失败', e);
  }
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
      return true;
    }
  } catch (e) {
    console.error('从localStorage加载数据失败', e);
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

    // 选择最近更新的会话作为当前会话
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
  audioQueue = [];
  isAudioPlaying = false;
});
</script>

