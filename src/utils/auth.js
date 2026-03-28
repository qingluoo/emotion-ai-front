import { reactive } from 'vue';

const TOKEN_NAME_KEY = 'emotion_token_name';
const TOKEN_VALUE_KEY = 'emotion_token_value';
const USER_KEY = 'emotion_current_user';

export const authState = reactive({
  user: readStoredUser()
});

export function saveAuth(authResponse) {
  if (!authResponse) return;
  localStorage.setItem(TOKEN_NAME_KEY, authResponse.tokenName || 'satoken');
  localStorage.setItem(TOKEN_VALUE_KEY, authResponse.tokenValue || '');
  const user = {
    userId: authResponse.userId,
    username: authResponse.username,
    nickname: authResponse.nickname
  };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  authState.user = user;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_NAME_KEY);
  localStorage.removeItem(TOKEN_VALUE_KEY);
  localStorage.removeItem(USER_KEY);
  authState.user = null;
}

export function getTokenName() {
  return localStorage.getItem(TOKEN_NAME_KEY) || 'satoken';
}

export function getTokenValue() {
  return localStorage.getItem(TOKEN_VALUE_KEY) || '';
}

export function getStoredUser() {
  return authState.user;
}

function readStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(getTokenValue());
}
