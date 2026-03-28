import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Chat from '../views/Chat.vue';
import Growth from '../views/Growth.vue';
import Auth from '../views/Auth.vue';
import { isLoggedIn } from '../utils/auth';

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/auth', name: 'auth', component: Auth },
  { path: '/chat', name: 'chat', component: Chat },
  { path: '/growth', name: 'growth', component: Growth }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  const requiresAuth = ['/chat', '/growth'].includes(to.path);
  if (requiresAuth && !isLoggedIn()) {
    return '/auth';
  }
  if (to.path === '/auth' && isLoggedIn()) {
    return '/growth';
  }
  return true;
});

export default router;

