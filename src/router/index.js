import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Chat from '../views/Chat.vue';
import Growth from '../views/Growth.vue';

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/chat', name: 'chat', component: Chat },
  { path: '/growth', name: 'growth', component: Growth }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;

