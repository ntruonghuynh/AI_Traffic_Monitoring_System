(function attachApiClient(global) {
  'use strict';

  class ApiError extends Error {
    constructor(statusCode, message, payload) {
      super(message || 'Đã xảy ra lỗi khi gọi API.');
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.payload = payload;
    }
  }

  function baseUrl() {
    const value = global.APP_CONFIG && global.APP_CONFIG.API_BASE_URL;
    if (typeof value !== 'string' || !value.trim()) throw new Error('Thiếu API_BASE_URL trong js/config.js.');
    return value.trim().replace(/\/$/, '');
  }

  function getToken() {
    try { return global.sessionStorage.getItem('traffic-monitor-internal-token') || ''; }
    catch { return ''; }
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !options.rawBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (options.withToken) {
      const token = getToken();
      if (!token) throw new ApiError(401, 'Vui lòng nhập và lưu internal token ở thanh trên để tải ảnh hoặc gửi review.');
      headers.set('X-Internal-Token', token);
    }
    let response;
    try {
      const { rawBody, ...fetchOptions } = options;
      response = await global.fetch(`${baseUrl()}${path}`, { ...fetchOptions, headers, body: options.body === undefined ? undefined : rawBody ? options.body : JSON.stringify(options.body) });
    } catch (error) {
      throw new ApiError(0, error && error.message ? error.message : 'Không kết nối được API. Kiểm tra backend và CORS.');
    }
    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      let message = payload && payload.message;
      if (Array.isArray(message)) message = message.join('; ');
      if (typeof message !== 'string' || !message) message = response.statusText || 'Yêu cầu không thành công.';
      throw new ApiError(response.status, message, payload);
    }
    return response;
  }

  global.ApiClient = Object.freeze({
    getToken,
    async getJson(path, options = {}) {
      const response = await request(path, { method: 'GET', withToken: options.withToken === true, signal: options.signal });
      return response.json();
    },
    async getBlob(path) {
      const response = await request(path, { method: 'GET', withToken: true });
      return response.blob();
    },
    async postJson(path, body) {
      const response = await request(path, { method: 'POST', withToken: true, body });
      return response.json();
    },
    async postMultipart(path, formData) {
      const response = await request(path, { method: 'POST', withToken: true, body: formData, rawBody: true });
      return response.json();
    },
    async patchJson(path, body) {
      const response = await request(path, { method: 'PATCH', withToken: true, body });
      return response.json();
    },
    async deleteJson(path) {
      await request(path, { method: 'DELETE', withToken: true });
      return null;
    },
    async getHealth() {
      return this.getJson('/health');
    },
    ApiError,
  });
})(window);
