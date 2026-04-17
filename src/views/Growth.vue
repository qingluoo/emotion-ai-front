<template>
  <div class="page growth-layout">
    <aside class="sidebar">
      <div class="sidebar-head">
        <div>
          <h2>个人成长</h2>
          <p class="hint">用模块切换代替整页下拉。</p>
        </div>
        <span class="chip">已登录</span>
      </div>

      <div class="card">
        <div class="calendar-header">
          <button class="btn btn-ghost btn-small" @click="prevMonth">&lt;</button>
          <div class="month-label">{{ currentYear }} 年 {{ currentMonth + 1 }} 月</div>
          <button class="btn btn-ghost btn-small" @click="nextMonth">&gt;</button>
        </div>
        <div class="calendar-grid">
          <div v-for="weekday in weekdays" :key="weekday" class="weekday">{{ weekday }}</div>
          <div
            v-for="cell in calendarCells"
            :key="cell.key"
            :class="['day-cell', { active: isSelected(cell.dateStr), dim: !cell.currentMonth, marked: hasDiary(cell.dateStr) }]"
            @click="selectDate(cell.dateStr)"
          >
            <span>{{ cell.date }}</span>
            <i v-if="hasDiary(cell.dateStr)" class="dot"></i>
          </div>
        </div>
      </div>

      <div class="card diary-card">
        <div class="card-head">
          <h3>{{ selectedDate }}</h3>
          <button class="btn btn-ghost btn-small" :disabled="loadingDay" @click="loadSelectedDate">
            {{ loadingDay ? '加载中...' : '刷新' }}
          </button>
        </div>
        <div v-if="dayError" class="status error">{{ dayError }}</div>
        <div v-else-if="currentDiaries.length === 0" class="empty">这一天还没有记录。</div>
        <ul v-else class="diary-list">
          <li
            v-for="item in currentDiaries"
            :key="item.id"
            :class="['diary-item', { active: selectedDiaryId === item.id }]"
            @click="pickDiary(item)"
          >
            <div class="diary-top">
              <strong>{{ item.emotionPrimary || '待识别' }}</strong>
              <span>{{ item.intensity || '-' }}</span>
            </div>
            <p>{{ item.rawText }}</p>
          </li>
        </ul>
      </div>
    </aside>

    <section class="workspace">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="panel">
        <div v-if="activeTab === 'diary'" class="panel-scroll">
          <div class="card-head">
            <div>
              <h2>{{ selectedDiaryId ? '编辑日记' : '新增日记' }}</h2>
              <p class="hint">保存后自动识别。</p>
            </div>
            <button v-if="selectedDiaryId" class="btn btn-ghost btn-small" @click="resetForm">新建一条</button>
          </div>
          <div class="generate-card">
            <div class="card-head">
              <div>
                <h3>从聊天会话生成日记</h3>
                <p class="hint">读取选中会话中的用户消息，自动生成当天情绪日记。</p>
              </div>
            </div>
            <div class="grid two">
              <label class="field">
                <span>聊天会话</span>
                <select v-model="generateForm.chatId" class="select-input">
                  <option value="">请选择会话</option>
                  <option v-for="item in conversationOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>生成日期</span>
                <input v-model="generateForm.recordDate" type="date" />
              </label>
            </div>
            <label class="field">
              <span>或手动输入 chatId</span>
              <input v-model="generateForm.chatId" type="text" placeholder="没有列表时可直接输入当前聊天会话 ID" />
            </label>
            <div class="actions">
              <button class="btn btn-primary" :disabled="generatingFromConversation || !generateForm.chatId" @click="submitGenerateFromConversation">
                {{ generatingFromConversation ? '生成中...' : '根据会话生成当日日记' }}
              </button>
              <button class="btn btn-ghost" :disabled="generatingFromConversation" @click="loadConversations">
                刷新会话
              </button>
            </div>
            <div v-if="conversationOptions.length === 0" class="status info">
              当前没有从后端读取到可选会话。你可以先在聊天页发送一条消息，或者直接手动填写 chatId。
            </div>
          </div>
          <div class="grid two">
            <label class="field">
              <span>记录日期</span>
              <input v-model="form.recordDate" type="date" />
            </label>
            <label class="field">
              <span>聊天会话 ID</span>
              <input v-model="form.chatId" type="text" placeholder="可选" />
            </label>
            <label class="field">
              <span>手动情绪标签</span>
              <input v-model="form.emotionPrimary" type="text" placeholder="例如：焦虑" />
            </label>
            <label class="field">
              <span>强度 1-10</span>
              <input v-model.number="form.intensity" type="number" min="1" max="10" />
            </label>
          </div>
          <label class="field">
            <span>情绪记录内容</span>
            <textarea v-model="form.rawText" class="editor" placeholder="写下今天发生了什么。"></textarea>
          </label>
          <div class="actions">
            <button class="btn btn-primary" :disabled="saving || !canSubmit" @click="submitDiary">
              {{ saving ? '保存中...' : selectedDiaryId ? '保存修改' : '保存并识别' }}
            </button>
            <button class="btn btn-ghost" :disabled="recognizing || !selectedDiaryId || !form.rawText.trim()" @click="runRecognition">
              {{ recognizing ? '识别中...' : '重新识别' }}
            </button>
            <button class="btn btn-ghost" :disabled="deleting || !selectedDiaryId" @click="removeDiary">
              {{ deleting ? '删除中...' : '删除' }}
            </button>
          </div>
          <div v-if="saveMessage" class="status info">{{ saveMessage }}</div>
        </div>

        <div v-else-if="activeTab === 'recognition'" class="panel-scroll">
          <div class="card-head">
            <div>
              <h2>情绪识别</h2>
              <p class="hint">查看结构化识别结果和即时建议。</p>
            </div>
          </div>
          <div v-if="recognitionError" class="status error">{{ recognitionError }}</div>
          <div v-else-if="recognition" class="grid two">
            <div class="metric"><span>主情绪</span><strong>{{ recognition.emotionPrimary || '待确认' }}</strong></div>
            <div class="metric"><span>次情绪</span><strong>{{ recognition.emotionSecondary || '未识别' }}</strong></div>
            <div class="metric"><span>强度</span><strong>{{ recognition.intensity || '-' }}</strong></div>
            <div class="metric"><span>压力等级</span><strong>{{ recognition.stressLevel || '-' }}</strong></div>
            <div class="block">
              <h3>情绪摘要</h3>
              <p>{{ recognition.summary || '暂无摘要' }}</p>
            </div>
            <div class="block">
              <h3>触发事件</h3>
              <p>{{ recognition.triggerEvent || '暂无明确触发事件' }}</p>
            </div>
            <div class="block">
              <h3>身体反应</h3>
              <p>{{ recognition.bodyResponse || '暂无明显身体反应描述' }}</p>
            </div>
            <div class="block warm">
              <h3>即时安慰</h3>
              <p>{{ recognition.comfortMessage || '你已经在认真面对自己的感受。' }}</p>
            </div>
            <div class="block full">
              <h3>建议行动</h3>
              <ul class="plain-list">
                <li v-for="(item, index) in recognition.suggestions || []" :key="index">{{ item }}</li>
              </ul>
            </div>
          </div>
          <div v-else class="empty">先在“日记录入”模块保存一条记录。</div>
        </div>

        <div v-else-if="activeTab === 'trends'" class="panel-scroll">
          <div class="card-head">
            <div>
              <h2>趋势分析</h2>
              <p class="hint">按时间窗口查看情绪变化。</p>
            </div>
            <div class="actions">
              <button
                v-for="days in [7, 30]"
                :key="days"
                :class="['btn', selectedRangeDays === days ? 'btn-primary' : 'btn-ghost', 'btn-small']"
                @click="loadTrends(days)"
              >
                最近 {{ days }} 天
              </button>
            </div>
          </div>
          <div v-if="trendError" class="status error">{{ trendError }}</div>
          <div v-else-if="trendData" class="grid two">
            <div class="metric"><span>记录条数</span><strong>{{ trendData.totalEntries }}</strong></div>
            <div class="metric"><span>平均强度</span><strong>{{ trendData.averageIntensity }}</strong></div>
            <div class="metric"><span>主导情绪</span><strong>{{ trendData.dominantEmotion }}</strong></div>
            <div class="metric"><span>窗口</span><strong>{{ trendData.rangeDays }} 天</strong></div>
            <div class="block full">
              <h3>趋势摘要</h3>
              <p>{{ trendData.summary }}</p>
            </div>
            <div class="block">
              <h3>情绪分布</h3>
              <ul class="stat-list">
                <li v-for="item in trendData.emotionDistribution || []" :key="item.emotion"><span>{{ item.emotion }}</span><strong>{{ item.count }}</strong></li>
              </ul>
            </div>
            <div class="block">
              <h3>高频触发词</h3>
              <ul class="stat-list">
                <li v-for="item in trendData.triggerKeywords || []" :key="item.keyword"><span>{{ item.keyword }}</span><strong>{{ item.count }}</strong></li>
              </ul>
            </div>
            <div class="block full">
              <h3>每日强度走势</h3>
              <ul class="stat-list">
                <li v-for="point in trendData.dailyIntensity || []" :key="point.date">
                  <span>{{ point.date }}</span>
                  <span>平均强度 {{ point.averageIntensity }}</span>
                  <strong>{{ point.entryCount }} 条</strong>
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="empty">暂无趋势数据。</div>
        </div>

        <div v-else-if="activeTab === 'plan'" class="panel-scroll">
          <div class="card-head">
            <div>
              <h2>成长规划</h2>
              <p class="hint">生成短周期、可执行的行动计划。</p>
            </div>
            <button class="btn btn-primary btn-small" :disabled="generatingPlan" @click="submitPlan">
              {{ generatingPlan ? '生成中...' : '生成计划' }}
            </button>
          </div>
          <label class="field">
            <span>当前诉求</span>
            <textarea v-model="planForm.concern" class="editor" placeholder="描述你当前最想解决的问题。"></textarea>
          </label>
          <div class="grid two">
            <label class="field">
              <span>计划周期</span>
              <select v-model="planForm.periodType" class="select-input">
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option>
              </select>
            </label>
            <label class="field">
              <span>参考天数</span>
              <input v-model.number="planForm.lookbackDays" type="number" min="7" max="30" />
            </label>
          </div>
          <div v-if="planError" class="status error">{{ planError }}</div>
          <div v-else-if="planData" class="grid two">
            <div class="block full">
              <h3>计划目标</h3>
              <p>{{ planData.goal }}</p>
            </div>
            <div class="block">
              <h3>行动清单</h3>
              <ul class="plain-list">
                <li v-for="(item, index) in planData.actions || []" :key="`action-${index}`">{{ item }}</li>
              </ul>
            </div>
            <div class="block">
              <h3>检查点</h3>
              <ul class="plain-list">
                <li v-for="(item, index) in planData.checkpoints || []" :key="`checkpoint-${index}`">{{ item }}</li>
              </ul>
            </div>
          </div>
          <div v-else class="empty">还没有成长计划。</div>
        </div>

        <div v-else class="panel-scroll">
          <div class="card-head">
            <div>
              <h2>画像摘要</h2>
              <p class="hint">汇总最近阶段的情绪模式、压力源和支持方向。</p>
            </div>
            <button class="btn btn-primary btn-small" :disabled="rebuildingProfile" @click="loadOrRebuildProfile(true)">
              {{ rebuildingProfile ? '生成中...' : '重建画像' }}
            </button>
          </div>
          <div v-if="profileError" class="status error">{{ profileError }}</div>
          <div v-else-if="profileData" class="grid one">
            <div class="block full">
              <h3>画像文本</h3>
              <p>{{ profileData.profileText }}</p>
            </div>
            <div class="block full">
              <h3>画像标签</h3>
              <div class="tag-row">
                <span v-for="tag in profileData.tags || []" :key="tag" class="tag-pill">{{ tag }}</span>
              </div>
            </div>
          </div>
          <div v-else class="empty">还没有画像摘要。</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  createEmotionDiary,
  deleteEmotionDiary,
  generateDiaryFromConversation,
  generateGrowthPlan,
  getEmotionTrends,
  getAllConversations,
  getLatestGrowthPlan,
  getLatestGrowthProfile,
  listEmotionDiaries,
  rebuildGrowthProfile,
  recognizeEmotion,
  updateEmotionDiary
} from '../api/emotionApp';
import { authState } from '../utils/auth';

const tabs = [
  { key: 'diary', label: '日记录入' },
  { key: 'recognition', label: '情绪识别' },
  { key: 'trends', label: '趋势分析' },
  { key: 'plan', label: '成长规划' },
  { key: 'profile', label: '画像摘要' }
];
const activeTab = ref('diary');
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const today = new Date();
const currentYear = ref(today.getFullYear());
const currentMonth = ref(today.getMonth());
const selectedDate = ref(formatDate(today));
const selectedRangeDays = ref(30);
const diaries = ref([]);
const conversations = ref([]);
const loadingDay = ref(false);
const dayError = ref('');
const selectedDiaryId = ref(null);
const saving = ref(false);
const generatingFromConversation = ref(false);
const deleting = ref(false);
const recognizing = ref(false);
const saveMessage = ref('');
const recognitionError = ref('');
const recognition = ref(null);
const trendData = ref(null);
const trendError = ref('');
const generatingPlan = ref(false);
const planData = ref(null);
const planError = ref('');
const rebuildingProfile = ref(false);
const profileData = ref(null);
const profileError = ref('');
const form = reactive(createEmptyForm(selectedDate.value));
const generateForm = reactive({ chatId: '', recordDate: selectedDate.value });
const planForm = reactive({ concern: '', periodType: 'weekly', lookbackDays: 14 });

function createEmptyForm(dateStr) {
  return { chatId: '', recordDate: dateStr, rawText: '', emotionPrimary: '', intensity: 5 };
}
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function getChatStorageKey() {
  const userId = authState.user?.userId;
  return userId ? `chatData:${userId}` : 'chatData:guest';
}
function loadLocalChatData() {
  try {
    const savedData = localStorage.getItem(getChatStorageKey());
    return savedData ? JSON.parse(savedData) : null;
  } catch (error) {
    console.error('load local chat data failed', error);
    return null;
  }
}
function normalizeLocalLine(line) {
  return typeof line === 'string' ? line.replace(/\s+/g, ' ').trim() : '';
}
function isNoiseLocalLine(line) {
  if (!line || line.length <= 2) return true;
  const normalized = line.toLowerCase();
  const keywords = [
    'pdf', '生成pdf', '导出pdf', '导出为pdf', '生成 pdf', '导出 pdf',
    '帮我生成pdf', '给我生成pdf', 'generate a pdf', '调用generate',
    '查看我的情绪日历', '生成近期情绪报告的pdf'
  ];
  return keywords.some((item) => normalized.includes(item));
}
function buildRawTextFromLocalConversation(chatId) {
  if (!chatId) return '';
  const localChatData = loadLocalChatData();
  const entries = Array.isArray(localChatData?.messagesMap) ? localChatData.messagesMap : [];
  const matched = entries.find((item) => Array.isArray(item) && item[0] === chatId);
  const messages = Array.isArray(matched?.[1]) ? matched[1] : [];
  const lines = messages
    .filter((item) => item?.role === 'user')
    .flatMap((item) => String(item?.content || '').split('\n'))
    .map(normalizeLocalLine)
    .filter(Boolean)
    .filter((line) => !isNoiseLocalLine(line));
  return Array.from(new Set(lines)).join('\n');
}
function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    const date = daysInPrevMonth - i;
    cells.push({ key: `p-${date}`, date, currentMonth: false, dateStr: formatDate(new Date(year, month - 1, date)) });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ key: `c-${d}`, date: d, currentMonth: true, dateStr: formatDate(new Date(year, month, d)) });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d += 1) {
    cells.push({ key: `n-${d}`, date: d, currentMonth: false, dateStr: formatDate(new Date(year, month + 1, d)) });
  }
  return cells;
}

const calendarCells = computed(() => buildCalendar(currentYear.value, currentMonth.value));
const currentDiaries = computed(() => diaries.value.filter((item) => item.recordDate === selectedDate.value));
const canSubmit = computed(() => Boolean(form.rawText.trim() && form.recordDate));
const conversationOptions = computed(() => conversations.value.map((item) => ({
  value: item.conversationId,
  label: buildConversationLabel(item)
})));

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value -= 1;
  } else currentMonth.value -= 1;
}
function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value += 1;
  } else currentMonth.value += 1;
}
function isSelected(dateStr) { return selectedDate.value === dateStr; }
function hasDiary(dateStr) { return diaries.value.some((item) => item.recordDate === dateStr); }
function selectDate(dateStr) {
  selectedDate.value = dateStr;
  if (!selectedDiaryId.value) form.recordDate = dateStr;
  generateForm.recordDate = dateStr;
}

async function loadAllDiaries() {
  try {
    const res = await listEmotionDiaries();
    diaries.value = Array.isArray(res.data) ? res.data : [];
    dayError.value = '';
  } catch (error) {
    dayError.value = error?.response?.data?.message || '加载日记失败，请检查后端接口。';
  }
}
async function loadConversations() {
  const localConversationMap = new Map();
  try {
    const savedData = localStorage.getItem(getChatStorageKey());
    if (savedData) {
      const parsed = JSON.parse(savedData);
      const localSessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
      localSessions.forEach((item) => {
        if (item?.id) {
          localConversationMap.set(item.id, {
            conversationId: item.id,
            messageCount: 0,
            lastUpdateTime: null
          });
        }
      });
    }
  } catch (error) {
    console.error('load local conversations failed', error);
  }
  try {
    const res = await getAllConversations();
    const remoteList = Array.isArray(res.data) ? res.data : [];
    remoteList.forEach((item) => {
      if (item?.conversationId) {
        localConversationMap.set(item.conversationId, item);
      }
    });
    conversations.value = Array.from(localConversationMap.values());
  } catch (error) {
    conversations.value = Array.from(localConversationMap.values());
    console.error('load conversations failed', error);
  }
}
async function loadSelectedDate() {
  loadingDay.value = true;
  try {
    const res = await listEmotionDiaries({ date: selectedDate.value });
    const dayList = Array.isArray(res.data) ? res.data : [];
    const otherDays = diaries.value.filter((item) => item.recordDate !== selectedDate.value);
    diaries.value = [...otherDays, ...dayList].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    dayError.value = '';
  } catch (error) {
    dayError.value = error?.response?.data?.message || '加载当天记录失败，请稍后重试。';
  } finally {
    loadingDay.value = false;
  }
}
function applyDiaryToForm(item) {
  form.chatId = item.chatId || '';
  form.recordDate = item.recordDate || selectedDate.value;
  form.rawText = item.rawText || '';
  form.emotionPrimary = item.emotionPrimary || '';
  form.intensity = item.intensity || 5;
}
function buildRecognitionFromDiary(item) {
  if (!item) return null;
  return {
    emotionPrimary: item.emotionPrimary,
    emotionSecondary: item.emotionSecondary,
    intensity: item.intensity,
    triggerEvent: item.triggerEvent,
    bodyResponse: item.bodyResponse,
    summary: item.aiSummary,
    comfortMessage: '',
    suggestions: []
  };
}
function buildConversationLabel(item) {
  const title = item?.conversationId || 'conversation';
  return title;
}
function pickDiary(item) {
  selectedDiaryId.value = item.id;
  selectedDate.value = item.recordDate;
  applyDiaryToForm(item);
  recognition.value = item.recognition || buildRecognitionFromDiary(item);
  recognitionError.value = '';
  saveMessage.value = '';
  activeTab.value = 'diary';
}
function resetForm() {
  selectedDiaryId.value = null;
  Object.assign(form, createEmptyForm(selectedDate.value));
  recognition.value = null;
  recognitionError.value = '';
  saveMessage.value = '';
}
function upsertDiary(item) {
  const index = diaries.value.findIndex((entry) => entry.id === item.id);
  if (index >= 0) diaries.value.splice(index, 1, item);
  else diaries.value.unshift(item);
}

async function submitDiary() {
  saveMessage.value = '';
  recognitionError.value = '';
  saving.value = true;
  const payload = {
    chatId: form.chatId.trim() || null,
    recordDate: form.recordDate,
    rawText: form.rawText.trim(),
    emotionPrimary: form.emotionPrimary.trim() || null,
    intensity: form.intensity,
    source: 'manual'
  };
  try {
    const res = selectedDiaryId.value ? await updateEmotionDiary(selectedDiaryId.value, payload) : await createEmotionDiary(payload);
    const diary = res.data;
    upsertDiary(diary);
    selectedDiaryId.value = diary.id;
    selectedDate.value = diary.recordDate;
    applyDiaryToForm(diary);
    recognition.value = diary.recognition || buildRecognitionFromDiary(diary);
    saveMessage.value = '日记已保存，并同步完成情绪识别。';
    await loadTrends(selectedRangeDays.value);
    activeTab.value = 'recognition';
  } catch (error) {
    recognitionError.value = error?.response?.data?.message || '保存失败，请检查后端服务或数据库状态。';
  } finally {
    saving.value = false;
  }
}
async function submitGenerateFromConversation() {
  if (!generateForm.chatId) {
    recognitionError.value = '请先选择一个聊天会话。';
    activeTab.value = 'diary';
    return;
  }
  generatingFromConversation.value = true;
  recognitionError.value = '';
  saveMessage.value = '';
  try {
    let res;
    try {
      res = await generateDiaryFromConversation({
        chatId: generateForm.chatId,
        recordDate: generateForm.recordDate || selectedDate.value
      });
    } catch (error) {
      const localRawText = buildRawTextFromLocalConversation(generateForm.chatId);
      if (!localRawText) {
        throw error;
      }
      res = await createEmotionDiary({
        chatId: generateForm.chatId,
        recordDate: generateForm.recordDate || selectedDate.value,
        rawText: localRawText,
        source: 'manual'
      });
    }
    const diary = res.data;
    upsertDiary(diary);
    selectedDiaryId.value = diary.id;
    selectedDate.value = diary.recordDate;
    generateForm.recordDate = diary.recordDate;
    applyDiaryToForm(diary);
    recognition.value = diary.recognition || buildRecognitionFromDiary(diary);
    saveMessage.value = '已根据会话生成当天情绪日记。';
    await loadSelectedDate();
    await loadTrends(selectedRangeDays.value);
    activeTab.value = 'recognition';
  } catch (error) {
    recognitionError.value = error?.response?.data?.message || '根据会话生成日记失败，请稍后重试。';
    activeTab.value = 'diary';
  } finally {
    generatingFromConversation.value = false;
  }
}
async function runRecognition() {
  if (!selectedDiaryId.value || !form.rawText.trim()) return;
  recognizing.value = true;
  recognitionError.value = '';
  try {
    const res = await recognizeEmotion({ diaryId: selectedDiaryId.value, text: form.rawText.trim() });
    recognition.value = res.data;
    saveMessage.value = '已重新完成情绪识别。';
    const index = diaries.value.findIndex((item) => item.id === selectedDiaryId.value);
    if (index >= 0) diaries.value[index] = { ...diaries.value[index], ...{
      emotionPrimary: res.data?.emotionPrimary || diaries.value[index].emotionPrimary,
      emotionSecondary: res.data?.emotionSecondary || diaries.value[index].emotionSecondary,
      intensity: res.data?.intensity || diaries.value[index].intensity,
      triggerEvent: res.data?.triggerEvent || diaries.value[index].triggerEvent,
      bodyResponse: res.data?.bodyResponse || diaries.value[index].bodyResponse,
      aiSummary: res.data?.summary || diaries.value[index].aiSummary,
      recognition: res.data
    } };
    await loadTrends(selectedRangeDays.value);
    activeTab.value = 'recognition';
  } catch (error) {
    recognitionError.value = error?.response?.data?.message || '重新识别失败，请稍后重试。';
  } finally {
    recognizing.value = false;
  }
}
async function removeDiary() {
  if (!selectedDiaryId.value) return;
  deleting.value = true;
  recognitionError.value = '';
  try {
    await deleteEmotionDiary(selectedDiaryId.value);
    diaries.value = diaries.value.filter((item) => item.id !== selectedDiaryId.value);
    resetForm();
    saveMessage.value = '日记已删除。';
    await loadTrends(selectedRangeDays.value);
  } catch (error) {
    recognitionError.value = error?.response?.data?.message || '删除失败，请稍后重试。';
  } finally {
    deleting.value = false;
  }
}
async function loadTrends(days = 30) {
  selectedRangeDays.value = days;
  try {
    const res = await getEmotionTrends({ rangeDays: days });
    trendData.value = res.data;
    trendError.value = '';
  } catch (error) {
    trendError.value = error?.response?.data?.message || '趋势分析加载失败。';
  }
}
async function submitPlan() {
  generatingPlan.value = true;
  planError.value = '';
  try {
    const res = await generateGrowthPlan({ concern: planForm.concern, periodType: planForm.periodType, lookbackDays: planForm.lookbackDays });
    planData.value = res.data;
  } catch (error) {
    planError.value = error?.response?.data?.message || '成长计划生成失败。';
  } finally {
    generatingPlan.value = false;
  }
}
async function loadLatestPlan() {
  try { planData.value = (await getLatestGrowthPlan()).data; } catch {}
}
async function loadOrRebuildProfile(force = false) {
  if (force) {
    rebuildingProfile.value = true;
    profileError.value = '';
    try { profileData.value = (await rebuildGrowthProfile({ summaryPeriodDays: 30 })).data; }
    catch (error) { profileError.value = error?.response?.data?.message || '画像摘要生成失败。'; }
    finally { rebuildingProfile.value = false; }
    return;
  }
  try { profileData.value = (await getLatestGrowthProfile()).data; } catch {}
}

watch(selectedDate, () => {
  if (!selectedDiaryId.value) form.recordDate = selectedDate.value;
  if (!generateForm.recordDate) generateForm.recordDate = selectedDate.value;
});
watch([currentYear, currentMonth], async () => { await loadAllDiaries(); });
onMounted(async () => {
  await loadConversations();
  await loadAllDiaries();
  await loadSelectedDate();
  await loadTrends(30);
  await loadLatestPlan();
  await loadOrRebuildProfile(false);
});
</script>

<style scoped>
.growth-layout{display:grid;grid-template-columns:320px minmax(0,1fr);gap:18px;height:calc(100vh - 110px);max-width:1380px}
.sidebar,.workspace{min-height:0;background:rgba(255,255,255,.96);border-radius:24px;border:1px solid rgba(148,163,184,.18);box-shadow:0 18px 44px rgba(15,23,42,.08)}
.sidebar{display:flex;flex-direction:column;padding:18px;gap:14px}
.workspace{display:flex;flex-direction:column;overflow:hidden}
.sidebar-head,.card-head{display:flex;justify-content:space-between;gap:12px;align-items:start}
.sidebar-head h2,.card-head h2,.card-head h3{margin:0}
.hint{margin:4px 0 0;font-size:13px;line-height:1.6;color:#64748b}
.chip{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:12px;font-weight:600}
.card{border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;padding:14px}
.generate-card{margin-bottom:16px;border-radius:18px;background:linear-gradient(135deg,#ecfeff,#f8fafc);border:1px solid #bae6fd;padding:14px}
.diary-card{flex:1;min-height:0;display:flex;flex-direction:column}
.calendar-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.month-label{font-weight:700;color:#0f172a}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.weekday{text-align:center;font-size:12px;color:#64748b}
.day-cell{min-height:44px;border-radius:12px;border:1px solid transparent;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center}
.day-cell.dim{opacity:.45}.day-cell.active{border-color:#0f766e;background:#ecfdf5}.day-cell.marked{background:#f0fdfa}
.dot{width:6px;height:6px;border-radius:50%;background:#0f766e;margin-top:4px}
.diary-list{list-style:none;margin:12px 0 0;padding:0;overflow:auto;flex:1}
.diary-item{padding:10px 12px;border-radius:14px;background:#fff;border:1px solid transparent;margin-bottom:8px;cursor:pointer}
.diary-item.active{border-color:#0f766e;background:#f0fdfa}
.diary-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:6px}
.diary-item p{margin:0;font-size:13px;line-height:1.5;color:#334155}
.tabs{display:flex;gap:10px;padding:18px 18px 0;overflow:auto}
.tab{border:1px solid #dbe2ea;background:#fff;color:#334155;border-radius:999px;padding:10px 16px;cursor:pointer;font:inherit;white-space:nowrap}
.tab.active{background:#0f766e;color:#fff;border-color:#0f766e}
.panel{flex:1;min-height:0;padding:18px}
.panel-scroll{height:100%;overflow:auto;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;padding:18px}
.grid{display:grid;gap:12px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.one{grid-template-columns:1fr}
.field{display:grid;gap:6px;font-size:13px;color:#475569}.field span{font-weight:600}
.field input,.editor,.select-input{width:100%;border:1px solid #dbe2ea;border-radius:12px;padding:10px 12px;font:inherit;color:#0f172a;background:#fff}
.field input:focus,.editor:focus,.select-input:focus{outline:none;border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.12)}
.editor{min-height:120px;resize:vertical}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.metric,.block{border-radius:16px;background:#fff;border:1px solid #e2e8f0;padding:14px}
.metric span{font-size:12px;color:#64748b}.metric strong{display:block;margin-top:6px;font-size:20px}
.block h3{margin:0 0 8px;font-size:14px}.block p{margin:0;font-size:13px;line-height:1.7;color:#334155;white-space:pre-wrap}
.block.full{grid-column:1 / -1}.block.warm{background:linear-gradient(135deg,#fff7ed,#fffbeb);border-color:#fed7aa}
.plain-list,.stat-list{margin:0;padding-left:18px;color:#334155}.plain-list li,.stat-list li{margin-bottom:8px;line-height:1.6}
.stat-list li{display:flex;justify-content:space-between;gap:12px}
.tag-row{display:flex;gap:8px;flex-wrap:wrap}.tag-pill{display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:12px;font-weight:600}
.status{margin-top:12px;border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5}.status.info{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}.status.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
.empty{border-radius:16px;padding:16px;background:#fff;border:1px dashed #cbd5e1;color:#64748b;font-size:13px;line-height:1.6}
@media (max-width:1100px){.growth-layout{grid-template-columns:1fr;height:auto}.workspace{min-height:70vh}}
@media (max-width:720px){.grid.two{grid-template-columns:1fr}.panel{padding:14px}.panel-scroll{padding:14px}}
</style>
