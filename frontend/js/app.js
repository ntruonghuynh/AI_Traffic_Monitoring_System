(function startApp() {
  'use strict';

  const ICONS = {
    grid: [['rect', 3, 3, 7, 7], ['rect', 14, 3, 7, 7], ['rect', 3, 14, 7, 7], ['rect', 14, 14, 7, 7]],
    list: [['path', 'M9 6h11M9 12h11M9 18h11'], ['circle', 4, 6, 1], ['circle', 4, 12, 1], ['circle', 4, 18, 1]],
    video: [['rect', 3, 5, 13, 14, 2], ['path', 'm16 10 5-3v10l-5-3z']],
    camera: [['path', 'M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z'], ['circle', 12, 13, 3]],
    settings: [['circle', 12, 12, 3], ['path', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.2l-.2.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.5-1.1h-.2l-2.9-1.7.1-.2a1.7 1.7 0 0 0-.2-1.8l-.1-.2v-3.4l.2-.1a1.7 1.7 0 0 0 1.1-1.5v-.2l1.7-2.9.2.1a1.7 1.7 0 0 0 1.8-.2l.2-.1h3.4l.1.2a1.7 1.7 0 0 0 1.5 1.1h.2l2.9 1.7-.1.2a1.7 1.7 0 0 0 .2 1.8l.1.2v3.4Z']],
    refresh: [['path', 'M20 7v5h-5'], ['path', 'M4 17v-5h5'], ['path', 'M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2']],
    'chevron-left': [['path', 'm14 18-6-6 6-6']],
    'chevron-right': [['path', 'm10 18 6-6-6-6']],
    info: [['circle', 12, 12, 9], ['path', 'M12 11v5M12 8h.01']],
    check: [['path', 'm5 12 4 4L19 6']],
    close: [['path', 'm6 6 12 12M18 6 6 18']],
    image: [['rect', 3, 3, 18, 18, 2], ['circle', 8.5, 8.5, 1.5], ['path', 'm21 15-5-5L5 21']],
    edit: [['path', 'm12 20 8-8'], ['path', 'm16 5 3 3'], ['path', 'm4 20 4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z']],
    trash: [['path', 'M4 7h16'], ['path', 'M10 11v6M14 11v6'], ['path', 'm5 7 1 13h12l1-13M9 7V4h6v3']],
  };

  function renderIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((host) => {
      const name = host.getAttribute('data-icon');
      const pieces = ICONS[name];
      if (!pieces) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      for (const [type, ...args] of pieces) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', type);
        if (type === 'path') node.setAttribute('d', args[0]);
        if (type === 'rect') {
          node.setAttribute('x', args[0]); node.setAttribute('y', args[1]);
          node.setAttribute('width', args[2]); node.setAttribute('height', args[3]);
          if (args[4]) node.setAttribute('rx', args[4]);
        }
        if (type === 'circle') { node.setAttribute('cx', args[0]); node.setAttribute('cy', args[1]); node.setAttribute('r', args[2]); }
        svg.append(node);
      }
      host.replaceChildren(svg);
    });
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function toggleButtonLoading(button, isLoading) {
    const classes = new Set(String(button.className || '').split(/\s+/).filter(Boolean));
    if (isLoading) classes.add('is-loading');
    else classes.delete('is-loading');
    button.className = [...classes].join(' ');
  }

  function emptyStateIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('class', 'empty-state-icon');
    svg.setAttribute('aria-hidden', 'true');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '16'); circle.setAttribute('cy', '16'); circle.setAttribute('r', '11');
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', 'currentColor'); circle.setAttribute('stroke-width', '1.8');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M11 16h10M16 11v10'); path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-width', '1.8');
    svg.append(circle, path);
    return svg;
  }

  function addFeedback(container, title, message, type = 'info', statusCode = null, retry) {
    container.replaceChildren();
    const evidenceAuthError = container.id === 'evidence-content' && type === 'error' && (statusCode === 401 || statusCode === 403);
    const isLoading = type === 'info' && title.startsWith('Đang tải');
    const isEmpty = type === 'info' && /^(Chưa có|Không có)/.test(title);
    const box = make('div', `feedback-box${type === 'error' ? ' is-error' : ''}${evidenceAuthError ? ' evidence-auth-error' : ''}${isLoading ? ' is-loading' : ''}${isEmpty ? ' is-empty-state' : ''}`);
    if (isEmpty) box.append(emptyStateIcon());
    const copy = make('div');
    if (title) copy.append(make('strong', '', title));
    const statusPrefix = statusCode ? `HTTP ${statusCode} · ` : '';
    copy.append(make('p', '', `${statusPrefix}${message}`));
    box.append(copy);
    if (isLoading) {
      const skeleton = make('span', 'feedback-skeleton');
      skeleton.setAttribute('aria-hidden', 'true');
      box.append(skeleton);
    }
    if (retry) {
      const button = make('button', 'button button-secondary button-small', 'Thử lại');
      button.type = 'button'; button.addEventListener('click', retry); box.append(button);
    }
    container.append(box);
  }

  function errorMessage(error) {
    const message = error && error.message ? error.message : 'Đã xảy ra lỗi không xác định.';
    return { statusCode: Number.isInteger(error && error.statusCode) ? error.statusCode : null, message };
  }

  function reviewLabel(status) {
    const labels = { PENDING_REVIEW: 'Chờ xác minh', VERIFIED_CROSSING: 'Đã xác minh', REJECTED_CANDIDATE: 'Đã từ chối' };
    return labels[status] || status || 'Chưa rõ';
  }

  function reviewTone(status) {
    if (status === 'VERIFIED_CROSSING') return 'status-green';
    if (status === 'REJECTED_CANDIDATE') return 'status-red';
    if (status === 'PENDING_REVIEW') return 'status-yellow';
    return 'status-neutral';
  }

  function statusBadge(status) {
    return make('span', `status-badge ${reviewTone(status)}`, reviewLabel(status));
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function confidenceText(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${(value * 100).toFixed(1)}%`;
  }

  function isLowConfidence(value) {
    return typeof value === 'number' && Number.isFinite(value) && value < 0.5;
  }

  function confidenceValue(value) {
    return make('span', `confidence-value${isLowConfidence(value) ? ' confidence-low' : ' confidence-normal'}`, confidenceText(value));
  }

  function wireToken() {
    const input = document.getElementById('token-field');
    const save = document.getElementById('save-token');
    if (!input || !save) return;
    input.value = ApiClient.getToken();
    save.addEventListener('click', () => {
      const token = input.value.trim();
      try {
        if (token) sessionStorage.setItem('traffic-monitor-internal-token', token);
        else sessionStorage.removeItem('traffic-monitor-internal-token');
        save.textContent = token ? 'Đã lưu' : 'Đã xóa';
        window.dispatchEvent(new Event('internal-token-change'));
        globalThis.setTimeout(() => { save.textContent = 'Lưu token'; }, 1400);
      } catch {
        save.textContent = 'Không lưu được';
      }
    });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); save.click(); } });
  }

  function trackStickyHeaderHeight() {
    const header = document.querySelector('.topbar');
    if (!header) return;
    const updateHeight = () => {
      document.documentElement.style.setProperty('--sticky-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };
    updateHeight();
    if (typeof ResizeObserver === 'function') new ResizeObserver(updateHeight).observe(header);
    window.addEventListener('resize', updateHeight, { passive: true });
  }

  async function checkHealth() {
    const status = document.getElementById('system-status');
    if (!status) return;
    const dot = status.querySelector('.status-dot');
    const label = status.querySelector('.system-label');
    try {
      const result = await ApiClient.getHealth();
      const healthy = result && result.status === 'ok' && result.alive !== false;
      dot.className = `status-dot ${healthy ? 'is-healthy' : 'is-unhealthy'}`;
      label.textContent = healthy ? 'Hệ thống hoạt động' : 'Hệ thống cần kiểm tra';
      status.title = result && result.ready === false ? 'Ứng dụng đang hoạt động, readiness chưa sẵn sàng.' : '';
    } catch (error) {
      const details = errorMessage(error);
      dot.className = `status-dot ${details.statusCode === 0 ? 'is-unhealthy' : 'is-unhealthy'}`;
      label.textContent = details.statusCode ? `API lỗi ${details.statusCode}` : 'Không kết nối API';
      status.title = details.message;
    }
  }

  function appendPlate(cell, event) {
    if (event.plateNumber !== null && event.plateNumber !== undefined && event.plateNumber !== '') {
      cell.append(make('span', 'plate-badge', event.plateNumber));
      return;
    }
    const group = make('span');
    group.append(make('span', 'plate-badge plate-unreadable', 'Không đọc được'));
    if (event.plateRawText) group.append(make('span', 'plate-raw', `OCR: ${event.plateRawText}`));
    cell.append(group);
  }

  function buildEventRow(event) {
    const row = make('tr');
    const idCell = make('td');
    const link = make('a', 'event-link mono', event.id || '—');
    link.href = `violation.html?id=${encodeURIComponent(event.id || '')}`;
    link.title = event.id || '';
    idCell.append(link);
    const time = make('td', '', formatDate(event.createdAt));
    const videoTime = make('td', 'mono', typeof event.timestampSeconds === 'number' && Number.isFinite(event.timestampSeconds) ? event.timestampSeconds.toFixed(3) : '—');
    const vehicle = make('td', '', event.vehicleType || '—');
    const plate = make('td'); appendPlate(plate, event);
    const confidence = make('td'); confidence.append(confidenceValue(event.confidence));
    const review = make('td'); review.append(statusBadge(event.reviewStatus));
    row.append(idCell, time, videoTime, vehicle, plate, confidence, review);
    return row;
  }

  function readFilters(form) {
    const values = new FormData(form);
    const filters = {};
    for (const key of ['reviewStatus', 'vehicleType', 'plateNumber', 'from', 'to', 'minConfidence', 'hasPlate', 'cameraId', 'jobId', 'videoId']) {
      let value = String(values.get(key) || '').trim();
      if ((key === 'from' || key === 'to') && value) {
        const localDate = new Date(`${value}T${key === 'from' ? '00:00:00.000' : '23:59:59.999'}`);
        if (!Number.isNaN(localDate.getTime())) value = localDate.toISOString();
      }
      if (value) filters[key] = value;
    }
    return filters;
  }

  function dashboardDateBound(value, isEnd) {
    if (!value) return '';
    const date = new Date(`${value}T${isEnd ? '23:59:59.999' : '00:00:00.000'}Z`);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function formatUtcDayLabel(key) {
    if (key === null) return '—';
    const match = typeof key === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
    return match ? `${match[3]}/${match[2]}` : String(key);
  }

  function dashboardStatsPath(groupBy, from, to) {
    const query = new URLSearchParams({ groupBy });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    return `/stats/events?${query.toString()}`;
  }

  function dashboardChartModel(payload, groupBy, error = null) {
    if (error) return { state: 'error', message: error.message || 'Không tải được dữ liệu biểu đồ.', items: [] };
    if (!payload || payload.groupBy !== groupBy || !Array.isArray(payload.items)) {
      return { state: 'error', message: 'Phản hồi biểu đồ không đúng cấu trúc API.', items: [] };
    }
    const items = [];
    for (const item of payload.items) {
      if (!item || (item.key !== null && typeof item.key !== 'string') || typeof item.count !== 'number' || !Number.isFinite(item.count)) {
        return { state: 'error', message: 'Phản hồi biểu đồ không đúng cấu trúc API.', items: [] };
      }
      items.push({ key: item.key, label: item.key === null ? '—' : item.key, count: item.count });
    }
    return { state: items.length ? 'ready' : 'empty', items };
  }

  function createSvgNode(name, attributes = {}, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function appendSvgText(svg, x, y, label, attributes = {}) {
    svg.append(createSvgNode('text', { x, y, ...attributes }, label));
  }

  function drawDailyChart(container, items) {
    const width = 840;
    const height = 320;
    const margin = { top: 18, right: 16, bottom: 76, left: 50 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maximum = Math.max(1, ...items.map((item) => item.count));
    const svg = createSvgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Biểu đồ số sự kiện theo ngày UTC' });
    const ticks = [...new Set([0, Math.round(maximum / 4), Math.round(maximum / 2), Math.round(maximum * 3 / 4), maximum])];
    for (const value of ticks) {
      const y = margin.top + plotHeight - plotHeight * value / maximum;
      svg.append(createSvgNode('line', { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: 'chart-grid-line' }));
      appendSvgText(svg, margin.left - 8, y + 4, value.toLocaleString('vi-VN'), { class: 'chart-axis-label', 'text-anchor': 'end' });
    }
    const slot = items.length ? plotWidth / items.length : plotWidth;
    items.forEach((item, index) => {
      const barWidth = Math.max(2, Math.min(24, slot * 0.62));
      const barHeight = plotHeight * item.count / maximum;
      const x = margin.left + slot * index + (slot - barWidth) / 2;
      const y = margin.top + plotHeight - barHeight;
      const bar = createSvgNode('rect', { x, y, width: barWidth, height: barHeight, rx: 3, class: 'chart-bar' });
      const originalKey = item.key === null ? 'null' : String(item.key);
      bar.append(createSvgNode('title', {}, `${originalKey}: ${item.count}`));
      svg.append(bar);
      const labelX = x + barWidth / 2;
      const labelY = height - margin.bottom + 17;
      const label = createSvgNode('text', { x: labelX, y: labelY, class: 'chart-axis-label', 'text-anchor': 'end', transform: `rotate(-45 ${labelX} ${labelY})` }, formatUtcDayLabel(item.key));
      label.append(createSvgNode('title', {}, originalKey));
      svg.append(label);
    });
    container.replaceChildren(svg);
  }

  function drawCategoryChart(container, items, groupBy) {
    const width = 840;
    const labelWidth = 190;
    const rightSpace = 52;
    const rowHeight = 38;
    const top = 14;
    const height = Math.max(130, top + items.length * rowHeight + 30);
    const plotWidth = width - labelWidth - rightSpace;
    const maximum = Math.max(1, ...items.map((item) => item.count));
    const svg = createSvgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': groupBy === 'vehicleType' ? 'Biểu đồ số sự kiện theo loại xe' : 'Biểu đồ số sự kiện theo trạng thái review' });
    const reviewLabels = { PENDING_REVIEW: 'Chờ xác minh', VERIFIED_CROSSING: 'Đã xác minh', REJECTED_CANDIDATE: 'Đã từ chối' };
    items.forEach((item, index) => {
      const y = top + index * rowHeight;
      const label = groupBy === 'reviewStatus' ? reviewLabels[item.label] || item.label : item.label;
      const axisLabel = createSvgNode('text', { x: labelWidth - 12, y: y + 17, class: 'chart-axis-label chart-category-label', 'text-anchor': 'end' }, label);
      axisLabel.append(createSvgNode('title', {}, item.key === null ? 'null' : item.key));
      svg.append(axisLabel);
      const barWidth = plotWidth * item.count / maximum;
      const bar = createSvgNode('rect', { x: labelWidth, y: y + 3, width: barWidth, height: 20, rx: 4, class: `chart-bar chart-bar-category-${index % 4}` });
      bar.append(createSvgNode('title', {}, `${item.label}: ${item.count}`));
      svg.append(bar);
      appendSvgText(svg, labelWidth + barWidth + 8, y + 18, item.count.toLocaleString('vi-VN'), { class: 'chart-value-label' });
    });
    container.replaceChildren(svg);
  }

  function dashboardMetric(label, value, note, tone = 'status-neutral', icon = 'grid', color = 'blue', prominent = false) {
    const card = make('article', prominent ? 'kpi-card kpi-card-primary' : 'kpi-card');
    const heading = make('div', 'kpi-card-heading');
    const iconChip = make('span', `kpi-icon-chip is-${color}`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const metricIcons = {
      list: [['path', 'M9 6h11M9 12h11M9 18h11'], ['circle', 4, 6, 1], ['circle', 4, 12, 1], ['circle', 4, 18, 1]],
      info: [['circle', 12, 12, 9], ['path', 'M12 11v5M12 8h.01']], check: [['path', 'm5 12 4 4L19 6']],
      close: [['path', 'm6 6 12 12M18 6 6 18']], settings: [['circle', 12, 12, 3]],
      refresh: [['path', 'M20 7v5h-5'], ['path', 'M4 17v-5h5']], video: [['rect', 3, 5, 13, 14, 2], ['path', 'm16 10 5-3v10l-5-3z']],
      camera: [['path', 'M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z'], ['circle', 12, 13, 3]],
    };
    for (const [type, ...args] of metricIcons[icon] || metricIcons.list) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', type);
      if (type === 'path') node.setAttribute('d', args[0]);
      if (type === 'rect') { node.setAttribute('x', args[0]); node.setAttribute('y', args[1]); node.setAttribute('width', args[2]); node.setAttribute('height', args[3]); if (args[4]) node.setAttribute('rx', args[4]); }
      if (type === 'circle') { node.setAttribute('cx', args[0]); node.setAttribute('cy', args[1]); node.setAttribute('r', args[2]); }
      svg.append(node);
    }
    iconChip.append(svg); heading.append(iconChip, make('span', 'kpi-label', label));
    card.append(heading, make('strong', 'kpi-value mono', value), make('span', `kpi-note ${tone}`, note));
    return card;
  }

  function dashboardMetricGroup(title, cards, className = '') {
    const group = make('section', `kpi-group ${className}`.trim());
    group.append(make('h3', 'kpi-group-title', title));
    const grid = make('div', 'kpi-group-grid'); grid.append(...cards); group.append(grid);
    return group;
  }

  function dashboardStatusLabel(status) {
    const labels = {
      PENDING_REVIEW: 'Chờ xác minh',
      VERIFIED_CROSSING: 'Đã xác minh',
      REJECTED_CANDIDATE: 'Đã từ chối',
      PENDING: 'Đang chờ',
      PROCESSING: 'Đang xử lý',
      COMPLETED: 'Hoàn tất',
      FAILED: 'Thất bại',
    };
    return labels[status] || status;
  }

  function renderDashboardOverview(container, data) {
    const review = data && data.events && data.events.byReviewStatus;
    const jobs = data && data.jobs && data.jobs.byStatus;
    const cameras = data && data.cameras;
    const cameraStatuses = cameras && cameras.byStatus;
    const cameraCount = (status) => typeof (cameraStatuses && cameraStatuses[status]) === 'number'
      ? cameraStatuses[status].toLocaleString('vi-VN')
      : '—';
    const metric = (value) => typeof value === 'number' ? value.toLocaleString('vi-VN') : '—';
    const eventsGroup = dashboardMetricGroup('Sự kiện', [
      dashboardMetric('TỔNG SỰ KIỆN', metric(data && data.events && data.events.total), 'Ứng viên phát hiện', 'status-neutral', 'list', 'blue', true),
      dashboardMetric('CHỜ XÁC MINH', metric(review && review.PENDING_REVIEW), dashboardStatusLabel('PENDING_REVIEW'), 'status-yellow', 'info', 'gold'),
      dashboardMetric('ĐÃ XÁC MINH', metric(review && review.VERIFIED_CROSSING), dashboardStatusLabel('VERIFIED_CROSSING'), 'status-green', 'check', 'teal'),
      dashboardMetric('ĐÃ TỪ CHỐI', metric(review && review.REJECTED_CANDIDATE), dashboardStatusLabel('REJECTED_CANDIDATE'), 'status-red', 'close', 'purple'),
    ], 'kpi-group-events');
    const jobsGroup = dashboardMetricGroup('Job', [
      dashboardMetric('TỔNG JOB', metric(data && data.jobs && data.jobs.total), 'Tiến trình xử lý', 'status-neutral', 'settings', 'blue'),
      dashboardMetric('JOB ĐANG CHỜ', metric(jobs && jobs.PENDING), dashboardStatusLabel('PENDING'), 'status-yellow', 'refresh', 'gold'),
      dashboardMetric('JOB ĐANG XỬ LÝ', metric(jobs && jobs.PROCESSING), dashboardStatusLabel('PROCESSING'), 'status-yellow', 'video', 'teal'),
      dashboardMetric('JOB HOÀN TẤT', metric(jobs && jobs.COMPLETED), dashboardStatusLabel('COMPLETED'), 'status-green', 'check', 'green'),
      dashboardMetric('JOB THẤT BẠI', metric(jobs && jobs.FAILED), dashboardStatusLabel('FAILED'), 'status-red', 'close', 'purple'),
    ], 'kpi-group-jobs');
    const systemGroup = dashboardMetricGroup('Hệ thống', [
      dashboardMetric('TỔNG VIDEO', metric(data && data.videos && data.videos.total), 'Video đã tải lên', 'status-neutral', 'video', 'teal'),
      dashboardMetric('CAMERA', metric(cameras && cameras.total), `Hoạt động ${cameraCount('ACTIVE')} · Không hoạt động ${cameraCount('INACTIVE')} · Bảo trì ${cameraCount('MAINTENANCE')}`, 'status-neutral', 'camera', 'purple'),
    ], 'kpi-group-system');
    container.replaceChildren(eventsGroup, jobsGroup, systemGroup);
    if (data.events.total === 0) container.append(make('p', 'kpi-empty-note', 'API hiện chưa có sự kiện.'));
  }

  function isDashboardOverview(data) {
    const counts = [
      data && data.events && data.events.total,
      data && data.events && data.events.byReviewStatus && data.events.byReviewStatus.PENDING_REVIEW,
      data && data.events && data.events.byReviewStatus && data.events.byReviewStatus.VERIFIED_CROSSING,
      data && data.events && data.events.byReviewStatus && data.events.byReviewStatus.REJECTED_CANDIDATE,
      data && data.jobs && data.jobs.total,
      data && data.jobs && data.jobs.byStatus && data.jobs.byStatus.PENDING,
      data && data.jobs && data.jobs.byStatus && data.jobs.byStatus.PROCESSING,
      data && data.jobs && data.jobs.byStatus && data.jobs.byStatus.COMPLETED,
      data && data.jobs && data.jobs.byStatus && data.jobs.byStatus.FAILED,
    ];
    return counts.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  }

  function initDashboard() {
    const kpis = document.getElementById('dashboard-kpis');
    const dateForm = document.getElementById('dashboard-date-filter');
    const eventsBody = document.getElementById('dashboard-events-body');
    const eventsFeedback = document.getElementById('dashboard-events-feedback');
    const charts = [
      { groupBy: 'day', container: document.getElementById('chart-day') },
      { groupBy: 'vehicleType', container: document.getElementById('chart-vehicle') },
      { groupBy: 'reviewStatus', container: document.getElementById('chart-review') },
    ];
    let dateRange = { from: '', to: '' };

    async function loadOverview() {
      kpis.replaceChildren();
      addFeedback(kpis, 'Đang tải chỉ số', 'Đang lấy số liệu tổng quan từ API.');
      try {
        const data = await ApiClient.getJson('/stats/overview');
        if (!isDashboardOverview(data)) throw new Error('Phản hồi overview không đúng cấu trúc API.');
        renderDashboardOverview(kpis, data);
      } catch (error) {
        const details = errorMessage(error);
        addFeedback(kpis, 'Không tải được chỉ số', `${details.message}${details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng nhập internal token.' : ''}`, 'error', details.statusCode, loadOverview);
      }
    }

    async function loadChart(chart) {
      chart.container.replaceChildren();
      addFeedback(chart.container, 'Đang tải biểu đồ', 'Đang lấy dữ liệu sự kiện từ API.');
      try {
        const url = dashboardStatsPath(chart.groupBy, dateRange.from, dateRange.to);
        const payload = await ApiClient.getJson(url);
        const model = dashboardChartModel(payload, chart.groupBy);
        if (model.state === 'error') { addFeedback(chart.container, 'Không tải được biểu đồ', model.message, 'error'); return; }
        if (model.state === 'empty') { addFeedback(chart.container, 'Chưa có dữ liệu', 'API không trả về sự kiện trong khoảng đã chọn.'); return; }
        if (chart.groupBy === 'day') drawDailyChart(chart.container, model.items);
        else drawCategoryChart(chart.container, model.items, chart.groupBy);
      } catch (error) {
        const details = errorMessage(error);
        addFeedback(chart.container, 'Không tải được biểu đồ', `${details.message}${details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng nhập internal token.' : ''}`, 'error', details.statusCode, () => loadChart(chart));
      }
    }

    async function loadRecentEvents() {
      eventsBody.replaceChildren();
      addFeedback(eventsFeedback, 'Đang tải sự kiện', 'Đang lấy 5 sự kiện mới nhất từ API.');
      try {
        const result = await ApiClient.getJson('/events?limit=5');
        const events = Array.isArray(result && result.data) ? result.data : [];
        eventsBody.replaceChildren(...events.map((event) => {
          const row = make('tr');
          const idCell = make('td');
          const link = make('a', 'event-link mono', event.id || '—');
          link.href = `violation.html?id=${encodeURIComponent(event.id || '')}`;
          link.title = event.id || '';
          idCell.append(link);
          const vehicle = make('td', '', event.vehicleType || '—');
          const plate = make('td');
          appendPlate(plate, event);
          const confidence = make('td');
          confidence.append(confidenceValue(event.confidence));
          const review = make('td');
          review.append(statusBadge(event.reviewStatus));
          row.append(idCell, vehicle, plate, confidence, review);
          return row;
        }));
        eventsFeedback.replaceChildren();
        if (!events.length) addFeedback(eventsFeedback, 'Chưa có sự kiện', 'API chưa trả về sự kiện nào.');
      } catch (error) {
        const details = errorMessage(error);
        addFeedback(eventsFeedback, 'Không tải được sự kiện', `${details.message}${details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng nhập internal token.' : ''}`, 'error', details.statusCode, loadRecentEvents);
      }
    }

    function loadAll() {
      loadOverview();
      charts.forEach(loadChart);
      loadRecentEvents();
    }

    dateForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = new FormData(dateForm);
      dateRange = {
        from: dashboardDateBound(String(values.get('from') || ''), false),
        to: dashboardDateBound(String(values.get('to') || ''), true),
      };
      charts.forEach(loadChart);
    });
    document.getElementById('dashboard-clear-dates').addEventListener('click', () => {
      dateForm.reset();
      dateRange = { from: '', to: '' };
      charts.forEach(loadChart);
    });
    document.getElementById('dashboard-refresh').addEventListener('click', loadAll);
    loadAll();
  }

  function initList() {
    const form = document.getElementById('filters-form');
    const body = document.getElementById('events-body');
    const feedback = document.getElementById('list-feedback');
    const count = document.getElementById('result-count');
    const summary = document.getElementById('page-summary');
    const current = document.getElementById('page-current');
    const previous = document.getElementById('previous-page');
    const next = document.getElementById('next-page');
    const size = document.getElementById('page-size');
    let page = 1;
    let limit = Number(size.value);
    let filters = {};
    let sequence = 0;
    const chips = document.getElementById('active-filter-chips');
    const filterLabels = { reviewStatus: 'Trạng thái', vehicleType: 'Loại xe', plateNumber: 'Biển số', minConfidence: 'Độ tin cậy phát hiện ≥', from: 'Từ ngày', to: 'Đến ngày', hasPlate: 'Có biển số', cameraId: 'Camera', jobId: 'Job', videoId: 'Video' };

    function renderFilterChips() {
      if (!chips) return;
      chips.replaceChildren();
      Object.entries(filters).forEach(([key, value]) => {
        const chip = make('span', 'filter-chip');
        chip.append(make('span', '', `${filterLabels[key] || key}: ${value}`));
        const remove = make('button', 'filter-chip-remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Bỏ bộ lọc ${filterLabels[key] || key}`);
        remove.addEventListener('click', () => {
          delete filters[key];
          const field = form.elements.namedItem(key); if (field) field.value = '';
          page = 1; renderFilterChips(); load();
        });
        chip.append(remove); chips.append(chip);
      });
    }

    const requestedJobId = new URLSearchParams(location.search).get('jobId');
    if (requestedJobId && form.elements.namedItem('jobId')) {
      form.elements.namedItem('jobId').value = requestedJobId;
      filters.jobId = requestedJobId;
    }

    async function load() {
      const loadId = ++sequence;
      body.replaceChildren();
      addFeedback(feedback, 'Đang tải danh sách', 'Đang lấy dữ liệu sự kiện từ API.');
      count.textContent = 'Đang tải danh sách…';
      const query = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
      try {
        const result = await ApiClient.getJson(`/events?${query.toString()}`);
        if (loadId !== sequence) return;
        const events = Array.isArray(result && result.data) ? result.data : [];
        const meta = result && result.meta ? result.meta : { page, limit, total: events.length, totalPages: events.length ? 1 : 0 };
        body.replaceChildren(...events.map(buildEventRow));
        feedback.replaceChildren();
        if (events.length === 0) addFeedback(feedback, 'Không có sự kiện phù hợp', 'Thử thay đổi hoặc xóa một số bộ lọc.');
        const total = Number(meta.total) || 0;
        const totalPages = Number(meta.totalPages) || 0;
        page = Number(meta.page) || page;
        count.textContent = `${total.toLocaleString('vi-VN')} sự kiện`;
        summary.textContent = total ? `Trang ${page} / ${totalPages} · ${total.toLocaleString('vi-VN')} kết quả` : 'Không có kết quả';
        current.textContent = totalPages ? `${page}/${totalPages}` : '—';
        previous.disabled = page <= 1;
        next.disabled = totalPages === 0 || page >= totalPages;
      } catch (error) {
        if (loadId !== sequence) return;
        body.replaceChildren(); count.textContent = 'Không tải được danh sách';
        const details = errorMessage(error);
        addFeedback(feedback, 'Không tải được danh sách', details.message, 'error', details.statusCode, load);
        summary.textContent = '—'; current.textContent = '—'; previous.disabled = true; next.disabled = true;
      }
    }

    form.addEventListener('submit', (event) => { event.preventDefault(); filters = readFilters(form); page = 1; renderFilterChips(); load(); });
    form.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); form.requestSubmit(); } });
    document.getElementById('clear-filters').addEventListener('click', () => { form.reset(); filters = {}; page = 1; renderFilterChips(); load(); });
    document.getElementById('refresh-list').addEventListener('click', load);
    previous.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
    next.addEventListener('click', () => { page += 1; load(); });
    size.addEventListener('change', () => { limit = Number(size.value); page = 1; load(); });
    renderFilterChips();
    load();
  }

  let activeObjectUrls = new Set();
  let evidenceDialog;
  function ensureEvidenceDialog() {
    if (evidenceDialog) return evidenceDialog;
    const dialog = make('dialog', 'evidence-modal');
    const head = make('div', 'modal-head');
    const title = make('strong', '', 'Bằng chứng hình ảnh');
    const close = make('button', 'modal-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Đóng ảnh');
    const wrap = make('div', 'modal-image-wrap');
    const image = make('img'); image.alt = 'Ảnh bằng chứng';
    const dimensions = make('div', 'image-dimensions mono');
    const sizeWarning = make('p', 'image-size-warning', 'Ảnh nhỏ, OCR có thể không đọc được');
    sizeWarning.hidden = true;
    wrap.append(image); head.append(title, close); dialog.append(head, wrap, dimensions, sizeWarning); document.body.append(dialog);
    const cleanup = () => {
      image.removeAttribute('src');
      for (const url of activeObjectUrls) URL.revokeObjectURL(url);
      activeObjectUrls.clear();
      document.querySelectorAll('[data-evidence-thumb="true"]').forEach((thumb) => thumb.removeAttribute('src'));
    };
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', cleanup);
    evidenceDialog = { dialog, image, title, dimensions, sizeWarning, wrap, isPlateCrop: false };
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        if (evidenceDialog.isPlateCrop && image.complete) fitCropImageToModal(evidenceDialog);
      }).observe(wrap);
    }
    return evidenceDialog;
  }

  function formatAssetType(type) { return type === 'PLATE_CROP' ? 'ẢNH CROP' : type === 'IMAGE' ? 'TOÀN CẢNH' : type || 'BẰNG CHỨNG'; }

  function showImageDimensions(target, image) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return;
    target.dimensions.textContent = `${width} × ${height} px`;
    target.sizeWarning.hidden = !(target.isPlateCrop && width < 100 && height < 100);
  }

  function fitCropImageToModal(modal) {
    const image = modal.image;
    if (!image.naturalWidth || !image.naturalHeight) return;
    const style = getComputedStyle(modal.wrap);
    const availableWidth = modal.wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight = modal.wrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availableWidth <= 0 || availableHeight <= 0) return;
    const scale = Math.max(1, Math.min(8, Math.floor(Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight))));
    image.style.width = `${image.naturalWidth * scale}px`;
    image.style.height = `${image.naturalHeight * scale}px`;
  }

  function plateCropReasonLabel(reason) {
    const labels = {
      TOO_SMALL: 'Biển số quá nhỏ',
      NO_PLATE_DETECTED: 'Không phát hiện biển số',
      DETECTOR_ERROR: 'Lỗi bộ phát hiện biển số',
    };
    if (labels[reason]) return labels[reason];
    if (reason) return `Không rõ (${reason})`;
    return 'Không rõ (job tạo trước khi ghi lý do)';
  }

  function addMissingCropCard(container, event) {
    const card = make('article', 'evidence-card');
    const head = make('div', 'evidence-card-head');
    head.append(make('strong', '', 'Ảnh crop biển số'), make('span', 'evidence-type', 'PLATE_CROP'));
    const message = make('div', 'evidence-placeholder missing-crop-message');
    message.append(
      make('span', '', 'Không có ảnh crop biển số cho sự kiện này'),
      make('span', 'missing-crop-reason', plateCropReasonLabel(event && event.rawPayload && event.rawPayload.plate_crop_reason)),
    );
    card.append(head, message);
    container.append(card);
  }

  function addEvidenceCard(container, asset) {
    const isPlateCrop = asset.assetType === 'PLATE_CROP';
    const card = make('article', 'evidence-card');
    const head = make('div', 'evidence-card-head');
    const title = make('strong', '', isPlateCrop ? 'Ảnh crop biển số' : 'Ảnh toàn cảnh');
    const type = make('span', 'evidence-type', formatAssetType(asset.assetType));
    head.append(title, type);
    const frame = make('div', 'evidence-frame');
    const placeholder = make('div', 'evidence-placeholder', 'Đang tải ảnh bằng chứng…');
    frame.append(placeholder);
    const open = make('button', 'button button-secondary button-small evidence-open', 'Mở ảnh lớn'); open.type = 'button'; open.disabled = true;
    const dimensions = make('div', 'image-dimensions mono');
    const sizeWarning = make('p', 'image-size-warning', 'Ảnh nhỏ, OCR có thể không đọc được');
    sizeWarning.hidden = true;
    card.append(head, frame, dimensions, sizeWarning, open); container.append(card);
    const thumb = make('img'); thumb.alt = isPlateCrop ? 'Ảnh crop biển số' : 'Ảnh toàn cảnh'; thumb.dataset.evidenceThumb = 'true';
    if (isPlateCrop) thumb.classList.add('pixelated-image');
    thumb.addEventListener('load', () => showImageDimensions({ dimensions, sizeWarning, isPlateCrop }, thumb));
    let objectUrl = null;
    async function ensureImageUrl() {
      if (objectUrl && activeObjectUrls.has(objectUrl)) return objectUrl;
      const blob = await ApiClient.getBlob(`/evidence/${encodeURIComponent(asset.id)}/content`);
      objectUrl = URL.createObjectURL(blob); activeObjectUrls.add(objectUrl); thumb.src = objectUrl;
      return objectUrl;
    }
    ensureImageUrl().then(() => {
      frame.replaceChildren(thumb); open.disabled = false;
      open.addEventListener('click', async () => {
        open.disabled = true;
        try {
          const url = await ensureImageUrl();
          const modal = ensureEvidenceDialog();
          modal.title.textContent = formatAssetType(asset.assetType);
          modal.isPlateCrop = isPlateCrop;
          modal.wrap.classList.toggle('is-plate-crop', isPlateCrop);
          modal.image.classList.toggle('pixelated-image', isPlateCrop);
          modal.image.style.removeProperty('width');
          modal.image.style.removeProperty('height');
          modal.dimensions.textContent = dimensions.textContent;
          modal.sizeWarning.hidden = sizeWarning.hidden;
          modal.image.onload = () => {
            showImageDimensions(modal, modal.image);
            if (isPlateCrop) fitCropImageToModal(modal);
          };
          modal.image.src = url;
          modal.dialog.showModal();
          if (modal.image.complete && isPlateCrop) fitCropImageToModal(modal);
        } catch (error) {
          const details = errorMessage(error);
          placeholder.textContent = `${details.statusCode ? `HTTP ${details.statusCode} · ` : ''}${details.message}`;
          placeholder.classList.add('is-error');
          frame.replaceChildren(placeholder);
        } finally { open.disabled = false; }
      });
    }).catch((error) => {
      const details = errorMessage(error);
      placeholder.textContent = `${details.statusCode ? `HTTP ${details.statusCode} · ` : ''}${details.message}${details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng nhập token ở thanh trên.' : ''}`;
      placeholder.classList.add('is-error');
    });
  }

  function appendOcr(container, event) {
    const panel = make('section', 'ocr-panel');
    const copy = make('div', 'ocr-copy');
    copy.append(make('span', 'field-label', 'KẾT QUẢ OCR'));
    const value = event.plateNumber || 'Không đọc được';
    copy.append(make('strong', 'ocr-value', value));
    const hasRawText = typeof event.plateRawText === 'string' && event.plateRawText.trim().length > 0;
    if (!event.plateNumber && hasRawText) copy.append(make('span', 'ocr-confidence', `OCR thô: ${event.plateRawText}`));
    const conf = typeof event.plateConfidence === 'number' ? `${(event.plateConfidence * 100).toFixed(1)}%` : '—';
    const confidenceLabel = event.plateNumber === null && hasRawText ? 'Độ tin cậy OCR (chuỗi thô)' : 'Độ tin cậy';
    panel.append(copy);
    if (event.plateNumber !== null || hasRawText) {
      const confidence = make('span', `status-badge ${typeof event.plateConfidence === 'number' && event.plateConfidence < 0.5 ? 'status-yellow' : 'status-neutral'}`, `${confidenceLabel} ${conf}`);
      panel.append(confidence);
    }
    container.append(panel);
  }

  function appendMetadata(container, label, value) {
    const item = make('div', 'metadata-item');
    const renderedValue = make('dd', '', value === null || value === undefined || value === '' ? '—' : value);
    item.append(make('dt', '', label), renderedValue);
    container.append(item);
    return renderedValue;
  }

  function appendCrossingDirection(container, value) {
    const renderedValue = appendMetadata(container, 'HƯỚNG CẮT TUYẾN', value);
    const labels = {
      positive_to_negative: 'Từ dương sang âm',
      negative_to_positive: 'Từ âm sang dương',
    };
    if (Object.prototype.hasOwnProperty.call(labels, value)) {
      renderedValue.replaceChildren(
        make('span', 'mono-value', value),
        make('span', 'direction-label', labels[value]),
      );
    }
    return renderedValue;
  }

  function setReviewFeedback(message, type, warning) {
    const target = document.getElementById('review-feedback');
    target.replaceChildren(); target.className = `review-feedback${type ? ` is-${type}` : ''}`;
    if (message) target.append(make('span', '', message));
    if (warning) target.append(make('strong', 'review-warning', `Cảnh báo từ API: ${warning}`));
  }

  function initDetail() {
    const id = new URLSearchParams(location.search).get('id');
    const reviewFeedback = document.getElementById('review-feedback');
    const metadata = document.getElementById('event-metadata');
    const evidence = document.getElementById('evidence-content');
    const ocr = document.getElementById('ocr-content');
    const detailStatus = document.getElementById('detail-status');
    const eventIdNode = document.getElementById('review-event-id');
    const reviewStatusBadge = document.getElementById('review-status-badge');
    const verify = document.getElementById('verify-event');
    const reject = document.getElementById('reject-event');
    const reviewActions = verify.parentElement;
    const note = document.getElementById('review-note');
    const noteCount = document.getElementById('note-count');
    let eventRecord = null;
    let busy = false;
    let pendingReviewStatus = null;
    let reviewConfirmButton = null;

    function restoreReviewActions() {
      reviewActions.replaceChildren(verify, reject);
    }

    function cancelReviewConfirmation() {
      pendingReviewStatus = null;
      reviewConfirmButton = null;
      restoreReviewActions();
    }

    function showReviewConfirmation(status) {
      pendingReviewStatus = status;
      const isVerify = status === 'VERIFIED_CROSSING';
      const confirmation = make('div', 'review-confirmation');
      const prompt = isVerify
        ? 'Xác minh sự kiện này? Enter để xác nhận · Esc để huỷ'
        : 'Từ chối ứng viên này? Enter để xác nhận · Esc để huỷ';
      confirmation.append(make('span', 'review-confirmation-prompt', prompt));
      const confirm = make('button', isVerify ? 'button button-primary button-small' : 'button button-danger button-small', 'Xác nhận');
      confirm.type = 'button'; confirm.disabled = busy || !ApiClient.getToken();
      confirm.addEventListener('click', () => { const selected = pendingReviewStatus; cancelReviewConfirmation(); submitReview(selected); });
      const cancel = make('button', 'button button-secondary button-small', 'Huỷ');
      cancel.type = 'button'; cancel.addEventListener('click', cancelReviewConfirmation);
      confirmation.append(confirm, cancel);
      reviewConfirmButton = confirm;
      reviewActions.replaceChildren(confirmation);
    }

    const tokenRequired = document.getElementById('review-token-required');
    function syncReviewAvailability() {
      const hasToken = Boolean(ApiClient.getToken());
      verify.disabled = !eventRecord || busy || !hasToken;
      reject.disabled = !eventRecord || busy || !hasToken;
      tokenRequired.hidden = hasToken;
      if (reviewConfirmButton) reviewConfirmButton.disabled = busy || !hasToken;
    }
    syncReviewAvailability();
    window.addEventListener('internal-token-change', syncReviewAvailability);
    note.addEventListener('input', () => { noteCount.textContent = String(note.value.length); });

    async function loadEvidence() {
      evidence.replaceChildren();
      const loading = make('div', 'feedback-box', 'Đang tải danh sách bằng chứng…'); evidence.append(loading);
      try {
        const assets = await ApiClient.getJson(`/events/${encodeURIComponent(id)}/evidence`, { withToken: true });
        evidence.replaceChildren();
        const list = Array.isArray(assets) ? assets : [];
        document.getElementById('asset-count').textContent = `${list.length} TỆP`;
        const fullFrame = list.find((asset) => asset.assetType === 'IMAGE');
        const crop = list.find((asset) => asset.assetType === 'PLATE_CROP');
        if (fullFrame) addEvidenceCard(evidence, fullFrame);
        if (crop) addEvidenceCard(evidence, crop);
        else addMissingCropCard(evidence, eventRecord);
      } catch (error) {
        evidence.replaceChildren();
        const details = errorMessage(error);
        const title = details.statusCode === 401 || details.statusCode === 403 ? 'Cần internal token' : 'Không tải được bằng chứng';
        addFeedback(evidence, title, details.message, 'error', details.statusCode, loadEvidence);
      }
    }

    async function loadDetail() {
      if (!id) {
        const details = make('div', 'feedback-box is-error', 'Thiếu mã sự kiện. Mở trang từ danh sách để xem chi tiết.');
        metadata.append(details); verify.disabled = true; reject.disabled = true;
        detailStatus.className = 'status-badge status-red'; detailStatus.textContent = 'Thiếu mã event'; return;
      }
      metadata.replaceChildren(make('div', 'feedback-box', 'Đang tải thông tin sự kiện…'));
      try {
        const event = await ApiClient.getJson(`/events/${encodeURIComponent(id)}`);
        eventRecord = event;
        metadata.replaceChildren();
        eventIdNode.textContent = event.id || id;
        detailStatus.className = `status-badge ${reviewTone(event.reviewStatus)}`; detailStatus.textContent = reviewLabel(event.reviewStatus);
        reviewStatusBadge.className = `status-badge ${reviewTone(event.reviewStatus)}`; reviewStatusBadge.textContent = reviewLabel(event.reviewStatus);
        appendMetadata(metadata, 'FRAME INDEX', event.frameIndex);
        appendMetadata(metadata, 'THỜI ĐIỂM VIDEO', typeof event.timestampSeconds === 'number' ? `${event.timestampSeconds.toFixed(3)} giây` : null);
        appendCrossingDirection(metadata, event.crossingDirection);
        appendMetadata(metadata, 'TRACK ID', event.trackId);
        appendMetadata(metadata, 'LOẠI XE', event.vehicleType);
        const detectionConfidence = appendMetadata(metadata, 'ĐỘ TIN CẬY PHÁT HIỆN', '');
        detectionConfidence.replaceChildren(confidenceValue(event.confidence));
        appendMetadata(metadata, 'MÃ JOB', event.job && event.job.id);
        appendMetadata(metadata, 'MÃ VIDEO', event.job && event.job.videoId);
        if (event.reviewNote) note.value = event.reviewNote;
        noteCount.textContent = String(note.value.length);
        syncReviewAvailability();
        ocr.replaceChildren(); appendOcr(ocr, event);
        if (event.reviewedAt) setReviewFeedback(`Được review lúc ${formatDate(event.reviewedAt)}.`, '');
        loadEvidence();
      } catch (error) {
        metadata.replaceChildren(); const details = errorMessage(error);
        addFeedback(metadata, 'Không tải được chi tiết sự kiện', details.message, 'error', details.statusCode, loadDetail);
        detailStatus.className = 'status-badge status-red'; detailStatus.textContent = 'Không tải được';
        verify.disabled = true; reject.disabled = true;
      }
    }

    async function submitReview(reviewStatus) {
      if (!eventRecord || busy) return;
      if (!ApiClient.getToken()) { setReviewFeedback('Vui lòng nhập và lưu internal token ở thanh trên trước khi gửi review.', 'error'); return; }
      busy = true; syncReviewAvailability(); toggleButtonLoading(reviewStatus === 'VERIFIED_CROSSING' ? verify : reject, true); setReviewFeedback('Đang gửi quyết định review…', '');
      try {
        const result = await ApiClient.patchJson(`/events/${encodeURIComponent(id)}/review`, { reviewStatus, note: note.value.trim() });
        eventRecord = { ...eventRecord, ...result };
        detailStatus.className = `status-badge ${reviewTone(result.reviewStatus)}`; detailStatus.textContent = reviewLabel(result.reviewStatus);
        reviewStatusBadge.className = `status-badge ${reviewTone(result.reviewStatus)}`; reviewStatusBadge.textContent = reviewLabel(result.reviewStatus);
        setReviewFeedback('Đã lưu kết quả review.', 'success', result.warning);
      } catch (error) {
        const details = errorMessage(error);
        setReviewFeedback(`${details.statusCode ? `HTTP ${details.statusCode} · ` : ''}${details.message}${details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng kiểm tra internal token.' : ''}`, 'error');
      } finally { toggleButtonLoading(verify, false); toggleButtonLoading(reject, false); busy = false; syncReviewAvailability(); }
    }

    verify.addEventListener('click', () => submitReview('VERIFIED_CROSSING'));
    reject.addEventListener('click', () => submitReview('REJECTED_CANDIDATE'));
    document.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      const isElement = target && typeof target.matches === 'function';
      const isTyping = isElement && (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]'));
      if (event.key === 'Escape' && pendingReviewStatus) { event.preventDefault(); cancelReviewConfirmation(); return; }
      if (isTyping) return;
      if (pendingReviewStatus && event.key === 'Enter' && !(isElement && target.closest('.review-confirmation button'))) {
        event.preventDefault();
        const selected = pendingReviewStatus; cancelReviewConfirmation(); submitReview(selected);
        return;
      }
      if (pendingReviewStatus) return;
      if (isElement && target.matches('button')) return;
      if (event.key.toLowerCase() === 'v' && !verify.disabled) { event.preventDefault(); showReviewConfirmation('VERIFIED_CROSSING'); }
      if (event.key.toLowerCase() === 'r' && !reject.disabled) { event.preventDefault(); showReviewConfirmation('REJECTED_CANDIDATE'); }
    });
    loadDetail();
  }

  function apiFailureText(details) {
    const authHint = details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng nhập và lưu internal token ở thanh trên.' : '';
    return `${details.message}${authHint}`;
  }

  function cameraName(camera) {
    return camera && camera.name ? camera.name : '—';
  }

  function jobStatusLabel(status) {
    const labels = { PENDING: 'Đang chờ', PROCESSING: 'Đang xử lý', COMPLETED: 'Hoàn tất', FAILED: 'Thất bại' };
    return labels[status] || status || 'Chưa rõ';
  }

  function jobStatusTone(status) {
    if (status === 'COMPLETED') return 'status-green';
    if (status === 'FAILED') return 'status-red';
    if (status === 'PENDING' || status === 'PROCESSING') return 'status-yellow';
    return 'status-neutral';
  }

  function formatJobRuntime(job, now = Date.now()) {
    if (!job || job.status === 'PENDING' || !job.startedAt) return '—';
    const start = new Date(job.startedAt).getTime();
    const end = job.status === 'PROCESSING'
      ? now
      : job.status === 'COMPLETED' || job.status === 'FAILED'
        ? job.completedAt ? new Date(job.completedAt).getTime() : NaN
        : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
    const totalSeconds = Math.floor((end - start) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatFileSize(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return '—';
    let bytes;
    try { bytes = BigInt(value); } catch { return '—'; }
    const units = [
      { name: 'KB', divisor: 1024n },
      { name: 'MB', divisor: 1024n ** 2n },
      { name: 'GB', divisor: 1024n ** 3n },
    ];
    let unit = units[0];
    for (const candidate of units) {
      if (bytes >= candidate.divisor) unit = candidate;
    }
    const tenths = (bytes * 10n + unit.divisor / 2n) / unit.divisor;
    return `${tenths / 10n}.${tenths % 10n} ${unit.name}`;
  }

  function initPlates() {
    const jobId = new URLSearchParams(location.search).get('jobId');
    const jobIdValue = document.getElementById('plates-job-id');
    const summary = document.getElementById('plates-summary');
    const summaryFeedback = document.getElementById('plates-summary-feedback');
    const cropSection = document.getElementById('plates-crop-section');
    const missingSection = document.getElementById('plates-missing-section');
    const cropGrid = document.getElementById('plates-crop-grid');
    const cropFeedback = document.getElementById('plates-crop-feedback');
    const missingBody = document.getElementById('plates-missing-body');
    const missingFeedback = document.getElementById('plates-missing-feedback');
    const refresh = document.getElementById('refresh-plates');
    const items = [];
    const visibleItems = new Set();
    const queue = [];
    let activeRequests = 0;
    let loadSequence = 0;
    let disposed = false;
    let observer = null;

    if (jobIdValue) jobIdValue.textContent = jobId || '—';

    function hideEventSections() {
      cropSection.hidden = true;
      missingSection.hidden = true;
    }

    function showEventSections() {
      cropSection.hidden = false;
      missingSection.hidden = false;
    }

    function reasonFor(event) {
      const payload = event && event.rawPayload;
      const reason = payload && typeof payload === 'object' ? payload.plate_crop_reason : null;
      return typeof reason === 'string' && reason ? reason : null;
    }

    function reasonLabel(reason) {
      return plateCropReasonLabel(reason);
    }

    function cropAssetFor(event) {
      const assets = Array.isArray(event && event.evidenceAssets) ? event.evidenceAssets : [];
      return assets.find((asset) => asset && asset.assetType === 'PLATE_CROP' && asset.id) || null;
    }

    function confidenceFor(event) {
      const value = event && event.plateConfidence;
      if (typeof value !== 'number' || !Number.isFinite(value)) return make('span', 'confidence-value confidence-normal', '—');
      return confidenceValue(value);
    }

    function videoTime(value) {
      return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(3)} giây` : '—';
    }

    function setItemMessage(item, message, isError = false, statusCode = null) {
      item.placeholder.replaceChildren();
      const text = statusCode ? `HTTP ${statusCode} · ${message}` : message;
      item.placeholder.append(make('span', isError ? 'plate-image-error' : '', text));
      item.image.hidden = true;
      item.frame.replaceChildren(item.placeholder);
      item.retry.hidden = !isError;
    }

    function pumpImageQueue() {
      if (disposed || !ApiClient.getToken()) return;
      while (activeRequests < 6 && queue.length) {
        const item = queue.shift();
        if (!item || item.state !== 'queued' || !visibleItems.has(item)) continue;
        item.state = 'loading';
        setItemMessage(item, 'Đang tải ảnh crop…');
        activeRequests += 1;
        ApiClient.getBlob(`/evidence/${encodeURIComponent(item.asset.id)}/content`)
          .then((blob) => {
            if (disposed || item.generation !== loadSequence) return;
            const objectUrl = URL.createObjectURL(blob);
            activeObjectUrls.add(objectUrl);
            item.objectUrl = objectUrl;
            item.image.src = objectUrl;
            item.image.hidden = false;
            item.frame.replaceChildren(item.image);
            item.retry.hidden = true;
            item.state = 'loaded';
          })
          .catch((error) => {
            if (disposed || item.generation !== loadSequence) return;
            const details = errorMessage(error);
            const authError = details.statusCode === 401 || details.statusCode === 403;
            const message = authError
              ? 'Cần internal token để tải ảnh crop. Hãy nhập token ở thanh trên.'
              : details.message;
            setItemMessage(item, message, true, details.statusCode);
            item.state = 'error';
          })
          .finally(() => {
            activeRequests -= 1;
            pumpImageQueue();
          });
      }
    }

    function queueImage(item) {
      if (!ApiClient.getToken()) {
        setItemMessage(item, 'Cần internal token để tải ảnh crop. Hãy nhập token ở thanh trên.');
        return;
      }
      if (item.state !== 'idle') return;
      item.state = 'queued';
      queue.push(item);
      pumpImageQueue();
    }

    function makeCropCard(event, asset) {
      const card = make('article', 'plate-crop-card');
      const link = make('a', 'plate-crop-link');
      link.href = `violation.html?id=${encodeURIComponent(event.id || '')}`;
      link.setAttribute('aria-label', `Mở sự kiện ${event.id || ''}`);
      const frame = make('div', 'plate-crop-frame');
      const image = make('img', 'pixelated-image');
      image.alt = 'Ảnh crop biển số';
      image.loading = 'lazy';
      const placeholder = make('div', 'plate-crop-placeholder');
      const retry = make('button', 'button button-secondary button-small plate-crop-retry', 'Thử tải lại');
      retry.type = 'button';
      retry.hidden = true;
      const details = make('div', 'plate-crop-details');
      const top = make('div', 'plate-crop-meta');
      top.append(make('strong', '', event.vehicleType || '—'), make('span', 'mono', videoTime(event.timestampSeconds)));
      const ocr = make('div', 'plate-crop-ocr');
      const plateNumber = event.plateNumber;
      if (plateNumber !== null && plateNumber !== undefined && plateNumber !== '') {
        ocr.append(make('strong', 'plate-crop-result mono', plateNumber));
      } else {
        ocr.append(make('span', 'plate-unreadable', 'Không đọc được'));
        if (event.plateRawText) ocr.append(make('span', 'plate-raw', `OCR thô: ${event.plateRawText}`));
      }
      const confidence = make('div', 'plate-crop-confidence');
      confidence.append(make('span', 'field-label', 'ĐỘ TIN CẬY OCR'), confidenceFor(event));
      details.append(top, ocr, confidence);
      link.append(frame, details);
      card.append(link, retry);
      const item = { asset, card, frame, image, placeholder, retry, state: 'idle', objectUrl: null, generation: loadSequence };
      setItemMessage(item, ApiClient.getToken() ? 'Ảnh sẽ tải khi cuộn đến đây.' : 'Cần internal token để tải ảnh crop. Hãy nhập token ở thanh trên.');
      retry.addEventListener('click', () => {
        item.state = 'idle';
        queueImage(item);
      });
      items.push(item);
      if (observer) observer.observe(card);
      else {
        visibleItems.add(item);
        queueImage(item);
      }
      return card;
    }

    function renderMissingRows(events) {
      const missing = events.filter((event) => !cropAssetFor(event));
      missingBody.replaceChildren(...missing.map((event) => {
        const row = make('tr');
        const id = make('a', 'event-link mono', event.id || '—');
        id.href = `violation.html?id=${encodeURIComponent(event.id || '')}`;
        const idCell = make('td'); idCell.append(id);
        row.append(idCell, make('td', '', event.vehicleType || '—'), make('td', '', reasonLabel(reasonFor(event))), make('td', 'mono', videoTime(event.timestampSeconds)));
        return row;
      }));
      missingFeedback.replaceChildren();
      if (!missing.length) addFeedback(missingFeedback, 'Không có sự kiện thiếu ảnh crop', 'Tất cả sự kiện trong job đều có ảnh crop hoặc danh sách hiện đang rỗng.');
      return missing;
    }

    function renderSummary(events, total) {
      const crops = events.filter((event) => cropAssetFor(event)).length;
      const missing = events.filter((event) => !cropAssetFor(event));
      const reasonCounts = new Map();
      for (const event of missing) {
        const label = reasonLabel(reasonFor(event));
        reasonCounts.set(label, (reasonCounts.get(label) || 0) + 1);
      }
      const cards = [
        ['TỔNG SỰ KIỆN', total],
        ['CÓ ẢNH CROP', crops],
        ['KHÔNG CÓ ẢNH CROP', missing.length],
      ].map(([label, value]) => {
        const card = make('article', 'plate-summary-card panel');
        card.append(make('span', 'field-label', label), make('strong', 'plate-summary-value mono', value));
        return card;
      });
      const reasons = make('div', 'plate-reason-summary');
      for (const [label, count] of reasonCounts) reasons.append(make('span', 'filter-chip', `${label} · ${count}`));
      summary.replaceChildren(...cards, reasons);
    }

    function setupObserver() {
      if (observer) observer.disconnect();
      visibleItems.clear();
      if (typeof IntersectionObserver !== 'function') {
        observer = null;
        return;
      }
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const item = items.find((candidate) => candidate.card === entry.target);
          if (!item) continue;
          if (entry.isIntersecting) {
            visibleItems.add(item);
            queueImage(item);
          } else visibleItems.delete(item);
        }
      }, { rootMargin: '160px 0px' });
    }

    async function load() {
      const sequence = ++loadSequence;
      if (observer) observer.disconnect();
      observer = null;
      for (const item of items) {
        if (item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl);
          activeObjectUrls.delete(item.objectUrl);
        }
        item.image.removeAttribute('src');
      }
      items.length = 0;
      visibleItems.clear();
      queue.length = 0;
      cropGrid.replaceChildren();
      missingBody.replaceChildren();
      summary.replaceChildren();
      hideEventSections();
      addFeedback(summaryFeedback, 'Đang tải sự kiện của job', 'Đang lấy danh sách sự kiện và trạng thái crop từ API.');
      cropFeedback.replaceChildren();
      missingFeedback.replaceChildren();
      if (!jobId) {
        addFeedback(summaryFeedback, 'Thiếu jobId', 'Mở trang với plates.html?jobId=<id>.', 'error');
        return;
      }
      try {
        const limit = 100;
        const query = new URLSearchParams({ jobId, page: '1', limit: String(limit) });
        const first = await ApiClient.getJson(`/events?${query.toString()}`);
        if (sequence !== loadSequence) return;
        const allEvents = Array.isArray(first && first.data) ? [...first.data] : [];
        const meta = first && first.meta ? first.meta : { total: allEvents.length, totalPages: allEvents.length === limit ? 2 : 1 };
        const totalPages = Number(meta.totalPages) || (allEvents.length ? 1 : 0);
        for (let page = 2; page <= totalPages; page += 1) {
          const pageQuery = new URLSearchParams({ jobId, page: String(page), limit: String(limit) });
          const result = await ApiClient.getJson(`/events?${pageQuery.toString()}`);
          if (sequence !== loadSequence) return;
          if (Array.isArray(result && result.data)) allEvents.push(...result.data);
        }
        const total = Number.isFinite(Number(meta.total)) ? Number(meta.total) : allEvents.length;
        if (!allEvents.length) {
          summary.replaceChildren();
          addFeedback(summaryFeedback, 'Job chưa có sự kiện', 'API chưa trả về sự kiện nào cho job này.');
          return;
        }
        renderSummary(allEvents, total);
        summaryFeedback.replaceChildren();
        const cropEvents = allEvents.filter((event) => cropAssetFor(event));
        setupObserver();
        showEventSections();
        cropGrid.replaceChildren(...cropEvents.map((event) => makeCropCard(event, cropAssetFor(event))));
        cropFeedback.replaceChildren();
        if (!cropEvents.length) addFeedback(cropFeedback, 'Chưa có ảnh crop', 'API chưa trả về PLATE_CROP cho job này.');
        renderMissingRows(allEvents);
      } catch (error) {
        if (sequence !== loadSequence) return;
        summary.replaceChildren();
        cropGrid.replaceChildren();
        missingBody.replaceChildren();
        hideEventSections();
        const details = errorMessage(error);
        const message = details.statusCode === 401 || details.statusCode === 403
          ? `${details.message} Vui lòng kiểm tra internal token nếu API yêu cầu xác thực.`
          : details.message;
        addFeedback(summaryFeedback, details.statusCode === 401 || details.statusCode === 403 ? 'Cần internal token' : 'Không tải được sự kiện', message, 'error', details.statusCode, load);
        cropFeedback.replaceChildren();
        missingFeedback.replaceChildren();
      }
    }

    window.addEventListener('internal-token-change', () => {
      for (const item of visibleItems) if (item.state === 'idle') queueImage(item);
    });
    refresh.addEventListener('click', load);
    window.addEventListener('pagehide', () => {
      disposed = true;
      if (observer) observer.disconnect();
      for (const item of items) {
        if (item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl);
          activeObjectUrls.delete(item.objectUrl);
          item.objectUrl = null;
        }
      }
    }, { once: true });
    load();
  }

  function initJobs() {
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('video-file');
    const cameraSelect = document.getElementById('upload-camera');
    const uploadButton = document.getElementById('upload-submit');
    const uploadFeedback = document.getElementById('upload-feedback');
    const tokenHint = document.getElementById('upload-token-required');
    const videosBody = document.getElementById('videos-body');
    const videosFeedback = document.getElementById('videos-feedback');
    const videoFilter = document.getElementById('videos-filter');
    const videoCameraFilter = document.getElementById('video-camera-filter');
    const videosSize = document.getElementById('videos-page-size');
    const jobsBody = document.getElementById('jobs-body');
    const jobsFeedback = document.getElementById('jobs-feedback');
    const jobsFilter = document.getElementById('jobs-filter');
    const jobsSize = document.getElementById('jobs-page-size');
    let videoPage = 1;
    let jobsPage = 1;
    let videoFilters = {};
    let jobFilters = {};
    let videoSequence = 0;
    let jobsSequence = 0;
    let videos = [];
    const jobRows = new Map();
    const pollingJobs = new Set();
    const inFlightPolls = new Set();
    const requestedVideoId = new URLSearchParams(location.search).get('videoId');
    if (requestedVideoId) {
      const videoIdField = jobsFilter.elements.namedItem('videoId');
      if (videoIdField) videoIdField.value = requestedVideoId;
      jobFilters.videoId = requestedVideoId;
    }

    function syncUploadAvailability() {
      const hasToken = Boolean(ApiClient.getToken());
      uploadButton.disabled = !hasToken;
      tokenHint.hidden = hasToken;
      videosBody.querySelectorAll('[data-create-job="true"]').forEach((button) => {
        button.disabled = !hasToken;
        button.title = hasToken ? 'Tạo job xử lý cho video này' : 'Cần internal token';
      });
      videosBody.querySelectorAll('[data-create-job-confirm="true"]').forEach((button) => {
        button.disabled = !hasToken;
        button.title = hasToken ? '' : 'Cần internal token';
      });
    }
    syncUploadAvailability();
    window.addEventListener('internal-token-change', syncUploadAvailability);

    async function loadCameras() {
      try {
        const result = await ApiClient.getJson('/cameras?limit=100');
        const cameras = Array.isArray(result) ? result : Array.isArray(result && result.data) ? result.data : [];
        for (const camera of cameras) {
          if (!camera || !camera.id) continue;
          const option = make('option', '', camera.name || camera.id);
          option.value = camera.id;
          cameraSelect.append(option);
          const filterOption = make('option', '', camera.name || camera.id);
          filterOption.value = camera.id;
          videoCameraFilter.append(filterOption);
        }
      } catch (error) {
        const details = errorMessage(error);
        addFeedback(uploadFeedback, 'Không tải được danh sách camera', apiFailureText(details), 'error', details.statusCode);
      }
    }

    function updateVideosPagination(meta) {
      const total = Number(meta.total) || 0;
      const totalPages = Number(meta.totalPages) || 0;
      videoPage = Number(meta.page) || videoPage;
      document.getElementById('videos-count').textContent = `${total.toLocaleString('vi-VN')} video`;
      document.getElementById('videos-page-summary').textContent = total ? `Trang ${videoPage} / ${totalPages} · ${total.toLocaleString('vi-VN')} kết quả` : 'Không có kết quả';
      document.getElementById('videos-page-current').textContent = totalPages ? `${videoPage}/${totalPages}` : '—';
      document.getElementById('videos-previous').disabled = videoPage <= 1;
      document.getElementById('videos-next').disabled = totalPages === 0 || videoPage >= totalPages;
    }

    function renderVideo(video) {
      const row = make('tr');
      const filename = video.originalFilename || video.filename || video.name || '—';
      const nameCell = make('td', '', filename);
      nameCell.title = filename;
      const fileSize = make('td', 'mono', formatFileSize(video.fileSize));
      if (typeof video.fileSize === 'string') fileSize.title = video.fileSize;
      const camera = make('td', '', cameraName(video.camera));
      const uploaded = make('td', '', formatDate(video.uploadedAt));
      const jobsCount = make('td', 'mono', video._count && Number.isFinite(video._count.processingJobs) ? video._count.processingJobs : '—');
      const actionCell = make('td');
      function createJobButton() {
        const button = make('button', 'button button-secondary button-small', 'Tạo job');
        button.type = 'button';
        button.dataset.createJob = 'true';
        button.disabled = !ApiClient.getToken();
        button.title = button.disabled ? 'Cần internal token' : 'Tạo job xử lý cho video này';
        button.addEventListener('click', () => showJobConfirmation());
        return button;
      }

      function showJobConfirmation() {
        if (!ApiClient.getToken()) return;
        const confirmation = make('div', 'job-confirmation');
        const prompt = make('span', 'job-confirmation-prompt', 'Tạo job cho ');
        prompt.append(make('strong', '', filename), document.createTextNode('?'));
        const confirm = make('button', 'button button-primary button-small', 'Xác nhận');
        confirm.type = 'button';
        confirm.dataset.createJobConfirm = 'true';
        const cancel = make('button', 'button button-secondary button-small', 'Hủy');
        cancel.type = 'button';
        cancel.addEventListener('click', () => actionCell.replaceChildren(createJobButton()));
        confirm.addEventListener('click', async () => {
          if (!ApiClient.getToken()) return;
          confirm.disabled = true;
          cancel.disabled = true;
          toggleButtonLoading(confirm, true);
          confirm.textContent = 'Đang tạo…';
          try {
            await ApiClient.postJson('/jobs', { videoId: video.id });
            addFeedback(uploadFeedback, 'Đã tạo job', `Job xử lý cho video ${filename} đã được tạo.`, 'success');
            await Promise.all([loadVideos(), loadJobs()]);
          } catch (error) {
            const details = errorMessage(error);
            const statusPrefix = details.statusCode ? `HTTP ${details.statusCode} · ` : '';
            const authHint = details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng nhập và lưu internal token ở thanh trên.' : '';
            const feedback = make('span', 'job-create-error', `${statusPrefix}${details.message}${authHint}`);
            actionCell.replaceChildren(createJobButton(), feedback);
          }
        });
        confirmation.append(prompt, confirm, cancel);
        actionCell.replaceChildren(confirmation);
      }

      actionCell.append(createJobButton());
      row.append(nameCell, fileSize, camera, uploaded, jobsCount, actionCell);
      return row;
    }

    async function loadVideos() {
      const loadId = ++videoSequence;
      videosBody.replaceChildren();
      addFeedback(videosFeedback, 'Đang tải video', 'Đang lấy danh sách video từ API.');
      document.getElementById('videos-count').textContent = 'Đang tải danh sách…';
      const query = new URLSearchParams({ page: String(videoPage), limit: String(videosSize.value), ...videoFilters });
      try {
        const result = await ApiClient.getJson(`/videos?${query.toString()}`);
        if (loadId !== videoSequence) return;
        videos = Array.isArray(result && result.data) ? result.data : [];
        videosBody.replaceChildren(...videos.map(renderVideo));
        videosFeedback.replaceChildren();
        if (!videos.length) addFeedback(videosFeedback, 'Chưa có video phù hợp', 'Thay đổi bộ lọc hoặc tải video lên.');
        updateVideosPagination(result && result.meta ? result.meta : { page: videoPage, total: videos.length, totalPages: videos.length ? 1 : 0 });
      } catch (error) {
        if (loadId !== videoSequence) return;
        videos = [];
        const details = errorMessage(error);
        addFeedback(videosFeedback, 'Không tải được video', apiFailureText(details), 'error', details.statusCode, loadVideos);
        document.getElementById('videos-count').textContent = 'Không tải được danh sách';
      }
    }

    function updateJobRow(entry) {
      const { job, status, elapsed, error, violationLink, platesLink } = entry;
      status.className = `status-badge ${jobStatusTone(job.status)}`;
      status.textContent = jobStatusLabel(job.status);
      elapsed.textContent = formatJobRuntime(job);
      error.textContent = job.status === 'FAILED' && job.errorMessage ? job.errorMessage : '—';
      violationLink.href = `violations.html?jobId=${encodeURIComponent(job.id)}`;
      violationLink.textContent = 'Xem vi phạm';
      violationLink.hidden = !job.id;
      platesLink.href = `plates.html?jobId=${encodeURIComponent(job.id || '')}`;
      platesLink.hidden = !job.id;
    }

    function renderJob(job) {
      const row = make('tr');
      const idLink = make('a', 'event-link mono', job.id || '—');
      idLink.href = `violations.html?jobId=${encodeURIComponent(job.id || '')}`;
      idLink.title = job.id || '';
      const videoId = job.video && job.video.id ? job.video.id : job.videoId;
      const videoName = job.video && job.video.originalFilename ? job.video.originalFilename : videoId || '—';
      const video = make('td');
      if (videoId) {
        const link = make('a', 'event-link', videoName);
        link.href = `jobs.html?videoId=${encodeURIComponent(videoId)}`;
        video.append(link);
      } else video.textContent = videoName;
      const status = make('span');
      const elapsed = make('span', 'mono');
      const error = make('span', 'job-error');
      const violationLink = make('a', 'text-button job-events-link', 'Xem vi phạm');
      violationLink.href = `violations.html?jobId=${encodeURIComponent(job.id || '')}`;
      const platesLink = make('a', 'text-button job-events-link', 'Xem biển số');
      platesLink.href = `plates.html?jobId=${encodeURIComponent(job.id || '')}`;
      const statusCell = make('td'); statusCell.append(status);
      const elapsedCell = make('td'); elapsedCell.append(elapsed);
      const errorCell = make('td'); errorCell.append(error);
      const actionCell = make('td');
      const jobLinks = make('div', 'job-row-links'); jobLinks.append(violationLink, platesLink); actionCell.append(jobLinks);
      row.append(make('td', 'mono', ''), video, statusCell, elapsedCell, errorCell, actionCell);
      row.firstElementChild.append(idLink);
      const entry = { job, row, status, elapsed, error, violationLink, platesLink };
      updateJobRow(entry);
      jobRows.set(job.id, entry);
      if (job.status === 'PENDING' || job.status === 'PROCESSING') pollingJobs.add(job.id);
      else pollingJobs.delete(job.id);
      return row;
    }

    function updateJobsPagination(meta) {
      const total = Number(meta.total) || 0;
      const totalPages = Number(meta.totalPages) || 0;
      jobsPage = Number(meta.page) || jobsPage;
      document.getElementById('jobs-count').textContent = `${total.toLocaleString('vi-VN')} job`;
      document.getElementById('jobs-page-summary').textContent = total ? `Trang ${jobsPage} / ${totalPages} · ${total.toLocaleString('vi-VN')} kết quả` : 'Không có kết quả';
      document.getElementById('jobs-page-current').textContent = totalPages ? `${jobsPage}/${totalPages}` : '—';
      document.getElementById('jobs-previous').disabled = jobsPage <= 1;
      document.getElementById('jobs-next').disabled = totalPages === 0 || jobsPage >= totalPages;
    }

    async function loadJobs() {
      const loadId = ++jobsSequence;
      jobsBody.replaceChildren();
      jobRows.clear();
      pollingJobs.clear();
      addFeedback(jobsFeedback, 'Đang tải job', 'Đang lấy danh sách tiến trình từ API.');
      document.getElementById('jobs-count').textContent = 'Đang tải danh sách…';
      const query = new URLSearchParams({ page: String(jobsPage), limit: String(jobsSize.value), ...jobFilters });
      try {
        const result = await ApiClient.getJson(`/jobs?${query.toString()}`);
        if (loadId !== jobsSequence) return;
        const jobs = Array.isArray(result && result.data) ? result.data : [];
        jobsBody.replaceChildren(...jobs.map(renderJob));
        jobsFeedback.replaceChildren();
        if (!jobs.length) addFeedback(jobsFeedback, 'Chưa có job phù hợp', 'Job sẽ xuất hiện sau khi tạo từ một video.');
        updateJobsPagination(result && result.meta ? result.meta : { page: jobsPage, total: jobs.length, totalPages: jobs.length ? 1 : 0 });
      } catch (error) {
        if (loadId !== jobsSequence) return;
        const details = errorMessage(error);
        addFeedback(jobsFeedback, 'Không tải được job', apiFailureText(details), 'error', details.statusCode, loadJobs);
        document.getElementById('jobs-count').textContent = 'Không tải được danh sách';
      }
    }

    async function pollJobs() {
      for (const id of pollingJobs) {
        if (inFlightPolls.has(id)) continue;
        inFlightPolls.add(id);
        ApiClient.getJson(`/jobs/${encodeURIComponent(id)}`).then((job) => {
          const entry = jobRows.get(id);
          if (!entry || !job) return;
          entry.job = job;
          updateJobRow(entry);
          if (job.status !== 'PENDING' && job.status !== 'PROCESSING') {
            pollingJobs.delete(id);
            if (jobFilters.status && jobFilters.status !== job.status) loadJobs();
          }
        }).catch((error) => {
          const details = errorMessage(error);
          if (details.statusCode === 401 || details.statusCode === 403) {
            addFeedback(jobsFeedback, 'Cần internal token', apiFailureText(details), 'error', details.statusCode);
            pollingJobs.delete(id);
          }
        }).finally(() => inFlightPolls.delete(id));
      }
    }

    function isVideoFile(file) {
      const allowedExtensions = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', 'mpeg', 'mpg', '3gp', 'wmv', 'ts']);
      const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
      return Boolean(file.type.startsWith('video/') || allowedExtensions.has(extension));
    }

    uploadForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      uploadFeedback.replaceChildren();
      const file = fileInput.files && fileInput.files[0];
      if (!file) { addFeedback(uploadFeedback, 'Chưa chọn video', 'Chọn một tệp video trước khi tải lên.', 'error'); return; }
      if (!isVideoFile(file)) { addFeedback(uploadFeedback, 'Định dạng không được hỗ trợ', 'Chỉ chấp nhận tệp có định dạng video.', 'error'); return; }
      if (!ApiClient.getToken()) { addFeedback(uploadFeedback, 'Cần internal token', 'Vui lòng nhập và lưu internal token ở thanh trên trước khi tải video.', 'error', 401); return; }
      const formData = new FormData();
      formData.append('file', file);
      if (cameraSelect.value) formData.append('cameraId', cameraSelect.value);
      uploadButton.disabled = true;
      toggleButtonLoading(uploadButton, true);
      addFeedback(uploadFeedback, 'Đang tải video', 'Đang gửi tệp lên API.');
      try {
        const uploaded = await ApiClient.postMultipart('/videos/upload', formData);
        const name = uploaded && uploaded.originalFilename ? uploaded.originalFilename : file.name;
        addFeedback(uploadFeedback, 'Tải video thành công', `${name} đã được tải lên.`);
        fileInput.value = '';
        videoPage = 1;
        await loadVideos();
      } catch (error) {
        const details = errorMessage(error);
        addFeedback(uploadFeedback, 'Không tải được video', apiFailureText(details), 'error', details.statusCode);
      } finally { toggleButtonLoading(uploadButton, false); syncUploadAvailability(); }
    });

    videoFilter.addEventListener('submit', (event) => {
      event.preventDefault(); videoFilters = {};
      if (videoCameraFilter.value) videoFilters.cameraId = videoCameraFilter.value;
      videoPage = 1; loadVideos();
    });
    jobsFilter.addEventListener('submit', (event) => {
      event.preventDefault(); jobsPage = 1; jobFilters = {};
      const values = new FormData(jobsFilter);
      for (const key of ['status', 'videoId']) { const value = String(values.get(key) || '').trim(); if (value) jobFilters[key] = value; }
      loadJobs();
    });
    videosSize.addEventListener('change', () => { videoPage = 1; loadVideos(); });
    jobsSize.addEventListener('change', () => { jobsPage = 1; loadJobs(); });
    document.getElementById('videos-previous').addEventListener('click', () => { if (videoPage > 1) { videoPage -= 1; loadVideos(); } });
    document.getElementById('videos-next').addEventListener('click', () => { videoPage += 1; loadVideos(); });
    document.getElementById('jobs-previous').addEventListener('click', () => { if (jobsPage > 1) { jobsPage -= 1; loadJobs(); } });
    document.getElementById('jobs-next').addEventListener('click', () => { jobsPage += 1; loadJobs(); });
    document.getElementById('refresh-jobs-page').addEventListener('click', () => { loadVideos(); loadJobs(); });
    loadCameras();
    loadVideos();
    loadJobs();
    const pollTimer = globalThis.setInterval(pollJobs, 2000);
    window.addEventListener('pagehide', () => { globalThis.clearInterval(pollTimer); pollingJobs.clear(); });
  }

  function cameraStatusLabel(status) {
    const labels = { ACTIVE: 'Hoạt động', INACTIVE: 'Không hoạt động', MAINTENANCE: 'Bảo trì' };
    return labels[status] || status || 'Chưa rõ';
  }

  function cameraStatusTone(status) {
    if (status === 'ACTIVE') return 'status-green';
    if (status === 'MAINTENANCE') return 'status-yellow';
    if (status === 'INACTIVE') return 'status-neutral';
    return 'status-neutral';
  }

  function cameraSourceLabel(sourceType) {
    const labels = { FILE_UPLOAD: 'Tải tệp lên', RTSP_METADATA: 'Metadata nguồn', OTHER: 'Khác' };
    return labels[sourceType] || sourceType || '—';
  }

  function cameraChangedFields(original, edited) {
    const changed = {};
    for (const field of ['name', 'location', 'description', 'sourceType', 'status']) {
      const before = String(original[field] ?? '').trim();
      const after = String(edited[field] ?? '').trim();
      if (before !== after) changed[field] = after;
    }
    return changed;
  }

  function validateCameraFields(fields) {
    if (!String(fields.name || '').trim()) return 'Tên camera là bắt buộc.';
    if (String(fields.name).trim().length > 120) return 'Tên camera tối đa 120 ký tự.';
    if (!String(fields.location || '').trim()) return 'Vị trí là bắt buộc.';
    if (String(fields.location).trim().length > 255) return 'Vị trí tối đa 255 ký tự.';
    if (String(fields.description || '').length > 2000) return 'Mô tả tối đa 2000 ký tự.';
    return '';
  }

  function initCameras() {
    const createForm = document.getElementById('camera-create-form');
    const createFeedback = document.getElementById('camera-create-feedback');
    const createButton = document.getElementById('camera-create-submit');
    const tokenHint = document.getElementById('camera-token-required');
    const filterForm = document.getElementById('camera-filter-form');
    const statusFilter = document.getElementById('camera-status-filter');
    const pageSize = document.getElementById('camera-page-size');
    const body = document.getElementById('cameras-body');
    const feedback = document.getElementById('cameras-feedback');
    const count = document.getElementById('cameras-count');
    const summary = document.getElementById('cameras-page-summary');
    const current = document.getElementById('cameras-page-current');
    const previous = document.getElementById('cameras-previous');
    const next = document.getElementById('cameras-next');
    let page = 1;
    let status = '';
    let sequence = 0;

    function syncTokenAvailability() {
      const hasToken = Boolean(ApiClient.getToken());
      createButton.disabled = !hasToken;
      tokenHint.hidden = hasToken;
      body.querySelectorAll('[data-camera-write="true"]').forEach((button) => {
        button.disabled = !hasToken;
        const label = button.getAttribute('aria-label') || button.textContent.trim();
        button.title = hasToken ? label : `${label} · Cần internal token`;
      });
    }
    syncTokenAvailability();
    window.addEventListener('internal-token-change', syncTokenAvailability);

    function updatePagination(meta) {
      const total = Number(meta && meta.total) || 0;
      const totalPages = Number(meta && meta.totalPages) || 0;
      page = Number(meta && meta.page) || page;
      count.textContent = `${total.toLocaleString('vi-VN')} camera`;
      summary.textContent = total ? `Trang ${page} / ${totalPages} · ${total.toLocaleString('vi-VN')} kết quả` : 'Không có kết quả';
      current.textContent = totalPages ? `${page}/${totalPages}` : '—';
      previous.disabled = page <= 1;
      next.disabled = totalPages === 0 || page >= totalPages;
    }

    function cameraActionButton(label, className, handler) {
      const iconName = label === 'Sửa' ? 'edit' : label === 'Xóa' ? 'trash' : null;
      const button = make('button', iconName ? 'btn-icon camera-icon-action' : className, iconName ? undefined : label);
      button.type = 'button';
      button.dataset.cameraWrite = 'true';
      button.disabled = !ApiClient.getToken();
      button.setAttribute('aria-label', label);
      button.title = button.disabled ? `${label} · Cần internal token` : label;
      if (iconName) { const icon = make('span'); icon.setAttribute('data-icon', iconName); button.append(icon); renderIcons(button); }
      button.addEventListener('click', handler);
      return button;
    }

    function addRowError(actionCell, error) {
      const details = errorMessage(error);
      const hint = details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng nhập và lưu internal token ở thanh trên.' : '';
      actionCell.append(make('span', 'camera-row-error', `${details.statusCode ? `HTTP ${details.statusCode} · ` : ''}${details.message}${hint}`));
    }

    function renderCameraRow(camera) {
      const row = make('tr');
      const name = make('td', '', camera.name || '—');
      const location = make('td', '', camera.location || '—');
      const description = make('td', 'camera-description', camera.description || '—');
      if (camera.description) description.title = camera.description;
      const source = make('td', '', cameraSourceLabel(camera.sourceType));
      const statusCell = make('td');
      statusCell.append(make('span', `status-badge ${cameraStatusTone(camera.status)}`, cameraStatusLabel(camera.status)));
      const videoCount = make('td', 'mono', camera._count && Number.isFinite(camera._count.videos) ? camera._count.videos.toLocaleString('vi-VN') : '—');
      const action = make('td', 'camera-actions');
      const edit = cameraActionButton('Sửa', 'button button-secondary button-small', () => editCameraRow(row, camera, action));
      const remove = cameraActionButton('Xóa', 'button button-danger button-small', () => confirmCameraDelete(row, camera, action));
      action.append(edit, remove);
      row.append(name, location, description, source, statusCell, videoCount, action);
      return row;
    }

    function editCameraRow(row, camera, actionCell) {
      const [nameCell, locationCell, descriptionCell, sourceCell, statusCell] = row.children;
      const fields = {};
      function replaceWithInput(cell, key, tag = 'input') {
        const input = make(tag, 'camera-edit-field');
        input.value = camera[key] || '';
        if (tag === 'input') input.maxLength = key === 'name' ? 120 : 255;
        if (tag === 'textarea') { input.maxLength = 2000; input.rows = 2; }
        fields[key] = input;
        cell.replaceChildren(input);
      }
      replaceWithInput(nameCell, 'name');
      replaceWithInput(locationCell, 'location');
      replaceWithInput(descriptionCell, 'description', 'textarea');

      function selectField(cell, key, options, labels) {
        const select = make('select', 'camera-edit-field');
        for (const value of options) {
          const option = make('option', '', labels[value] || value);
          option.value = value;
          select.append(option);
        }
        if (!options.includes(camera[key])) {
          const option = make('option', '', camera[key] || '—');
          option.value = camera[key] || '';
          select.append(option);
        }
        select.value = camera[key] || '';
        fields[key] = select;
        cell.replaceChildren(select);
      }
      selectField(sourceCell, 'sourceType', ['FILE_UPLOAD', 'RTSP_METADATA', 'OTHER'], { FILE_UPLOAD: 'Tải tệp lên', RTSP_METADATA: 'Metadata nguồn', OTHER: 'Khác' });
      selectField(statusCell, 'status', ['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { ACTIVE: 'Hoạt động', INACTIVE: 'Không hoạt động', MAINTENANCE: 'Bảo trì' });

      const save = cameraActionButton('Lưu', 'button button-primary button-small', async () => {
        const edited = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
        const validationError = validateCameraFields(edited);
        if (validationError) { actionCell.replaceChildren(save, cancel, make('span', 'camera-row-error', validationError)); return; }
        const changes = cameraChangedFields(camera, edited);
        if (!Object.keys(changes).length) { load(); return; }
        save.disabled = true;
        toggleButtonLoading(save, true);
        try {
          await ApiClient.patchJson(`/cameras/${encodeURIComponent(camera.id)}`, changes);
          await load();
        } catch (error) {
          toggleButtonLoading(save, false);
          save.disabled = !ApiClient.getToken();
          addRowError(actionCell, error);
        }
      });
      const cancel = make('button', 'button button-secondary button-small', 'Hủy');
      cancel.type = 'button';
      cancel.addEventListener('click', () => load());
      actionCell.replaceChildren(save, cancel);
    }

    function confirmCameraDelete(row, camera, actionCell) {
      const confirmation = make('div', 'camera-delete-confirm');
      confirmation.append(make('span', 'camera-delete-note', 'Video thuộc camera này vẫn được giữ, chỉ bỏ liên kết camera'));
      const confirm = cameraActionButton('Xác nhận xóa', 'button button-danger button-small', async () => {
        confirm.disabled = true;
        toggleButtonLoading(confirm, true);
        try {
          await ApiClient.deleteJson(`/cameras/${encodeURIComponent(camera.id)}`);
          await load();
        } catch (error) {
          toggleButtonLoading(confirm, false);
          confirm.disabled = !ApiClient.getToken();
          addRowError(actionCell, error);
        }
      });
      const cancel = make('button', 'button button-secondary button-small', 'Hủy');
      cancel.type = 'button';
      cancel.addEventListener('click', () => actionCell.replaceChildren(
        cameraActionButton('Sửa', 'button button-secondary button-small', () => editCameraRow(row, camera, actionCell)),
        cameraActionButton('Xóa', 'button button-danger button-small', () => confirmCameraDelete(row, camera, actionCell)),
      ));
      confirmation.append(confirm, cancel);
      actionCell.replaceChildren(confirmation);
    }

    async function load() {
      const loadId = ++sequence;
      body.replaceChildren();
      addFeedback(feedback, 'Đang tải camera', 'Đang lấy danh sách từ API.');
      count.textContent = 'Đang tải danh sách…';
      const query = new URLSearchParams({ page: String(page), limit: String(pageSize.value) });
      if (status) query.set('status', status);
      try {
        const result = await ApiClient.getJson(`/cameras?${query.toString()}`);
        if (loadId !== sequence) return;
        const cameras = Array.isArray(result && result.data) ? result.data : [];
        body.replaceChildren(...cameras.map(renderCameraRow));
        feedback.replaceChildren();
        if (!cameras.length) addFeedback(feedback, 'Chưa có camera phù hợp', 'Thay đổi bộ lọc hoặc thêm camera.');
        updatePagination(result && result.meta ? result.meta : { page, total: cameras.length, totalPages: cameras.length ? 1 : 0 });
      } catch (error) {
        if (loadId !== sequence) return;
        count.textContent = 'Không tải được danh sách';
        const details = errorMessage(error);
        addFeedback(feedback, 'Không tải được camera', apiFailureText(details), 'error', details.statusCode, load);
        summary.textContent = '—'; current.textContent = '—'; previous.disabled = true; next.disabled = true;
      }
    }

    createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!ApiClient.getToken()) {
        addFeedback(createFeedback, 'Cần internal token', 'Vui lòng nhập và lưu internal token ở thanh trên.', 'error', 401);
        return;
      }
      const values = new FormData(createForm);
      const payload = {
        name: String(values.get('name') || '').trim(),
        location: String(values.get('location') || '').trim(),
        description: String(values.get('description') || '').trim(),
        sourceType: String(values.get('sourceType') || 'FILE_UPLOAD'),
        status: String(values.get('status') || 'ACTIVE'),
      };
      const validationError = validateCameraFields(payload);
      if (validationError) { addFeedback(createFeedback, 'Kiểm tra thông tin', validationError, 'error'); return; }
      createButton.disabled = true;
      toggleButtonLoading(createButton, true);
      addFeedback(createFeedback, 'Đang thêm camera', 'Đang gửi thông tin đến API.');
      try {
        await ApiClient.postJson('/cameras', payload);
        createForm.reset();
        addFeedback(createFeedback, 'Đã thêm camera', 'Camera đã được thêm.', 'success');
        page = 1;
        await load();
      } catch (error) {
        const details = errorMessage(error);
        addFeedback(createFeedback, 'Không thêm được camera', apiFailureText(details), 'error', details.statusCode);
      } finally { toggleButtonLoading(createButton, false); syncTokenAvailability(); }
    });

    filterForm.addEventListener('submit', (event) => {
      event.preventDefault(); status = statusFilter.value; page = 1; load();
    });
    document.getElementById('clear-camera-filter').addEventListener('click', () => {
      filterForm.reset(); status = ''; page = 1; load();
    });
    document.getElementById('refresh-cameras').addEventListener('click', load);
    pageSize.addEventListener('change', () => { page = 1; load(); });
    previous.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
    next.addEventListener('click', () => { page += 1; load(); });
    load();
  }

  renderIcons();
  trackStickyHeaderHeight();
  wireToken();
  checkHealth();
  if (document.body.dataset.page === 'violations') initList();
  if (document.body.dataset.page === 'violation') initDetail();
  if (document.body.dataset.page === 'plates') initPlates();
  if (document.body.dataset.page === 'jobs') initJobs();
  if (document.body.dataset.page === 'dashboard') initDashboard();
  if (document.body.dataset.page === 'cameras') initCameras();
  window.addEventListener('pagehide', () => {
    for (const url of activeObjectUrls) URL.revokeObjectURL(url);
    activeObjectUrls.clear();
  });
})();
