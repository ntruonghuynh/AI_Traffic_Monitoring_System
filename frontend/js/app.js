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

  function addFeedback(container, title, message, type = 'info', statusCode = null, retry) {
    container.replaceChildren();
    const evidenceAuthError = container.id === 'evidence-content' && type === 'error' && (statusCode === 401 || statusCode === 403);
    const box = make('div', `feedback-box${type === 'error' ? ' is-error' : ''}${evidenceAuthError ? ' evidence-auth-error' : ''}`);
    const copy = make('div');
    if (title) copy.append(make('strong', '', title));
    const statusPrefix = statusCode ? `HTTP ${statusCode} · ` : '';
    copy.append(make('p', '', `${statusPrefix}${message}`));
    box.append(copy);
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

    form.addEventListener('submit', (event) => { event.preventDefault(); filters = readFilters(form); page = 1; load(); });
    document.getElementById('clear-filters').addEventListener('click', () => { form.reset(); filters = {}; page = 1; load(); });
    document.getElementById('refresh-list').addEventListener('click', load);
    previous.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
    next.addEventListener('click', () => { page += 1; load(); });
    size.addEventListener('change', () => { limit = Number(size.value); page = 1; load(); });
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

  function formatAssetType(type) { return type === 'PLATE_CROP' ? 'ẢNH CROP BIỂN SỐ' : type === 'IMAGE' ? 'TOÀN CẢNH' : type || 'BẰNG CHỨNG'; }

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

  function addMissingCropCard(container) {
    const card = make('article', 'evidence-card');
    const head = make('div', 'evidence-card-head');
    head.append(make('strong', '', 'Ảnh crop biển số'), make('span', 'evidence-type', 'PLATE_CROP'));
    const message = make('div', 'evidence-placeholder missing-crop-message', 'Không có ảnh crop biển số cho sự kiện này');
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
    const open = make('button', 'evidence-open', 'Mở ảnh lớn'); open.type = 'button'; open.disabled = true;
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
    const note = document.getElementById('review-note');
    const noteCount = document.getElementById('note-count');
    let eventRecord = null;
    let busy = false;

    const tokenRequired = document.getElementById('review-token-required');
    function syncReviewAvailability() {
      const hasToken = Boolean(ApiClient.getToken());
      verify.disabled = !eventRecord || busy || !hasToken;
      reject.disabled = !eventRecord || busy || !hasToken;
      tokenRequired.hidden = hasToken;
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
        else addMissingCropCard(evidence);
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
        const detectionConfidence = appendMetadata(metadata, 'CONFIDENCE PHÁT HIỆN', '');
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
      busy = true; syncReviewAvailability(); setReviewFeedback('Đang gửi quyết định review…', '');
      try {
        const result = await ApiClient.patchJson(`/events/${encodeURIComponent(id)}/review`, { reviewStatus, note: note.value.trim() });
        eventRecord = { ...eventRecord, ...result };
        detailStatus.className = `status-badge ${reviewTone(result.reviewStatus)}`; detailStatus.textContent = reviewLabel(result.reviewStatus);
        reviewStatusBadge.className = `status-badge ${reviewTone(result.reviewStatus)}`; reviewStatusBadge.textContent = reviewLabel(result.reviewStatus);
        setReviewFeedback('Đã lưu kết quả review.', 'success', result.warning);
      } catch (error) {
        const details = errorMessage(error);
        setReviewFeedback(`${details.statusCode ? `HTTP ${details.statusCode} · ` : ''}${details.message}${details.statusCode === 401 || details.statusCode === 403 ? ' Vui lòng kiểm tra internal token.' : ''}`, 'error');
      } finally { busy = false; syncReviewAvailability(); }
    }

    verify.addEventListener('click', () => submitReview('VERIFIED_CROSSING'));
    reject.addEventListener('click', () => submitReview('REJECTED_CANDIDATE'));
    loadDetail();
  }

  renderIcons();
  trackStickyHeaderHeight();
  wireToken();
  checkHealth();
  if (document.body.dataset.page === 'violations') initList();
  if (document.body.dataset.page === 'violation') initDetail();
  window.addEventListener('pagehide', () => {
    for (const url of activeObjectUrls) URL.revokeObjectURL(url);
    activeObjectUrls.clear();
  });
})();
