<template>
  <div class="page page-growth">
    <section class="growth-left">
      <h2>情绪日记</h2>
      <div class="calendar">
        <div class="calendar-header">
          <button class="btn btn-ghost" @click="prevMonth">&lt;</button>
          <div class="month-label">{{ currentYear }} 年 {{ currentMonth + 1 }} 月</div>
          <button class="btn btn-ghost" @click="nextMonth">&gt;</button>
        </div>
        <div class="calendar-grid">
          <div class="weekday" v-for="w in weekdays" :key="w">
            {{ w }}
          </div>
          <div
            v-for="cell in calendarCells"
            :key="cell.key"
            :class="[
              'day-cell',
              { 'other-month': !cell.currentMonth, active: isSelected(cell.dateStr) }
            ]"
            @click="selectDate(cell.dateStr)"
          >
            <div class="day-number">{{ cell.date }}</div>
            <div class="day-tag" v-if="hasDiary(cell.dateStr)">
              {{ getDiarySummary(cell.dateStr) }}
            </div>
          </div>
        </div>
      </div>

      <div class="diary-panel">
        <header class="diary-header">
          <h3> {{ selectedDateLabel }} 的情绪记录</h3>
          <button class="btn btn-primary btn-small" @click="addDiary">
            新增记录
          </button>
        </header>
        <div v-if="currentDiaries.length === 0" class="diary-empty">
          今日还没有记录，可以先从一句简单的感受开始。
        </div>
        <ul v-else class="diary-list">
          <li v-for="(item, idx) in currentDiaries" :key="idx" class="diary-item">
            <div class="diary-top">
              <span class="emotion">{{ item.emotion }}</span>
              <span class="time">{{ item.time }}</span>
            </div>
            <div class="diary-content">
              {{ item.text }}
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section class="growth-right">
      <h2>基础成长规划</h2>
      <p class="hint">
        可以简单描述你最近的状态、困扰或想要改变的方向，系统会结合你的聊天记录给出一个基础成长建议。
      </p>

      <textarea
        v-model="planInput"
        class="plan-input"
        placeholder="例如：我最近总是容易焦虑，晚上睡不着，白天没精神，希望能调整作息和情绪。"
      ></textarea>

      <div class="plan-actions">
        <button
          class="btn btn-primary"
          :disabled="generating || !planInput.trim()"
          @click="generatePlan"
        >
          {{ generating ? '生成中...' : '生成成长规划' }}
        </button>
      </div>

      <div class="plan-result" v-if="planResult">
        <h3>AI 给你的基础成长建议</h3>
        <pre class="plan-text">{{ planResult }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { chatWithReport } from '../api/emotionApp';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

const today = new Date();
const currentYear = ref(today.getFullYear());
const currentMonth = ref(today.getMonth());
const selectedDate = ref(formatDate(today));

const diaries = reactive({});

const planInput = ref('');
const planResult = ref('');
const generating = ref(false);
const chatIdForPlan = ref('growth-plan');

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const buildCalendar = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const date = daysInPrevMonth - i;
    const d = new Date(year, month - 1, date);
    cells.push({
      key: `p-${date}`,
      date,
      currentMonth: false,
      dateStr: formatDate(d)
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
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
  for (let d = 1; d <= remaining; d++) {
    const dateObj = new Date(year, month + 1, d);
    cells.push({
      key: `n-${d}`,
      date: d,
      currentMonth: false,
      dateStr: formatDate(dateObj)
    });
  }

  return cells;
};

const calendarCells = ref(buildCalendar(currentYear.value, currentMonth.value));

watch([currentYear, currentMonth], ([y, m]) => {
  calendarCells.value = buildCalendar(y, m);
});

const prevMonth = () => {
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value -= 1;
  } else {
    currentMonth.value -= 1;
  }
};

const nextMonth = () => {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value += 1;
  } else {
    currentMonth.value += 1;
  }
};

const isSelected = (dateStr) => selectedDate.value === dateStr;

const selectDate = (dateStr) => {
  selectedDate.value = dateStr;
};

const hasDiary = (dateStr) => {
  const list = diaries[dateStr];
  return list && list.length > 0;
};

const getDiarySummary = (dateStr) => {
  const list = diaries[dateStr];
  if (!list || list.length === 0) return '';
  return list[list.length - 1].emotion;
};

const currentDiaries = computed(() => diaries[selectedDate.value] || []);

const selectedDateLabel = computed(() => selectedDate.value);

const addDiary = () => {
  const emotion = window.prompt('此刻你的情绪是？例如：平静、焦虑、开心...');
  if (!emotion) return;
  const text = window.prompt('简单记录一下发生了什么，或者你此刻的想法：');
  if (!text) return;

  const entry = {
    emotion,
    text,
    time: new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  };
  if (!diaries[selectedDate.value]) {
    diaries[selectedDate.value] = [];
  }
  diaries[selectedDate.value].push(entry);
  saveDiaries();
};

const saveDiaries = () => {
  localStorage.setItem('emotion_diaries', JSON.stringify(diaries));
};

const loadDiaries = () => {
  const raw = localStorage.getItem('emotion_diaries');
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    Object.keys(data).forEach((k) => {
      diaries[k] = data[k];
    });
  } catch (e) {
    console.error('Failed to parse diaries from localStorage', e);
  }
};

const generatePlan = async () => {
  const message = planInput.value.trim();
  if (!message) return;
  generating.value = true;
  planResult.value = '';

  try {
    const res = await chatWithReport(message, chatIdForPlan.value);
    const report = res.data;
    if (report) {
      if (typeof report === 'string') {
        planResult.value = report;
      } else if (report.content) {
        planResult.value = report.content;
      } else {
        planResult.value = JSON.stringify(report, null, 2);
      }
    } else {
      planResult.value = '未能获取到有效的成长规划内容。';
    }
  } catch (e) {
    console.error(e);
    planResult.value = '请求失败，请稍后重试。';
  } finally {
    generating.value = false;
  }
};

onMounted(() => {
  loadDiaries();
});
</script>

