import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

export const dataAPI = {
  getCategories: () => api.get('/data/categories'),
  getPreview: (category) => api.get(`/data/preview/${category}`),
  getDailyRequirements: () => api.get('/data/daily-requirements'),
  getDailyUploadedData: (category, dayOfWeek, date) => api.get('/data/daily-data', { params: { category, dayOfWeek, date } }),
};

export const purchaseAPI = {
  createRequest: (data) => api.post('/purchase/request', data),
  getRequests: () => api.get('/purchase/requests'),
  getPurchased: () => api.get('/purchase/purchased'),
  generatePayment: (requestId) => api.post('/purchase/payment', { requestId }),
  confirmPayment: (data) => api.post('/purchase/payment/success', data),
};

export const adminAPI = {
  getUsers: (params) => api.get('/admin/users', { params }),
  updateUserStatus: (userId, status) => api.put(`/admin/users/${userId}`, { status }),
  bulkBlock: (userIds) => api.put('/admin/users/bulk/block', { userIds }),
  bulkUnblock: (userIds) => api.put('/admin/users/bulk/unblock', { userIds }),
  bulkDelete: (userIds) => api.delete('/admin/users/bulk/delete', { data: { userIds } }),
  getPurchaseRequests: (params) => api.get('/admin/purchase-requests', { params }),
  updatePurchaseRequest: (id, status) => api.put(`/admin/purchase-requests/${id}`, { status }),
  bulkDeletePurchaseRequests: (requestIds) => api.delete('/admin/purchase-requests/bulk/delete', { data: { requestIds } }),
  getAnalytics: () => api.get('/admin/analytics'),
  uploadData: (formData) => api.post('/data/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getDataItems: () => api.get('/admin/data-items'),
  getDataItemsByCategory: (category) => api.get(`/admin/data-items/category/${category}`),
  updateDataItemPrice: (id, price) => api.put(`/admin/data-items/${id}/price`, { price }),
  getCategories: () => api.get('/admin/categories'),
  updateCategory: (categoryId, data) => api.put(`/admin/categories/${categoryId}`, data),
  getFixedCategories: () => api.get('/admin/categories/fixed'),
  createFixedCategory: (data) => api.post('/admin/categories/fixed', data),
  updateFixedCategory: (id, data) => api.put(`/admin/categories/fixed/${id}`, data),
  deleteFixedCategory: (id) => api.delete(`/admin/categories/fixed/${id}`),
  deleteCategoryData: (id) => api.delete(`/admin/categories/fixed/${id}/data`),
  getUserProfile: (userId) => api.get(`/profile/${userId}`),
  updateUserProfile: (userId, data) => api.put(`/profile/${userId}`, data),
  updateUserPassword: (userId, newPassword) => api.put(`/profile/${userId}/password`, { newPassword }),
  getAllUsers: () => api.get('/profile'),
  setDailyRequirements: (data) => api.post('/admin/daily-requirements', data),
  getDailyRequirements: (params) => api.get('/admin/daily-requirements', { params }),
  uploadDailyData: (data) => api.post('/admin/daily-data/upload', data),
};

export const userAPI = {
  getProfile: () => api.get('/profile/me'),
  updateProfile: (data) => api.put('/profile/me', data),
};

export default api;
