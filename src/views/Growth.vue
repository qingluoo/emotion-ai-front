<template>
  <div class="page page-growth growth-page-v2">
    <section class="growth-left">
      <div class="section-head">
        <div>
          <h2>情绪日记</h2>
          <p class="hint">按日期查看记录，选择某条日记后可继续编辑或重新识别。</p>
        </div>
        <span class="user-chip">登录态已接入</span>
      </div>

      <div class="calendar">
        <div class="calendar-header">
          <button class="btn btn-ghost" @click="prevMonth">&lt;</button>
          <div class="month-label">{{ currentYear }} 年 {{ currentMonth + 1 }} 月</div>
          <button class="btn btn-ghost" @click="nextMonth">&gt;</button>
        </div>
        <div class="calendar-grid">
          <div v-for="weekday in weekdays" :key="weekday" class="weekday">
            {{ weekday }}
          </div>
          <div
            v-for="cell in calendarCells"
            :key="cell.key"
            :class="[
              'day-cell',
              {
                'other-month': !cell.currentMonth,
                active: isSelected(cell.dateStr),
                'has-diary': hasDiary(cell.dateStr)
              }
            ]"
            @click="selectDate(cell.dateStr)"
          >
            <div class="day-number">{{ cell.date }}</div>
            <div v-if="hasDiary(cell.dateStr)" class="day-tag">
              {{ getDiaryTag(cell.dateStr) }}
            </div>
          </div>
        </div>
      </div>

      <div class="diary-panel">
        <div class="diary-header">
          <h3>{{ selectedDate }} 的记录</h3>
          <button class="btn btn-ghost btn-small" :disabled="loadingDay" @click="loadSelectedDate">
            {{ loadingDay ? '加载中...' : '刷新' }}
          </button>
        </div>

        <div v-if="dayError" class="status-card status-error">
          {{ dayError }}
        </div>

        <div v-else-if="currentDiaries.length === 0" class="diary-empty">
          这一天还没有记录，可以从右侧直接新增一条日记。
        </div>

        <ul v-else class="diary-list">
          <li
            v-for="item in currentDiaries"
            :key="item.id"
            :class="['diary-item', { active: selectedDiaryId === item.id }]"
            @click="pickDiary(item)"
          >
            <div class="diary-top">
              <span class="emotion">{{ item.emotionPrimary || '待识别' }}</span>
              <span class="time">强度 {{ item.intensity || '-' }}</span>
            </div>
            <div class="diary-content">{{ item.rawText }}</div>
            <div class="diary-meta">
              <span>{{ item.source || 'manual' }}</span>
              <span>{{ formatDateTime(item.updatedAt || item.createdAt) }}</span>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section class="growth-right growth-workspace">
      <div class="growth-card">
        <div class="section-head compact">
          <div>
            <h2>{{ selectedDiaryId ? '编辑日记' : '新增日记' }}</h2>
            <p class="hint">保存后会自动触发情绪识别，并返回即时安慰建议。</p>
          </div>
          <button v-if="selectedDiaryId" class="btn btn-ghost btn-small" @click="resetForm">
            新建一条
          </button>
        </div>

        <div class="form-grid">
          <label class="field">
            <span>记录日期</span>
            <input v-model="form.recordDate" type="date" />
          </label>
          <label class="field">
            <span>聊天会话 ID</span>
            <input v-model="form.chatId" type="text" placeholder="可选，便于后续关联对话" />
          </label>
          <label class="field">
            <span>手动情绪标签</span>
            <input v-model="form.emotionPrimary" type="text" placeholder="例如：焦虑、平静、委屈" />
          </label>
          <label class="field">
            <span>强度 1-10</span>
            <input v-model.number="form.intensity" type="number" min="1" max="10" />
          </label>
        </div>

        <label class="field">
          <span>情绪记录内容</span>
          <textarea
            v-model="form.rawText"
            class="diary-textarea"
            placeholder="写下今天发生了什么、你最明显的情绪是什么、身体上有什么反应。"
          ></textarea>
        </label>

        <div class="editor-actions">
          <button class="btn btn-primary" :disabled="saving || !canSubmit" @click="submitDiary">
            {{ saving ? '保存中...' : selectedDiaryId ? '保存修改' : '保存并识别' }}
          </button>
          <button
            class="btn btn-ghost"
            :disabled="recognizing || !selectedDiaryId || !form.rawText.trim()"
            @click="runRecognition"
          >
            {{ recognizing ? '识别中...' : '重新识别' }}
          </button>
          <button class="btn btn-ghost" :disabled="deleting || !selectedDiaryId" @click="removeDiary">
            {{ deleting ? '删除中...' : '删除' }}
          </button>
        </div>

        <div v-if="saveMessage" class="status-card status-info">
          {{ saveMessage }}
        </div>
      </div>

      <div class="growth-card">
        <div class="section-head compact">
          <div>
            <h2>识别结果与即时建议</h2>
            <p class="hint">识别会在保存日记时自动执行，也可以手动再次触发。</p>
          </div>
        </div>

        <div v-if="recognitionError" class="status-card status-error">
          {{ recognitionError }}
        </div>

        <div v-if="recognition" class="analysis-grid">
          <div class="metric-card">
            <span class="metric-label">主情绪</span>
            <strong>{{ recognition.emotionPrimary || '待确认' }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">次情绪</span>
            <strong>{{ recognition.emotionSecondary || '未识别' }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">强度</span>
            <strong>{{ recognition.intensity || '-' }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">压力等级</span>
            <strong>{{ recognition.stressLevel || '-' }}</strong>
          </div>

          <div class="analysis-block">
            <h3>情绪摘要</h3>
            <p>{{ recognition.summary || '暂无摘要' }}</p>
          </div>
          <div class="analysis-block">
            <h3>触发事件</h3>
            <p>{{ recognition.triggerEvent || '暂无明确触发事件' }}</p>
          </div>
          <div class="analysis-block">
            <h3>身体反应</h3>
            <p>{{ recognition.bodyResponse || '暂无明显身体反应描述' }}</p>
          </div>
          <div class="analysis-block comfort-block">
            <h3>即时安慰</h3>
            <p>{{ recognition.comfortMessage || '你已经在认真面对自己的感受。' }}</p>
          </div>

          <div class="analysis-block full">
            <h3>建议行动</h3>
            <ul class="suggestion-list">
              <li v-for="(item, index) in recognition.suggestions || []" :key="index">
                {{ item }}
              </li>
            </ul>
          </div>
        </div>

        <div v-else class="empty-state">
          还没有识别结果。保存一条日记后，这里会显示结构化情绪分析和即时建议。
        </div>
      </div>

      <div class="growth-card">
        <div class="section-head compact">
          <div>
            <h2>下一步能力</h2>
            <p class="hint">当前页面已经接上日记与识别接口，后续按后端节奏继续补齐即可。</p>
          </div>
        </div>
        <ul class="next-step-list">
          <li>基础成长规划：接 `plans/generate` 后展示目标、行动清单和检查点。</li>
          <li>趋势分析：接 `trends` 后展示情绪分布、强度走势和高频触发事件。</li>
          <li>画像摘要：接 `profile` 后展示最近 30 天的长期模式总结。</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  createEmotionDiary,
  deleteEmotionDiary,
  listEmotionDiaries,
  recognizeEmotion,
  updateEmotionDiary
} from '../api/emotionApp';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

const today = new Date();
const currentYear = ref(today.getFullYear());
const currentMonth = ref(today.getMonth());
const selectedDate = ref(formatDate(today));

const diaries = ref([]);
const loadingDay = ref(false);
const dayError = ref('');

const selectedDiaryId = ref(null);
const saving = ref(false);
const deleting = ref(false);
const recognizing = ref(false);
const saveMessage = ref('');
const recognitionError = ref('');
const recognition = ref(null);

const form = reactive(createEmptyForm(selectedDate.value));

function createEmptyForm(dateStr) {
  return {
    chatId: '',
    recordDate: dateStr,
    rawText: '',
    emotionPrimary: '',
    intensity: 5
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    const date = daysInPrevMonth - i;
    const d = new Date(year, month - 1, date);
    cells.push({
      key: `p-${date}`,
      date,
      currentMonth: false,
      dateStr: formatDate(d)
    });
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateObj = new Date(year, month, d);
    cells.push({
      key: `c-${d}`,
      date: d,
      currentMonth: true,
      dateStr: formatDate(dateObj)
    });
  }

  const totalCells = 42;
  const remaining = totalCells - cells.length;
  for (let d = 1; d <= remaining; d += 1) {
    const dateObj = new Date(year, month + 1, d);
    cells.push({
      key: `n-${d}`,
      date: d,
      currentMonth: false,
      dateStr: formatDate(dateObj)
    });
  }

  return cells;
}

const calendarCells = computed(() => buildCalendar(currentYear.value, currentMonth.value));
const currentDiaries = computed(() => diaries.value.filter((item) => item.recordDate === selectedDate.value));
const canSubmit = computed(() => Boolean(form.rawText.trim() && form.recordDate));

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value -= 1;
  } else {
    currentMonth.value -= 1;
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value += 1;
  } else {
    currentMonth.value += 1;
  }
}

function isSelected(dateStr) {
  return selectedDate.value === dateStr;
}

function hasDiary(dateStr) {
  return diaries.value.some((item) => item.recordDate === dateStr);
}

function getDiaryTag(dateStr) {
  const match = diaries.value.find((item) => item.recordDate === dateStr);
  return match?.emotionPrimary || '已记录';
}

function selectDate(dateStr) {
  selectedDate.value = dateStr;
  if (!selectedDiaryId.value) {
    form.recordDate = dateStr;
  }
}

async function loadAllDiaries() {
  try {
    const res = await listEmotionDiaries();
    diaries.value = Array.isArray(res.data) ? res.data : [];
    dayError.value = '';
  } catch (error) {
    console.error(error);
    dayError.value = error?.response?.data?.message || '加载日记失败，请检查后端接口是否正常。';
  }
}

async function loadSelectedDate() {
  loadingDay.value = true;
  try {
    const res = await listEmotionDiaries({ date: selectedDate.value });
    const dayList = Array.isArray(res.data) ? res.data : [];
    const otherDays = diaries.value.filter((item) => item.recordDate !== selectedDate.value);
    diaries.value = [...otherDays, ...dayList].sort((a, b) => {
      const left = new Date(b.updatedAt || b.createdAt || b.recordDate).getTime();
      const right = new Date(a.updatedAt || a.createdAt || a.recordDate).getTime();
      return left - right;
    });
    dayError.value = '';
  } catch (error) {
    console.error(error);
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

function pickDiary(item) {
  selectedDiaryId.value = item.id;
  selectedDate.value = item.recordDate;
  applyDiaryToForm(item);
  recognition.value = item.recognition || buildRecognitionFromDiary(item);
  recognitionError.value = '';
  saveMessage.value = '';
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
  if (index >= 0) {
    diaries.value.splice(index, 1, item);
  } else {
    diaries.value.unshift(item);
  }
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
    const res = selectedDiaryId.value
      ? await updateEmotionDiary(selectedDiaryId.value, payload)
      : await createEmotionDiary(payload);

    const diary = res.data;
    upsertDiary(diary);
    selectedDiaryId.value = diary.id;
    selectedDate.value = diary.recordDate;
    applyDiaryToForm(diary);
    recognition.value = diary.recognition || buildRecognitionFromDiary(diary);
    saveMessage.value = selectedDiaryId.value
      ? '日记已保存，并同步完成情绪识别。'
      : '日记已创建，并完成情绪识别。';
  } catch (error) {
    console.error(error);
    recognitionError.value = error?.response?.data?.message || '保存失败，请检查后端服务或数据库状态。';
  } finally {
    saving.value = false;
  }
}

async function runRecognition() {
  if (!selectedDiaryId.value || !form.rawText.trim()) return;
  recognizing.value = true;
  recognitionError.value = '';
  try {
    const res = await recognizeEmotion({
      diaryId: selectedDiaryId.value,
      text: form.rawText.trim()
    });
    recognition.value = res.data;
    saveMessage.value = '已重新完成情绪识别。';

    const index = diaries.value.findIndex((item) => item.id === selectedDiaryId.value);
    if (index >= 0) {
      diaries.value[index] = {
        ...diaries.value[index],
        emotionPrimary: res.data?.emotionPrimary || diaries.value[index].emotionPrimary,
        emotionSecondary: res.data?.emotionSecondary || diaries.value[index].emotionSecondary,
        intensity: res.data?.intensity || diaries.value[index].intensity,
        triggerEvent: res.data?.triggerEvent || diaries.value[index].triggerEvent,
        bodyResponse: res.data?.bodyResponse || diaries.value[index].bodyResponse,
        aiSummary: res.data?.summary || diaries.value[index].aiSummary,
        recognition: res.data
      };
    }
  } catch (error) {
    console.error(error);
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
  } catch (error) {
    console.error(error);
    recognitionError.value = error?.response?.data?.message || '删除失败，请稍后重试。';
  } finally {
    deleting.value = false;
  }
}

watch(selectedDate, () => {
  if (!selectedDiaryId.value) {
    form.recordDate = selectedDate.value;
  }
});

watch([currentYear, currentMonth], async () => {
  await loadAllDiaries();
});

onMounted(async () => {
  await loadAllDiaries();
  await loadSelectedDate();
});
</script>

<style scoped>
.growth-page-v2 {
  align-items: start;
}

.growth-workspace {
  display: grid;
  gap: 16px;
}

.growth-card {
  border-radius: 18px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 16px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.section-head.compact {
  margin-bottom: 12px;
}

.section-head h2,
.section-head h3 {
  margin: 0;
}

.user-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 12px;
  font-weight: 600;
}

.diary-item.active {
  outline: 1px solid #3b82f6;
  background: #eff6ff;
}

.day-cell.has-diary {
  background: #f8fafc;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.field span {
  font-weight: 600;
}

.field input,
.diary-textarea {
  width: 100%;
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  color: #0f172a;
  background: #fff;
}

.field input:focus,
.diary-textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.diary-textarea {
  min-height: 136px;
  resize: vertical;
}

.editor-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.status-card {
  margin-top: 12px;
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.5;
}

.status-info {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.status-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.metric-card,
.analysis-block {
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  padding: 14px;
}

.metric-card strong {
  display: block;
  margin-top: 6px;
  font-size: 20px;
  color: #0f172a;
}

.metric-label {
  font-size: 12px;
  color: #64748b;
}

.analysis-block h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.analysis-block p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #334155;
  white-space: pre-wrap;
}

.analysis-block.full {
  grid-column: 1 / -1;
}

.comfort-block {
  background: linear-gradient(135deg, #fff7ed, #fffbeb);
  border-color: #fed7aa;
}

.suggestion-list,
.next-step-list {
  margin: 0;
  padding-left: 18px;
  color: #334155;
}

.suggestion-list li,
.next-step-list li {
  margin-bottom: 8px;
  line-height: 1.6;
}

.empty-state {
  border-radius: 16px;
  padding: 16px;
  background: #fff;
  border: 1px dashed #cbd5e1;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.diary-meta {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #64748b;
}

@media (max-width: 960px) {
  .form-grid,
  .analysis-grid {
    grid-template-columns: 1fr;
  }
}
</style>
