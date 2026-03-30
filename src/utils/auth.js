import { reactive } from 'vue';

const TOKEN_NAME_KEY = 'emotion_token_name';
const TOKEN_VALUE_KEY = 'emotion_token_value';
const USER_KEY = 'emotion_current_user';
const AUTH_STORAGE = window.sessionStorage;
const LEGACY_STORAGE = window.localStorage;

export const authState = reactive({
  user: readStoredUser()
});

export function saveAuth(authResponse) {
  if (!authResponse) return;
  AUTH_STORAGE.setItem(TOKEN_NAME_KEY, authResponse.tokenName || 'satoken');
  AUTH_STORAGE.setItem(TOKEN_VALUE_KEY, authResponse.tokenValue || '');
  const user = {
    userId: authResponse.userId,
    username: authResponse.username,
    nickname: authResponse.nickname
  };
  AUTH_STORAGE.setItem(USER_KEY, JSON.stringify(user));
  LEGACY_STORAGE.removeItem(TOKEN_NAME_KEY);
  LEGACY_STORAGE.removeItem(TOKEN_VALUE_KEY);
  LEGACY_STORAGE.removeItem(USER_KEY);
  authState.user = user;
}

export function clearAuth() {
  AUTH_STORAGE.removeItem(TOKEN_NAME_KEY);
  AUTH_STORAGE.removeItem(TOKEN_VALUE_KEY);
  AUTH_STORAGE.removeItem(USER_KEY);
  LEGACY_STORAGE.removeItem(TOKEN_NAME_KEY);
  LEGACY_STORAGE.removeItem(TOKEN_VALUE_KEY);
  LEGACY_STORAGE.removeItem(USER_KEY);
  authState.user = null;
}

export function getTokenName() {
  return AUTH_STORAGE.getItem(TOKEN_NAME_KEY) || LEGACY_STORAGE.getItem(TOKEN_NAME_KEY) || 'satoken';
}

export function getTokenValue() {
  return AUTH_STORAGE.getItem(TOKEN_VALUE_KEY) || LEGACY_STORAGE.getItem(TOKEN_VALUE_KEY) || '';
}

export function appendTokenParams(params) {
  const tokenValue = getTokenValue();
  if (!tokenValue) {
    return params;
  }
  params.set(getTokenName(), tokenValue);
  return params;
}

export function getStoredUser() {
  return authState.user;
}

function readStoredUser() {
  const raw = AUTH_STORAGE.getItem(USER_KEY) || LEGACY_STORAGE.getItem(USER_KEY);
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
