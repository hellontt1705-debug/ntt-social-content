// SocialContent OS - Content Script Injected Floating Widget (Manifest V3)
(() => {
  // Prevent duplicate injection
  if (document.getElementById("sc-companion-root")) return;

  // Create Host Element & Shadow Root for 100% CSS isolation
  const host = document.createElement("div");
  host.id = "sc-companion-root";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  // Inject CSS Styles
  const style = document.createElement("style");
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* Floating Orb (Button tròn tím nổi ở mép phải - Giống ảnh 1 và 2) */
    .sc-orb {
      position: fixed;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 45%, #ec4899 100%);
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.55), 0 0 14px rgba(236, 72, 153, 0.45);
      border: 1.5px solid rgba(255, 255, 255, 0.35);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
      user-select: none;
    }

    .sc-orb:hover {
      transform: translateY(-50%) scale(1.1);
      box-shadow: 0 6px 28px rgba(139, 92, 246, 0.7), 0 0 20px rgba(236, 72, 153, 0.6);
    }

    .sc-orb:active {
      transform: translateY(-50%) scale(0.95);
    }

    .sc-orb svg {
      width: 24px;
      height: 24px;
      fill: #ffffff;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }

    .sc-orb-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 14px;
      height: 14px;
      background: #10b981;
      border-radius: 50%;
      border: 2px solid #1e1e24;
      display: none;
    }
    .sc-orb-badge.active {
      display: block;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    /* Container Cửa Sổ Nhỏ Kính Mờ (Giống ảnh 3 & 4) */
    .sc-window-wrapper {
      position: fixed;
      right: 76px;
      top: 50%;
      transform: translateY(-50%) scale(0.95);
      opacity: 0;
      pointer-events: none;
      z-index: 2147483647;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .sc-window-wrapper.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(-50%) scale(1);
    }

    /* Card Kính Mờ Chính (Frosted Glass Main Card) */
    .sc-card {
      width: 370px;
      background: rgba(22, 24, 34, 0.85);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 20px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
      padding: 18px 20px 20px 20px;
      color: #ffffff;
    }

    /* Card Lịch Sử Phụ (History Card - Giống hệt ảnh 4: "HISTORY 20/20") */
    .sc-history-card {
      width: 250px;
      max-height: 480px;
      background: rgba(26, 29, 41, 0.82);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      padding: 16px;
      color: #ffffff;
      display: flex;
      flex-direction: column;
    }

    /* Header Bar */
    .sc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }

    .sc-brand-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: rgba(255, 255, 255, 0.55);
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sc-brand-dot {
      width: 6px;
      height: 6px;
      background: #a855f7;
      border-radius: 50%;
      box-shadow: 0 0 8px #a855f7;
    }

    .sc-close-btn {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: background 0.15s, color 0.15s;
    }

    .sc-close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }

    .sc-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* URL Box & Badge */
    .sc-url-container {
      background: rgba(12, 14, 20, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 12px;
    }

    .sc-url-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .sc-platform-tag {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(139, 92, 246, 0.25);
      color: #c084fc;
      border: 1px solid rgba(139, 92, 246, 0.4);
    }
    .sc-platform-tag.tiktok { background: rgba(255, 0, 80, 0.2); color: #ff3b6c; border-color: rgba(255, 0, 80, 0.35); }
    .sc-platform-tag.x { background: rgba(29, 155, 240, 0.2); color: #38bdf8; border-color: rgba(29, 155, 240, 0.35); }
    .sc-platform-tag.douyin { background: rgba(254, 44, 85, 0.2); color: #fb7185; border-color: rgba(254, 44, 85, 0.35); }
    .sc-platform-tag.youtube { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.35); }

    .sc-refresh-btn {
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .sc-refresh-btn:hover { color: #ffffff; }

    .sc-url-input {
      width: 100%;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      outline: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Category Dropdown */
    .sc-field-row {
      margin-bottom: 12px;
    }

    .sc-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .sc-select {
      width: 100%;
      background: rgba(12, 14, 20, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: #ffffff;
      padding: 9px 12px;
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }
    .sc-select option {
      background: #181a24;
      color: #ffffff;
    }

    /* Checkbox Options */
    .sc-options-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 14px;
    }

    .sc-checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.75);
      cursor: pointer;
      user-select: none;
    }

    .sc-checkbox-label input {
      accent-color: #8b5cf6;
      width: 14px;
      height: 14px;
      cursor: pointer;
    }

    /* Action Button (Tải Về Kho) */
    .sc-download-btn {
      width: 100%;
      padding: 12px;
      border-radius: 12px;
      background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%);
      color: #ffffff;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.3px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 18px rgba(139, 92, 246, 0.45);
      transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
    }

    .sc-download-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 24px rgba(139, 92, 246, 0.6);
    }
    .sc-download-btn:active {
      transform: translateY(1px);
    }
    .sc-download-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    /* Thanh Tiến Độ Kính Mờ (Giống hệt ảnh 4) */
    .sc-progress-box {
      margin-top: 14px;
      padding: 12px 14px;
      background: rgba(12, 14, 22, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      display: none;
    }
    .sc-progress-box.active {
      display: block;
      animation: fadeIn 0.3s ease;
    }

    .sc-progress-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .sc-progress-status {
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 250px;
    }

    .sc-progress-percent {
      font-size: 14px;
      font-weight: 700;
      color: #38bdf8;
    }

    .sc-progress-track {
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
      overflow: hidden;
      position: relative;
    }

    .sc-progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #8b5cf6, #ec4899, #38bdf8);
      border-radius: 9999px;
      transition: width 0.3s ease;
      position: relative;
    }

    .sc-progress-fill::after {
      content: "";
      position: absolute;
      top: 0; left: 0; bottom: 0; right: 0;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
      animation: shimmer 1.8s infinite;
    }

    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    .sc-progress-sub {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 6px;
    }

    /* History Box Styles */
    .sc-history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .sc-history-title {
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: rgba(255, 255, 255, 0.6);
      text-transform: uppercase;
    }

    .sc-history-count {
      color: #a855f7;
      margin-left: 4px;
    }

    .sc-pill-btn {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
      font-size: 10.5px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 9999px;
      cursor: pointer;
    }
    .sc-pill-btn:hover { background: rgba(239, 68, 68, 0.35); }

    .sc-history-list {
      flex: 1;
      overflow-y: auto;
      max-height: 380px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
    }

    .sc-history-list::-webkit-scrollbar {
      width: 4px;
    }
    .sc-history-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }

    .sc-history-item {
      background: rgba(15, 17, 24, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 8px;
      display: flex;
      gap: 8px;
      align-items: center;
      transition: background 0.15s, border-color 0.15s;
    }
    .sc-history-item:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.18);
    }

    .sc-history-thumb {
      width: 50px;
      height: 50px;
      border-radius: 8px;
      object-fit: cover;
      background: #2a2d3d;
      flex-shrink: 0;
    }

    .sc-history-info {
      flex: 1;
      min-width: 0;
    }

    .sc-history-name {
      font-size: 11.5px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 3px;
    }

    .sc-history-meta {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.45);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sc-open-os-btn {
      margin-top: 10px;
      width: 100%;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: rgba(255, 255, 255, 0.85);
      font-size: 11.5px;
      font-weight: 600;
      padding: 7px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none;
    }
    .sc-open-os-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  // HTML Structure
  const container = document.createElement("div");
  container.innerHTML = `
    <!-- Floating Orb -->
    <div class="sc-orb" id="scOrb" title="SocialContent OS - Tải video nhanh">
      <svg viewBox="0 0 24 24">
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
      </svg>
      <div class="sc-orb-badge" id="scBadge"></div>
    </div>

    <!-- Floating Frosted Glass Window -->
    <div class="sc-window-wrapper" id="scWindow">
      <!-- Main Download Card -->
      <div class="sc-card">
        <div class="sc-header">
          <div class="sc-brand-badge">
            <span class="sc-brand-dot"></span>
            SOCIALCONTENT OS • MINI
          </div>
          <button class="sc-close-btn" id="scCloseBtn" title="Đóng">✕</button>
        </div>

        <div class="sc-title">
          <span>⚡ Tải Video Siêu Tốc</span>
        </div>

        <!-- Detected URL -->
        <div class="sc-url-container">
          <div class="sc-url-top">
            <span class="sc-platform-tag" id="scPlatformTag">ĐANG PHÁT HIỆN...</span>
            <button class="sc-refresh-btn" id="scRefreshUrlBtn" title="Bắt lại link trên trang hiện tại">
              🔄 Bắt link
            </button>
          </div>
          <input type="text" class="sc-url-input" id="scUrlInput" placeholder="Dán hoặc link tự nhận diện..." />
        </div>

        <!-- Category Select -->
        <div class="sc-field-row">
          <label class="sc-label">LƯU VÀO DANH MỤC</label>
          <select class="sc-select" id="scCategorySelect">
            <option value="all">📂 Tất cả video (Mặc định)</option>
          </select>
        </div>

        <!-- Options -->
        <div class="sc-options-row">
          <label class="sc-checkbox-label">
            <input type="checkbox" id="scDriveCheck" checked />
            <span>Đồng bộ Google Drive</span>
          </label>
          <label class="sc-checkbox-label">
            <input type="checkbox" id="scPrivateCheck" />
            <span>Lưu riêng tư</span>
          </label>
        </div>

        <!-- Download Action Button -->
        <button class="sc-download-btn" id="scDownloadBtn">
          <span>⚡ TẢI VỀ KHO NGAY</span>
        </button>

        <!-- Progress Box (Y hệt ảnh 4: Analyze image 35%) -->
        <div class="sc-progress-box" id="scProgressBox">
          <div class="sc-progress-top">
            <span class="sc-progress-status" id="scProgressStatus">Đang chuẩn bị...</span>
            <span class="sc-progress-percent" id="scProgressPercent">0%</span>
          </div>
          <div class="sc-progress-track">
            <div class="sc-progress-fill" id="scProgressFill"></div>
          </div>
          <div class="sc-progress-sub">
            <span id="scProgressSpeed"></span>
            <span id="scProgressEta"></span>
          </div>
        </div>
      </div>

      <!-- History Card (Y hệt ảnh 4: "HISTORY 20/20") -->
      <div class="sc-history-card">
        <div class="sc-history-header">
          <div class="sc-history-title">
            HISTORY <span class="sc-history-count" id="scHistoryCount">0/20</span>
          </div>
          <button class="sc-pill-btn" id="scClearHistoryBtn">Clear</button>
        </div>

        <div class="sc-history-list" id="scHistoryList">
          <div style="font-size: 11px; color: rgba(255, 255, 255, 0.4); text-align: center; margin-top: 40px;">
            Chưa có video tải gần đây
          </div>
        </div>

        <a href="http://localhost:5173" target="_blank" class="sc-open-os-btn">
          🚀 Mở SocialContent Studio OS
        </a>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(container);

  // References
  const orb = shadow.getElementById("scOrb");
  const badge = shadow.getElementById("scBadge");
  const windowWrapper = shadow.getElementById("scWindow");
  const closeBtn = shadow.getElementById("scCloseBtn");
  const urlInput = shadow.getElementById("scUrlInput");
  const platformTag = shadow.getElementById("scPlatformTag");
  const refreshUrlBtn = shadow.getElementById("scRefreshUrlBtn");
  const categorySelect = shadow.getElementById("scCategorySelect");
  const driveCheck = shadow.getElementById("scDriveCheck");
  const privateCheck = shadow.getElementById("scPrivateCheck");
  const downloadBtn = shadow.getElementById("scDownloadBtn");
  const progressBox = shadow.getElementById("scProgressBox");
  const progressStatus = shadow.getElementById("scProgressStatus");
  const progressPercent = shadow.getElementById("scProgressPercent");
  const progressFill = shadow.getElementById("scProgressFill");
  const progressSpeed = shadow.getElementById("scProgressSpeed");
  const progressEta = shadow.getElementById("scProgressEta");
  const historyList = shadow.getElementById("scHistoryList");
  const historyCount = shadow.getElementById("scHistoryCount");
  const clearHistoryBtn = shadow.getElementById("scClearHistoryBtn");

  let currentTaskId = null;
  let isDragging = false;
  let dragStartY = 0;
  let startTop = 0;

  // Restore saved Orb position
  const savedY = localStorage.getItem("sc_orb_top");
  if (savedY) {
    orb.style.top = savedY;
    windowWrapper.style.top = savedY;
  }

  // Dragging Orb logic along the right edge
  orb.addEventListener("mousedown", (e) => {
    isDragging = false;
    dragStartY = e.clientY;
    const rect = orb.getBoundingClientRect();
    startTop = rect.top + rect.height / 2;

    const onMouseMove = (ev) => {
      const deltaY = ev.clientY - dragStartY;
      if (Math.abs(deltaY) > 4) isDragging = true;
      let newTop = startTop + deltaY;
      newTop = Math.max(40, Math.min(window.innerHeight - 40, newTop));
      orb.style.top = `${newTop}px`;
      windowWrapper.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (isDragging) {
        localStorage.setItem("sc_orb_top", orb.style.top);
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  // Toggle Window
  orb.addEventListener("click", () => {
    if (isDragging) return;
    const isOpen = windowWrapper.classList.toggle("open");
    if (isOpen) {
      detectAndFillCurrentUrl();
      loadCategories();
      loadHistory();
    }
  });

  closeBtn.addEventListener("click", () => {
    windowWrapper.classList.remove("open");
  });

  refreshUrlBtn.addEventListener("click", () => {
    detectAndFillCurrentUrl(true);
  });

  // Smart Detect Current Video Link from Page DOM
  function detectAndFillCurrentUrl(force = false) {
    let url = window.location.href;
    const host = window.location.hostname;
    let platform = "web";
    let platformName = "WEB LINK";

    if (host.includes("tiktok.com")) {
      platform = "tiktok";
      platformName = "TIKTOK VIDEO";
      // Try to find currently focused or playing video in feed
      const activeVideo = document.querySelector('video');
      if (activeVideo) {
        const itemContainer = activeVideo.closest('[data-e2e="recommend-list-item-container"], [data-e2e="user-post-item"], div[class*="ItemContainer"]');
        if (itemContainer) {
          const linkEl = itemContainer.querySelector('a[href*="/video/"]');
          if (linkEl && linkEl.href) url = linkEl.href;
        }
      }
    } else if (host.includes("x.com") || host.includes("twitter.com")) {
      platform = "x";
      platformName = "X / TWITTER POST";
      // If browsing timeline, detect active tweet article
      if (!url.includes("/status/")) {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        for (const tw of tweets) {
          const rect = tw.getBoundingClientRect();
          if (rect.top >= 0 && rect.top <= window.innerHeight * 0.6) {
            const link = tw.querySelector('a[href*="/status/"]');
            if (link && link.href) {
              url = link.href;
              break;
            }
          }
        }
      }
    } else if (host.includes("douyin.com")) {
      platform = "douyin";
      platformName = "DOUYIN VIDEO";
      const modalLink = document.querySelector('a[href*="/video/"]');
      if (modalLink && modalLink.href) url = modalLink.href;
    } else if (host.includes("youtube.com")) {
      platform = "youtube";
      platformName = url.includes("/shorts/") ? "YOUTUBE SHORTS" : "YOUTUBE VIDEO";
    } else if (host.includes("facebook.com")) {
      platform = "facebook";
      platformName = "FACEBOOK REELS";
    } else if (host.includes("instagram.com")) {
      platform = "instagram";
      platformName = "INSTAGRAM REEL";
    }

    urlInput.value = url;
    platformTag.className = `sc-platform-tag ${platform}`;
    platformTag.textContent = platformName;
  }

  // Load categories from backend via background service worker
  function loadCategories() {
    chrome.runtime.sendMessage({ action: "GET_CATEGORIES" }, (res) => {
      if (res && res.success && Array.isArray(res.categories)) {
        categorySelect.innerHTML = `<option value="all">📂 Tất cả video (Mặc định)</option>`;
        res.categories.forEach(cat => {
          if (cat.id !== "all") {
            const opt = document.createElement("option");
            opt.value = cat.id;
            opt.textContent = `${cat.name || cat.id}`;
            categorySelect.appendChild(opt);
          }
        });
      }
    });
  }

  // Load History
  function loadHistory() {
    chrome.runtime.sendMessage({ action: "GET_HISTORY" }, (res) => {
      if (res && res.success) {
        renderHistory(res.history || []);
      }
    });
  }

  function renderHistory(items) {
    historyCount.textContent = `${items.length}/20`;
    if (!items.length) {
      historyList.innerHTML = `
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.4); text-align: center; margin-top: 40px;">
          Chưa có video tải gần đây
        </div>
      `;
      return;
    }

    historyList.innerHTML = items.map(item => `
      <div class="sc-history-item" title="${escapeHtml(item.title)}">
        <img class="sc-history-thumb" src="${item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100'}" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100'" />
        <div class="sc-history-info">
          <div class="sc-history-name">${escapeHtml(item.title)}</div>
          <div class="sc-history-meta">
            <span class="sc-platform-tag ${item.platform}">${item.platform.toUpperCase()}</span>
            <span>${item.savedAt || ''}</span>
          </div>
        </div>
      </div>
    `).join("");
  }

  clearHistoryBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "CLEAR_HISTORY" });
  });

  // Start Download Action
  downloadBtn.addEventListener("click", () => {
    const targetUrl = urlInput.value.trim();
    if (!targetUrl) {
      alert("Vui lòng cung cấp link video cần tải!");
      return;
    }

    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `<span>⏳ Đang gửi yêu cầu...</span>`;
    progressBox.classList.add("active");
    progressStatus.textContent = "Đang kết nối luồng tải siêu tốc...";
    progressPercent.textContent = "10%";
    progressFill.style.width = "10%";
    badge.classList.add("active");

    chrome.runtime.sendMessage({
      action: "START_DOWNLOAD",
      url: targetUrl,
      category_id: categorySelect.value,
      sync_to_drive: driveCheck.checked,
      is_private: privateCheck.checked
    }, (res) => {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = `<span>⚡ TẢI VỀ KHO NGAY</span>`;

      if (res && res.success) {
        currentTaskId = res.data ? res.data.task_id : null;
      } else {
        progressStatus.textContent = "Lỗi: " + (res?.error || "Không thể kết nối Backend!");
        progressFill.style.background = "#ef4444";
        badge.classList.remove("active");
      }
    });
  });

  // Listen for Realtime WebSocket events forwarded from background.js
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "WS_EVENT" && msg.payload) {
      const data = msg.payload;

      if (data.type === "task_update" && data.task) {
        const task = data.task;
        progressBox.classList.add("active");
        progressStatus.textContent = task.title || task.status || "Đang tải video...";
        const p = task.percent || 0;
        progressPercent.textContent = `${p}%`;
        progressFill.style.width = `${p}%`;
        progressSpeed.textContent = task.speed ? `Tốc độ: ${task.speed}` : "";
        progressEta.textContent = task.eta ? `Còn lại: ${task.eta}` : "";
        badge.classList.add("active");
      }

      if (data.type === "task_completed") {
        progressStatus.textContent = "✅ Hoàn thành! Đã lưu vào Kho Video";
        progressPercent.textContent = "100%";
        progressFill.style.width = "100%";
        badge.classList.remove("active");
        loadHistory();
      }

      if (data.type === "task_error") {
        progressStatus.textContent = "❌ Lỗi: " + (data.error || "Tải thất bại");
        progressFill.style.background = "#ef4444";
        badge.classList.remove("active");
      }
    }

    if (msg.type === "HISTORY_UPDATED") {
      renderHistory(msg.history || []);
    }
  });

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
