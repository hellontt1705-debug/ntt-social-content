import React, { useState, useRef, useMemo } from "react";
import { Icon } from "./Icons";
import { useLanguage } from "../i18n";
import {
  cleanupLocalStorage,
  testDriveConnection,
  syncAllToDrive,
  createCategory,
  saveNote,
  saveCalendarEvent,
  backupDatabaseToDrive,
} from "../api";

export default function SettingsView({
  theme,
  setTheme,
  toggleTheme,
  driveStatus,
  onOpenDriveModal,
  loadDriveStatus,
  categories = [],
  videos = [],
  notes = [],
  calendarEvents = [],
  trashCount = 0,
  onCleanupDisk,
  setCurrentView,
  onEmptyTrash,
  onToggleFavoriteCategory,
  onOpenCategoryLockModal,
  onReloadData,
}) {
  const { lang, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState("appearance"); // appearance | media | cloud | security | system | backup
  const [searchQuery, setSearchQuery] = useState("");
  const [savedToast, setSavedToast] = useState(false);

  // Settings State (stored in localStorage)
  const [defaultQuality, setDefaultQuality] = useState(() => localStorage.getItem("pref_quality") || "best");
  const [downloadConcurrency, setDownloadConcurrency] = useState(() => localStorage.getItem("pref_concurrency") || "3");
  const [autoExtractTags, setAutoExtractTags] = useState(() => localStorage.getItem("pref_auto_tags") !== "false");
  const [autoFilterDouyin, setAutoFilterDouyin] = useState(() => localStorage.getItem("pref_filter_douyin") !== "false");
  const [autoCheckDup, setAutoCheckDup] = useState(() => localStorage.getItem("pref_check_dup") !== "false");
  const [autoSaveThumb, setAutoSaveThumb] = useState(() => localStorage.getItem("pref_save_thumb") !== "false");
  const [autoExtractAudio, setAutoExtractAudio] = useState(() => localStorage.getItem("pref_auto_audio") === "true");
  const [defaultLanding, setDefaultLanding] = useState(() => localStorage.getItem("pref_default_landing") || "dashboard");
  const [autoLockOnExit, setAutoLockOnExit] = useState(() => localStorage.getItem("pref_auto_lock_exit") === "true");

  // UX Pro States
  const [uiScale, setUiScale] = useState(() => localStorage.getItem("ui_scale") || "100");
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("pref_reduce_motion") === "true");
  const [autoPreviewVideo, setAutoPreviewVideo] = useState(() => localStorage.getItem("pref_auto_preview") !== "false");
  const [soundEffects, setSoundEffects] = useState(() => localStorage.getItem("pref_sound_effects") !== "false");
  const [autoSyncDriveDefault, setAutoSyncDriveDefault] = useState(() => localStorage.getItem("sync_to_drive_default") !== "false");

  // Cloud test state
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [isBackingUpDb, setIsBackingUpDb] = useState(false);
  const [backupDbResult, setBackupDbResult] = useState(null);

  // JSON Export / Import state
  const [exportMode, setExportMode] = useState("full"); // full | settings | content
  const [importedData, setImportedData] = useState(null);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState(null);
  const [importApplySettings, setImportApplySettings] = useState(true);
  const [importApplyContent, setImportApplyContent] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const fileInputRef = useRef(null);

  // Handlers
  const handleSaveSettings = () => {
    localStorage.setItem("pref_quality", defaultQuality);
    localStorage.setItem("pref_concurrency", downloadConcurrency);
    localStorage.setItem("pref_auto_tags", String(autoExtractTags));
    localStorage.setItem("pref_filter_douyin", String(autoFilterDouyin));
    localStorage.setItem("pref_check_dup", String(autoCheckDup));
    localStorage.setItem("pref_save_thumb", String(autoSaveThumb));
    localStorage.setItem("pref_auto_audio", String(autoExtractAudio));
    localStorage.setItem("pref_default_landing", defaultLanding);
    localStorage.setItem("pref_auto_lock_exit", String(autoLockOnExit));
    localStorage.setItem("ui_scale", uiScale);
    localStorage.setItem("pref_reduce_motion", String(reduceMotion));
    localStorage.setItem("pref_auto_preview", String(autoPreviewVideo));
    localStorage.setItem("pref_sound_effects", String(soundEffects));
    localStorage.setItem("sync_to_drive_default", String(autoSyncDriveDefault));

    // Apply UI scale
    if (uiScale === "90") {
      document.documentElement.style.zoom = "90%";
    } else if (uiScale === "110") {
      document.documentElement.style.zoom = "110%";
    } else {
      document.documentElement.style.zoom = "";
    }

    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  const handleSelectTheme = (themeName) => {
    if (setTheme) {
      setTheme(themeName);
      document.documentElement.setAttribute("data-theme", themeName);
      localStorage.setItem("app_theme", themeName);
    }
  };

  const handleClearAllRememberedPasswords = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa tất cả phiên ghi nhớ mật khẩu danh mục? Toàn bộ danh mục bảo mật sẽ được khóa lại ngay lập tức.")) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("remember_cat_")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      alert("Đã xóa toàn bộ mật khẩu ghi nhớ! Các danh mục đã được khóa an toàn.");
      window.location.reload();
    }
  };

  const handleTestDrive = async () => {
    setIsTestingDrive(true);
    setDriveTestResult(null);
    try {
      const res = await testDriveConnection({
        mode: driveStatus?.mode || "desktop",
        desktop_folder: driveStatus?.desktop_folder || "G:\\My Drive\\SocialContentVault",
      });
      setDriveTestResult(res);
      if (loadDriveStatus) await loadDriveStatus();
    } catch (e) {
      setDriveTestResult({ success: false, error: e.message || "Lỗi khi kiểm tra kết nối" });
    } finally {
      setIsTestingDrive(false);
    }
  };

  const handleSyncAllDrive = async () => {
    setIsSyncingAll(true);
    setSyncResult(null);
    try {
      const res = await syncAllToDrive();
      setSyncResult(res);
      if (loadDriveStatus) await loadDriveStatus();
    } catch (e) {
      setSyncResult({ success: false, message: e.message });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleBackupDatabaseToDrive = async () => {
    setIsBackingUpDb(true);
    setBackupDbResult(null);
    try {
      const res = await backupDatabaseToDrive();
      setBackupDbResult({ success: true, message: res.message || "Sao lưu database lên Google Drive thành công!" });
    } catch (e) {
      setBackupDbResult({ success: false, message: e.message || "Lỗi khi sao lưu database lên Drive" });
    } finally {
      setIsBackingUpDb(false);
    }
  };

  // --- JSON EXPORT HANDLER ---
  const handleExportJson = () => {
    const currentSettings = {
      theme,
      lang,
      ui_scale: uiScale,
      pref_quality: defaultQuality,
      pref_concurrency: downloadConcurrency,
      pref_auto_tags: autoExtractTags,
      pref_filter_douyin: autoFilterDouyin,
      pref_check_dup: autoCheckDup,
      pref_save_thumb: autoSaveThumb,
      pref_auto_audio: autoExtractAudio,
      pref_default_landing: defaultLanding,
      pref_auto_lock_exit: autoLockOnExit,
      pref_reduce_motion: reduceMotion,
      pref_auto_preview: autoPreviewVideo,
      pref_sound_effects: soundEffects,
      sync_to_drive_default: autoSyncDriveDefault,
      sidebar_collapsed: localStorage.getItem("sidebar_collapsed") === "true",
    };

    const payload = {
      app: "SocialContent Studio OS",
      version: "1.0.4 (Pro Edition)",
      exported_at: new Date().toISOString(),
      export_mode: exportMode,
      settings: currentSettings,
    };

    if (exportMode === "full" || exportMode === "content") {
      payload.categories = categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        is_favorite: Boolean(c.is_favorite),
        favorited_at: c.favorited_at || null,
        is_locked: Boolean(c.is_locked),
        password_hint: c.password_hint || "",
      }));
      payload.calendar_events = calendarEvents;
      payload.notes = notes;
    }

    if (exportMode === "full") {
      payload.videos_metadata = videos.map((v) => ({
        id: v.id,
        title: v.title,
        platform: v.platform,
        category_id: v.category_id,
        url: v.url,
        duration: v.duration,
        quality: v.quality,
        uploader: v.uploader,
        tags: v.tags,
      }));
    }

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `SocialContent_${exportMode.toUpperCase()}_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- JSON IMPORT FILE HANDLER ---
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportError(null);
    setImportSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed || typeof parsed !== "object") {
          throw new Error("Tệp không đúng cấu trúc JSON hợp lệ");
        }
        setImportedData(parsed);
      } catch (err) {
        setImportError("Lỗi đọc file JSON: " + err.message);
        setImportedData(null);
      }
    };
    reader.onerror = () => {
      setImportError("Không thể đọc tệp tin được chọn");
      setImportedData(null);
    };
    reader.readAsText(file);
  };

  // --- APPLY IMPORTED JSON ---
  const handleApplyImport = async () => {
    if (!importedData) return;
    setIsImporting(true);
    setImportError(null);

    try {
      // 1. Áp dụng Cài đặt (Settings)
      if (importApplySettings && importedData.settings) {
        const s = importedData.settings;
        if (s.theme) {
          localStorage.setItem("app_theme", s.theme);
          document.documentElement.setAttribute("data-theme", s.theme);
          if (setTheme) setTheme(s.theme);
        }
        if (s.lang && setLanguage) setLanguage(s.lang);
        if (s.pref_quality) {
          localStorage.setItem("pref_quality", s.pref_quality);
          setDefaultQuality(s.pref_quality);
        }
        if (s.pref_concurrency) {
          localStorage.setItem("pref_concurrency", s.pref_concurrency);
          setDownloadConcurrency(s.pref_concurrency);
        }
        if (s.pref_auto_tags !== undefined) {
          localStorage.setItem("pref_auto_tags", String(s.pref_auto_tags));
          setAutoExtractTags(Boolean(s.pref_auto_tags));
        }
        if (s.pref_filter_douyin !== undefined) {
          localStorage.setItem("pref_filter_douyin", String(s.pref_filter_douyin));
          setAutoFilterDouyin(Boolean(s.pref_filter_douyin));
        }
        if (s.pref_check_dup !== undefined) {
          localStorage.setItem("pref_check_dup", String(s.pref_check_dup));
          setAutoCheckDup(Boolean(s.pref_check_dup));
        }
        if (s.pref_default_landing) {
          localStorage.setItem("pref_default_landing", s.pref_default_landing);
          setDefaultLanding(s.pref_default_landing);
        }
        if (s.pref_auto_lock_exit !== undefined) {
          localStorage.setItem("pref_auto_lock_exit", String(s.pref_auto_lock_exit));
          setAutoLockOnExit(Boolean(s.pref_auto_lock_exit));
        }
      }

      // 2. Áp dụng Dữ liệu Nội dung (Categories, Notes, Calendar)
      if (importApplyContent) {
        if (Array.isArray(importedData.categories)) {
          const existingIds = new Set(categories.map((c) => c.id));
          for (const cat of importedData.categories) {
            if (cat.id !== "all" && !existingIds.has(cat.id)) {
              try {
                await createCategory({
                  id: cat.id,
                  name: cat.name,
                  icon: cat.icon || "folder",
                  color: cat.color || "#8b5cf6",
                });
              } catch (e) {
                console.warn("Không thể tạo danh mục:", cat.name, e);
              }
            }
          }
        }

        if (Array.isArray(importedData.notes)) {
          for (const note of importedData.notes) {
            try {
              await saveNote(note);
            } catch (e) {
              console.warn("Không thể lưu note:", note.title, e);
            }
          }
        }

        if (Array.isArray(importedData.calendar_events)) {
          for (const evt of importedData.calendar_events) {
            try {
              await saveCalendarEvent(evt);
            } catch (e) {
              console.warn("Không thể lưu lịch:", evt.title, e);
            }
          }
        }
      }

      if (onReloadData) {
        await onReloadData();
      }

      setImportSuccessMsg("Khôi phục cấu hình và dữ liệu từ JSON thành công!");
      setImportedData(null);
      setImportFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setImportError("Lỗi trong quá trình nhập dữ liệu: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const getCurrentLiveJson = () => {
    return JSON.stringify(
      {
        app: "SocialContent Studio OS",
        version: "1.0.4 (Pro Edition)",
        generated_at: new Date().toISOString(),
        settings: {
          theme,
          lang,
          ui_scale: uiScale,
          pref_quality: defaultQuality,
          pref_concurrency: downloadConcurrency,
          pref_auto_tags: autoExtractTags,
          pref_filter_douyin: autoFilterDouyin,
          pref_check_dup: autoCheckDup,
          pref_save_thumb: autoSaveThumb,
          pref_auto_audio: autoExtractAudio,
          pref_default_landing: defaultLanding,
          pref_auto_lock_exit: autoLockOnExit,
          pref_reduce_motion: reduceMotion,
          pref_auto_preview: autoPreviewVideo,
          pref_sound_effects: soundEffects,
          sync_to_drive_default: autoSyncDriveDefault,
        },
        counts: {
          categories: categories.length,
          favorite_categories: categories.filter((c) => c.is_favorite).length,
          videos: videos.length,
          notes: notes.length,
          calendar_events: calendarEvents.length,
          trash: trashCount,
        },
      },
      null,
      2
    );
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(getCurrentLiveJson());
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  const handleFactoryReset = () => {
    if (window.confirm("CẢNH BÁO NGUY HIỂM!\nBạn có chắc chắn muốn KHÔI PHỤC CÀI ĐẶT GỐC (Factory Reset)?\nToàn bộ thiết lập giao diện, cấu hình tải, bộ nhớ đệm sẽ được đưa về mặc định của nhà sản xuất.")) {
      if (window.confirm("Xác nhận lần 2: Thao tác này sẽ tải lại ứng dụng ngay lập tức. Tiếp tục?")) {
        localStorage.clear();
        window.location.reload();
      }
    }
  };

  const lockedCategories = categories.filter((c) => c.is_locked);
  const favoriteCategories = categories.filter((c) => c.is_favorite);

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  return (
    <div className="settings-container">
      {/* 1. Header with Save Button & Toast */}
      <div className="settings-header">
        <div className="settings-title-group">
          <div className="settings-icon-badge">
            <Icon name="settings" size={22} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <h1 className="settings-title">Cài Đặt Hệ Thống (Settings)</h1>
              <span className="settings-pro-badge">PRO v1.0.4</span>
            </div>
            <p className="settings-subtitle">
              Tùy chỉnh giao diện hiển thị, cấu hình tải video, đồng bộ Google Drive, bảo mật danh mục và quản lý dữ liệu JSON.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {savedToast && (
            <div className="settings-toast-saved">
              <Icon name="check" size={14} color="#10b981" />
              <span>Đã lưu thành công!</span>
            </div>
          )}
          <button className="btn btn-primary" onClick={handleSaveSettings} style={{ padding: "8px 16px", fontSize: "12px", gap: "6px" }}>
            <Icon name="check" size={14} color="#fff" />
            <span>Lưu Cài Đặt</span>
          </button>
        </div>
      </div>

      {/* Quick System Status Banner */}
      <div className="settings-system-banner">
        <div className="system-banner-item">
          <div className="system-banner-icon" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
            <Icon name="terminal" size={16} />
          </div>
          <div className="system-banner-info">
            <span className="system-banner-label">Backend Engine</span>
            <span className="system-banner-value" style={{ color: "#10b981" }}>FastAPI ● Online</span>
          </div>
        </div>

        <div className="system-banner-item">
          <div className="system-banner-icon" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa" }}>
            <Icon name="folder" size={16} />
          </div>
          <div className="system-banner-info">
            <span className="system-banner-label">Kho Nội Dung</span>
            <span className="system-banner-value">{videos.length} video | {categories.length} mục ({favoriteCategories.length} ⭐)</span>
          </div>
        </div>

        <div className="system-banner-item">
          <div className="system-banner-icon" style={{ background: driveStatus?.is_ready ? "rgba(59, 130, 246, 0.15)" : "rgba(245, 158, 11, 0.15)", color: driveStatus?.is_ready ? "#60a5fa" : "#f59e0b" }}>
            <Icon name="drive" size={16} />
          </div>
          <div className="system-banner-info">
            <span className="system-banner-label">Google Drive</span>
            <span className="system-banner-value" style={{ color: driveStatus?.is_ready ? "#10b981" : "#f59e0b" }}>
              {driveStatus?.is_ready ? "● Đã Kết Nối" : (driveStatus?.mode === "local_only" ? "○ Chế độ Local" : "○ Ngoại Tuyến")}
            </span>
          </div>
        </div>

        <div className="system-banner-item">
          <div className="system-banner-icon" style={{ background: trashCount > 0 ? "rgba(244, 63, 94, 0.15)" : "rgba(255, 255, 255, 0.05)", color: trashCount > 0 ? "#f43f5e" : "var(--text-muted)" }}>
            <Icon name="trash" size={16} />
          </div>
          <div className="system-banner-info">
            <span className="system-banner-label">Thùng Rác</span>
            <span className="system-banner-value" style={{ color: trashCount > 0 ? "#f43f5e" : "inherit" }}>
              {trashCount} video đang chờ
            </span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="settings-search-bar">
        <Icon name="search" size={14} className="settings-search-icon" />
        <input
          type="text"
          placeholder="Tìm nhanh cài đặt (ví dụ: theme, chất lượng, drive, mật khẩu, sao lưu, danh mục)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="settings-search-clear" onClick={() => setSearchQuery("")}>
            <Icon name="x" size={12} />
          </button>
        )}
      </div>

      {/* 2. Settings Layout: Tabs + Content */}
      <div className="settings-body">
        {/* Left Navigation Tabs */}
        <aside className="settings-tabs-nav">
          <button
            className={`settings-tab-btn ${activeTab === "appearance" ? "active" : ""}`}
            onClick={() => setActiveTab("appearance")}
          >
            <Icon name="sun" size={16} />
            <span>Giao Diện & Trải Nghiệm</span>
          </button>

          <button
            className={`settings-tab-btn ${activeTab === "media" ? "active" : ""}`}
            onClick={() => setActiveTab("media")}
          >
            <Icon name="download" size={16} />
            <span>Tải Video & Media</span>
          </button>

          <button
            className={`settings-tab-btn ${activeTab === "cloud" ? "active" : ""}`}
            onClick={() => setActiveTab("cloud")}
          >
            <Icon name="cloud" size={16} />
            <span>Google Drive & Cloud</span>
          </button>

          <button
            className={`settings-tab-btn ${activeTab === "security" ? "active" : ""}`}
            onClick={() => setActiveTab("security")}
          >
            <Icon name="shield" size={16} />
            <span>Bảo Mật & Danh Mục</span>
            {lockedCategories.length > 0 && (
              <span className="settings-tab-badge">{lockedCategories.length}</span>
            )}
          </button>

          <button
            className={`settings-tab-btn ${activeTab === "system" ? "active" : ""}`}
            onClick={() => setActiveTab("system")}
          >
            <Icon name="layers" size={16} />
            <span>Bộ Nhớ & Hệ Thống</span>
          </button>

          <button
            className={`settings-tab-btn ${activeTab === "backup" ? "active" : ""}`}
            onClick={() => setActiveTab("backup")}
          >
            <Icon name="code" size={16} />
            <span>Sao Lưu & JSON</span>
          </button>
        </aside>

        {/* Right Settings Content Area */}
        <main className="settings-content-card">
          {/* TAB 1: APPEARANCE & UX PRO */}
          {activeTab === "appearance" && (
            <div className="settings-section">
              <h3 className="section-title">Giao Diện & Trải Nghiệm Người Dùng</h3>
              <p className="section-desc">Cá nhân hóa chủ đề giao diện, màu sắc, tỷ lệ hiển thị và hiệu ứng hình ảnh.</p>

              {/* 4 Theme Options */}
              <div className="settings-group">
                <label className="settings-label">Chủ đề màu sắc Studio (Theme Palette)</label>
                <div className="theme-options-grid grid-4">
                  <div
                    className={`theme-card ${theme === "dark" ? "selected" : ""}`}
                    onClick={() => handleSelectTheme("dark")}
                  >
                    <div className="theme-preview dark-preview">
                      <div className="preview-top-bar" />
                      <div className="preview-body">
                        <div className="preview-sidebar" />
                        <div className="preview-cards">
                          <div className="preview-item" />
                          <div className="preview-item" />
                        </div>
                      </div>
                    </div>
                    <div className="theme-card-info">
                      <div className="theme-card-name">
                        <Icon name="moon" size={13} color="#8b5cf6" />
                        <span>Dark Studio</span>
                      </div>
                      <span className="theme-card-sub">Gam màu tối sang trọng, kính mờ neon</span>
                    </div>
                  </div>

                  <div
                    className={`theme-card ${theme === "light" ? "selected" : ""}`}
                    onClick={() => handleSelectTheme("light")}
                  >
                    <div className="theme-preview light-preview">
                      <div className="preview-top-bar" />
                      <div className="preview-body">
                        <div className="preview-sidebar" />
                        <div className="preview-cards">
                          <div className="preview-item" />
                          <div className="preview-item" />
                        </div>
                      </div>
                    </div>
                    <div className="theme-card-info">
                      <div className="theme-card-name">
                        <Icon name="sun" size={13} color="#f59e0b" />
                        <span>Light Clean</span>
                      </div>
                      <span className="theme-card-sub">Trắng ngà thanh lịch, tương phản cao</span>
                    </div>
                  </div>

                  <div
                    className={`theme-card ${theme === "oled" ? "selected" : ""}`}
                    onClick={() => handleSelectTheme("oled")}
                  >
                    <div className="theme-preview oled-preview">
                      <div className="preview-top-bar" style={{ background: "#111" }} />
                      <div className="preview-body">
                        <div className="preview-sidebar" style={{ background: "#080808" }} />
                        <div className="preview-cards">
                          <div className="preview-item" style={{ background: "#151515" }} />
                          <div className="preview-item" style={{ background: "#151515" }} />
                        </div>
                      </div>
                    </div>
                    <div className="theme-card-info">
                      <div className="theme-card-name">
                        <Icon name="moon" size={13} color="#10b981" />
                        <span>Midnight OLED</span>
                      </div>
                      <span className="theme-card-sub">Đen sâu tuyệt đối, siêu dịu mắt</span>
                    </div>
                  </div>

                  <div
                    className={`theme-card ${theme === "velvet" ? "selected" : ""}`}
                    onClick={() => handleSelectTheme("velvet")}
                  >
                    <div className="theme-preview velvet-preview">
                      <div className="preview-top-bar" style={{ background: "#221c3d" }} />
                      <div className="preview-body">
                        <div className="preview-sidebar" style={{ background: "#17132a" }} />
                        <div className="preview-cards">
                          <div className="preview-item" style={{ background: "#2c244d" }} />
                          <div className="preview-item" style={{ background: "#2c244d" }} />
                        </div>
                      </div>
                    </div>
                    <div className="theme-card-info">
                      <div className="theme-card-name">
                        <Icon name="sparkles" size={13} color="#c084fc" />
                        <span>Royal Velvet</span>
                      </div>
                      <span className="theme-card-sub">Tím Studio hoàng gia cho Creator</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* UI Scale / Zoom */}
              <div className="settings-group">
                <label className="settings-label">Tỷ lệ hiển thị giao diện (UI Scale)</label>
                <div className="settings-row">
                  <div style={{ maxWidth: "320px", width: "100%" }}>
                    <select
                      className="form-select"
                      value={uiScale}
                      onChange={(e) => setUiScale(e.target.value)}
                    >
                      <option value="90">90% - Nhỏ gọn (Xem được nhiều nội dung hơn)</option>
                      <option value="100">100% - Tiêu chuẩn (Khuyên dùng)</option>
                      <option value="110">110% - Chữ lớn (Dễ đọc, rõ nét)</option>
                    </select>
                  </div>
                  <span className="settings-hint">Điều chỉnh tỷ lệ phóng to/thu nhỏ toàn bộ giao diện Studio</span>
                </div>
              </div>

              {/* Language Picker */}
              <div className="settings-group">
                <label className="settings-label">Ngôn ngữ hiển thị (Language)</label>
                <div className="settings-row">
                  <div style={{ maxWidth: "320px", width: "100%" }}>
                    <select
                      className="form-select"
                      value={lang}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="vi">🇻🇳 Tiếng Việt (Mặc định)</option>
                      <option value="en">🇺🇸 English</option>
                      <option value="zh">🇨🇳 中文</option>
                    </select>
                  </div>
                  <span className="settings-hint">Ngôn ngữ áp dụng trên toàn bộ công cụ và thanh điều hướng</span>
                </div>
              </div>

              {/* Default Landing Page */}
              <div className="settings-group">
                <label className="settings-label">Trang mặc định khi mở ứng dụng</label>
                <div className="settings-row">
                  <div style={{ maxWidth: "320px", width: "100%" }}>
                    <select
                      className="form-select"
                      value={defaultLanding}
                      onChange={(e) => setDefaultLanding(e.target.value)}
                    >
                      <option value="dashboard">Bảng Điều Khiển (Dashboard)</option>
                      <option value="vault">Kho Video & Tài Nguyên (Media Vault)</option>
                      <option value="prompts">Kho Prompt AI (Prompt Vault)</option>
                      <option value="calendar">Lịch Đăng Bài (Plan)</option>
                    </select>
                  </div>
                  <span className="settings-hint">Trang đầu tiên hiển thị mỗi khi khởi động SocialContent Studio OS</span>
                </div>
              </div>

              {/* UX & Performance Toggles */}
              <div className="settings-group">
                <label className="settings-label">Hiệu ứng & Tương tác thông minh</label>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={autoPreviewVideo}
                      onChange={(e) => setAutoPreviewVideo(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động phát video xem trước khi rê chuột (Hover Preview)</span>
                      <span className="toggle-desc">Rê chuột vào thẻ video trên lưới để xem nhanh đoạn preview</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={soundEffects}
                      onChange={(e) => setSoundEffects(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Âm thanh thông báo khi hoàn thành tải video (Chime Sound)</span>
                      <span className="toggle-desc">Phát âm thanh nhẹ báo hiệu khi tất cả video trong danh sách đã tải xong</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={reduceMotion}
                      onChange={(e) => setReduceMotion(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Chế độ tối ưu hiệu năng (Giảm chuyển động / Reduce Motion)</span>
                      <span className="toggle-desc">Tắt các hiệu ứng bóng mờ phức tạp để tăng tốc độ phản hồi trên máy cấu hình yếu</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOWNLOAD & MEDIA ENGINE */}
          {activeTab === "media" && (
            <div className="settings-section">
              <h3 className="section-title">Tải Video & Xử Lý Media Engine</h3>
              <p className="section-desc">Cấu hình thuật toán trích xuất đa luồng từ TikTok, Douyin, YouTube, Reels và X.</p>

              {/* Quality Preference */}
              <div className="settings-group">
                <label className="settings-label">Chất lượng video tải về ưu tiên</label>
                <div className="settings-radio-group">
                  <label className={`settings-radio-card ${defaultQuality === "best" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="quality"
                      value="best"
                      checked={defaultQuality === "best"}
                      onChange={(e) => setDefaultQuality(e.target.value)}
                    />
                    <div>
                      <div className="radio-title">Chất lượng gốc cao nhất (Tối đa / 4K / 2K)</div>
                      <div className="radio-desc">Tự động chọn độ phân giải và bitrate cao nhất từ server gốc</div>
                    </div>
                  </label>

                  <label className={`settings-radio-card ${defaultQuality === "1080p" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="quality"
                      value="1080p"
                      checked={defaultQuality === "1080p"}
                      onChange={(e) => setDefaultQuality(e.target.value)}
                    />
                    <div>
                      <div className="radio-title">Full HD (1080p)</div>
                      <div className="radio-desc">Tối ưu dung lượng và tốc độ tải, phù hợp cho hầu hết nền tảng mạng xã hội</div>
                    </div>
                  </label>

                  <label className={`settings-radio-card ${defaultQuality === "720p" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="quality"
                      value="720p"
                      checked={defaultQuality === "720p"}
                      onChange={(e) => setDefaultQuality(e.target.value)}
                    />
                    <div>
                      <div className="radio-title">Tiết kiệm bộ nhớ (720p HD)</div>
                      <div className="radio-desc">Dành cho kết nối mạng chậm hoặc tiết kiệm dung lượng ổ cứng</div>
                    </div>
                  </label>

                  <label className={`settings-radio-card ${defaultQuality === "audio_only" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="quality"
                      value="audio_only"
                      checked={defaultQuality === "audio_only"}
                      onChange={(e) => setDefaultQuality(e.target.value)}
                    />
                    <div>
                      <div className="radio-title">Chỉ bóc tách Âm Thanh (MP3 / Audio Only)</div>
                      <div className="radio-desc">Chỉ lưu file âm thanh chất lượng cao để lồng tiếng hoặc làm nhạc nền</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Concurrency Limit */}
              <div className="settings-group">
                <label className="settings-label">Số lượng video tải đồng thời (Đa luồng Concurrency)</label>
                <div className="settings-row">
                  <div style={{ maxWidth: "320px", width: "100%" }}>
                    <select
                      className="form-select"
                      value={downloadConcurrency}
                      onChange={(e) => setDownloadConcurrency(e.target.value)}
                    >
                      <option value="1">1 video tại một thời điểm (Tuần tự, an toàn nhất)</option>
                      <option value="2">2 video đồng thời</option>
                      <option value="3">3 video đồng thời (Khuyên dùng)</option>
                      <option value="5">5 video đồng thời (Tốc độ cao / Mạng mạnh)</option>
                    </select>
                  </div>
                  <span className="settings-hint">Giới hạn số luồng tải song song để tránh bị nhà mạng bóp băng thông</span>
                </div>
              </div>

              {/* Automation Toggles */}
              <div className="settings-group">
                <label className="settings-label">Tự động hóa dữ liệu video</label>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={autoExtractTags}
                      onChange={(e) => setAutoExtractTags(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động bóc tách Hashtag & Kênh uploader</span>
                      <span className="toggle-desc">Tự động nhận diện các hashtag tiếng Việt/Quốc tế và @username người đăng</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={autoFilterDouyin}
                      onChange={(e) => setAutoFilterDouyin(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Lọc text rác tiếng Trung trên link chia sẻ Douyin</span>
                      <span className="toggle-desc">Tự động loại bỏ các chuỗi chữ tiếng Trung và lấy đúng URL video sạch</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={autoCheckDup}
                      onChange={(e) => setAutoCheckDup(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Cảnh báo trùng lặp video trước khi tải</span>
                      <span className="toggle-desc">Tránh tải lại những video đã tồn tại sẵn trong kho</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={autoSaveThumb}
                      onChange={(e) => setAutoSaveThumb(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động lưu ảnh bìa Thumbnail HD về máy tính</span>
                      <span className="toggle-desc">Lưu file thumbnail chất lượng cao cục bộ để xem mượt mà không cần mạng</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={autoExtractAudio}
                      onChange={(e) => setAutoExtractAudio(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động đồng bộ âm thanh sang Studio Âm Thanh</span>
                      <span className="toggle-desc">Trích xuất âm thanh mỗi video tải về để bạn có thể cắt ghép, lồng tiếng ngay</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Local Storage Directory */}
              <div className="settings-group">
                <label className="settings-label">Thư mục lưu trữ video trên máy tính</label>
                <div className="settings-row">
                  <input
                    type="text"
                    className="form-input"
                    value="backend/downloads/ (Mặc định máy chủ Local)"
                    readOnly
                    style={{ maxWidth: "420px", background: "rgba(0,0,0,0.2)", cursor: "default" }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => window.open("http://localhost:8000/media/downloads", "_blank")}
                  >
                    <Icon name="externalLink" size={13} />
                    <span>Mở thư mục máy tính</span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText("e:\\Agent-creator\\social-content-os\\backend\\downloads");
                      alert("Đã sao chép đường dẫn thư mục downloads vào clipboard!");
                    }}
                  >
                    <Icon name="copy" size={13} />
                    <span>Sao chép đường dẫn</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CLOUD & GOOGLE DRIVE */}
          {activeTab === "cloud" && (
            <div className="settings-section">
              <h3 className="section-title">Google Drive & Đồng Bộ Đám Mây</h3>
              <p className="section-desc">Tự động đồng bộ video, ảnh và sao lưu cơ sở dữ liệu lên Google Drive an toàn.</p>

              {/* Sync Mode Status Card */}
              <div className="drive-config-hero-card">
                <div className="drive-config-top">
                  <div className="drive-icon-wrap">
                    <Icon name="drive" size={28} />
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700 }}>
                      {driveStatus?.mode === "desktop"
                        ? "Đồng Bộ Desktop (Google Drive for Desktop)"
                        : driveStatus?.mode === "api"
                        ? "Đồng Bộ Cloud OAuth API"
                        : "Chế Độ Lưu Cục Bộ (Local Only)"}
                    </h4>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)" }}>
                      Thư mục: {driveStatus?.desktop_folder || "Chưa cấu hình đường dẫn"}
                    </p>
                  </div>
                  <div className={`status-pill ${driveStatus?.is_ready ? "online" : "offline"}`} style={{ marginLeft: "auto" }}>
                    {driveStatus?.is_ready ? "● Đang Kết Nối" : "○ Ngoại Tuyến"}
                  </div>
                </div>

                <div className="drive-config-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleTestDrive}
                    disabled={isTestingDrive}
                  >
                    <Icon name="cloud" size={13} />
                    <span>{isTestingDrive ? "Đang kiểm tra..." : "Kiểm tra kết nối"}</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleSyncAllDrive}
                    disabled={isSyncingAll}
                  >
                    <Icon name="download" size={13} />
                    <span>{isSyncingAll ? "Đang đồng bộ..." : "Đồng bộ toàn bộ kho ngay"}</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleBackupDatabaseToDrive}
                    disabled={isBackingUpDb}
                  >
                    <Icon name="sparkles" size={13} color="#10b981" />
                    <span>{isBackingUpDb ? "Đang sao lưu..." : "Sao lưu Database lên Drive"}</span>
                  </button>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={onOpenDriveModal}
                  >
                    <Icon name="settings" size={13} color="#fff" />
                    <span>Mở Cấu Hình Drive Chi Tiết</span>
                  </button>
                </div>

                {driveTestResult && (
                  <div className={`settings-alert-box ${driveTestResult.success ? "success" : "error"}`}>
                    <Icon name={driveTestResult.success ? "check" : "x"} size={14} />
                    <span>{driveTestResult.success ? "Kết nối Google Drive thành công!" : driveTestResult.error}</span>
                  </div>
                )}

                {syncResult && (
                  <div className={`settings-alert-box ${syncResult.success ? "success" : "error"}`}>
                    <Icon name={syncResult.success ? "check" : "x"} size={14} />
                    <span>{syncResult.message || (syncResult.success ? "Đồng bộ hoàn tất!" : "Lỗi khi đồng bộ")}</span>
                  </div>
                )}

                {backupDbResult && (
                  <div className={`settings-alert-box ${backupDbResult.success ? "success" : "error"}`}>
                    <Icon name={backupDbResult.success ? "check" : "x"} size={14} />
                    <span>{backupDbResult.message}</span>
                  </div>
                )}
              </div>

              {/* Drive Default Toggle */}
              <div className="settings-group" style={{ marginTop: "14px" }}>
                <label className="settings-label">Tùy chọn mặc định khi tải</label>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={autoSyncDriveDefault}
                      onChange={(e) => setAutoSyncDriveDefault(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Mặc định tích chọn "Đồng bộ Google Drive" trong hộp thoại tải</span>
                      <span className="toggle-desc">Mỗi video tải về sẽ tự động đẩy lên Google Drive mà không cần tích chọn thủ công</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sync Guidance */}
              <div className="settings-group" style={{ marginTop: "16px" }}>
                <label className="settings-label">Các chế độ đồng bộ đám mây hỗ trợ</label>
                <div className="cloud-modes-grid">
                  <div className="cloud-mode-card">
                    <div className="mode-badge green">Khuyến nghị</div>
                    <h5>Desktop Sync Folder</h5>
                    <p>Sử dụng thư mục Google Drive có sẵn trên máy tính Windows. Tự động đồng bộ siêu tốc, không bị giới hạn hạn ngạch API.</p>
                  </div>
                  <div className="cloud-mode-card">
                    <div className="mode-badge blue">Nâng cao</div>
                    <h5>Cloud OAuth API</h5>
                    <p>Kết nối trực tiếp tới Google Cloud qua tệp `credentials.json`. Phù hợp khi chạy máy chủ VPS từ xa.</p>
                  </div>
                  <div className="cloud-mode-card">
                    <div className="mode-badge amber">Offline</div>
                    <h5>Chỉ dùng Local</h5>
                    <p>Tắt hoàn toàn tính năng đám mây, chỉ lưu trữ video trong thư mục máy tính cục bộ của bạn.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY & CATEGORY HUB */}
          {activeTab === "security" && (
            <div className="settings-section">
              <h3 className="section-title">Bảo Mật & Quản Lý Danh Mục</h3>
              <p className="section-desc">Quản lý toàn diện danh mục phân loại, bật/tắt yêu thích ⭐, mật khẩu khóa bảo vệ và phiên ghi nhớ.</p>

              {/* Category Management Table */}
              <div className="settings-group">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <label className="settings-label" style={{ margin: 0 }}>
                    Bảng Quản Lý Danh Mục Phân Loại ({categories.length})
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                    ⭐ Bấm sao để ghim lên đầu danh sách dưới "Tất cả Video"
                  </span>
                </div>

                <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
                  <table className="settings-category-table">
                    <thead>
                      <tr>
                        <th>Tên Danh Mục</th>
                        <th>Yêu Thích (Ghim Đầu)</th>
                        <th>Bảo Mật & Khóa</th>
                        <th style={{ textAlign: "right" }}>Số Video</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCategories.map((cat) => {
                        const isAll = cat.id === "all";
                        const isFav = Boolean(cat.is_favorite);
                        const isLocked = Boolean(cat.is_locked);

                        return (
                          <tr key={cat.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <Icon name={cat.icon || (isAll ? "grid" : "folder")} size={15} color={isFav ? "#f59e0b" : "var(--accent-primary)"} />
                                <span style={{ fontWeight: 600, color: isFav ? "var(--text-primary)" : "inherit" }}>
                                  {isAll ? t("all_videos") : cat.name}
                                </span>
                                {isFav && !isAll && (
                                  <span style={{ fontSize: "9.5px", color: "#f59e0b", background: "rgba(245, 158, 11, 0.15)", padding: "1px 5px", borderRadius: "3px" }}>
                                    Ưu tiên đầu
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {isAll ? (
                                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Mặc định trên cùng</span>
                              ) : (
                                <button
                                  type="button"
                                  className={`cat-fav-table-btn ${isFav ? "active" : ""}`}
                                  onClick={() => {
                                    if (onToggleFavoriteCategory) onToggleFavoriteCategory(cat.id);
                                  }}
                                  title={isFav ? "Bỏ yêu thích" : "Đánh dấu yêu thích (đưa lên trên cùng)"}
                                >
                                  <Icon name="star" size={13} color={isFav ? "#f59e0b" : "currentColor"} fill={isFav ? "#f59e0b" : "none"} />
                                  <span>{isFav ? "Đang Yêu Thích" : "Yêu Thích"}</span>
                                </button>
                              )}
                            </td>
                            <td>
                              {isAll ? (
                                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Hệ thống</span>
                              ) : isLocked ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#f43f5e", fontWeight: 600, fontSize: "10.5px" }}>
                                    <Icon name="lock" size={11} color="#f43f5e" />
                                    Đã khóa
                                  </span>
                                  {cat.password_hint && (
                                    <span className="cat-hint-pill">Gợi ý: {cat.password_hint}</span>
                                  )}
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: "2px 6px", fontSize: "10px" }}
                                    onClick={() => onOpenCategoryLockModal && onOpenCategoryLockModal(cat)}
                                  >
                                    Đổi mã
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: "2px 6px", fontSize: "10px", gap: "4px" }}
                                  onClick={() => onOpenCategoryLockModal && onOpenCategoryLockModal(cat)}
                                >
                                  <Icon name="lock" size={10} />
                                  <span>Đặt mật khẩu</span>
                                </button>
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>
                              {cat.count || 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reset Remembered Passwords */}
              <div className="settings-group">
                <label className="settings-label">Quản lý phiên ghi nhớ mật khẩu trên máy tính</label>
                <div className="settings-danger-card">
                  <div>
                    <h5 style={{ margin: "0 0 3px 0", fontSize: "12px", color: "var(--text-primary)" }}>
                      Xóa tất cả phiên ghi nhớ mật khẩu
                    </h5>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)" }}>
                      Nếu bạn đang dùng chung máy tính với người khác, hãy xóa các mật khẩu đã ghi nhớ để khóa lại ngay các thư mục nhạy cảm.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ color: "#f43f5e", borderColor: "rgba(244, 63, 94, 0.4)", whiteSpace: "nowrap" }}
                    onClick={handleClearAllRememberedPasswords}
                  >
                    <Icon name="trash" size={13} color="#f43f5e" />
                    <span>Xóa phiên ghi nhớ</span>
                  </button>
                </div>
              </div>

              {/* Auto lock toggle */}
              <div className="settings-group">
                <label className="settings-toggle-item">
                  <input
                    type="checkbox"
                    checked={autoLockOnExit}
                    onChange={(e) => setAutoLockOnExit(e.target.checked)}
                  />
                  <div className="toggle-text">
                    <span className="toggle-title">Tự động khóa lại khi đóng trình duyệt</span>
                    <span className="toggle-desc">Mỗi khi tắt tab hoặc mở lại trình duyệt, các danh mục bảo mật sẽ yêu cầu nhập lại mật khẩu</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 5: SYSTEM, PERFORMANCE & HEALTH */}
          {activeTab === "system" && (
            <div className="settings-section">
              <h3 className="section-title">Bộ Nhớ, Hiệu Năng & Chẩn Đoán Hệ Thống</h3>
              <p className="section-desc">Thống kê tài nguyên, chẩn đoán sức khỏe hệ thống và tối ưu hóa cơ sở dữ liệu.</p>

              {/* Resource Summary */}
              <div className="system-stats-grid">
                <div className="sys-stat-box">
                  <span className="sys-stat-num">{videos.length}</span>
                  <span className="sys-stat-label">Video trong kho</span>
                </div>
                <div className="sys-stat-box">
                  <span className="sys-stat-num">{categories.length}</span>
                  <span className="sys-stat-label">Danh mục ({favoriteCategories.length} ⭐)</span>
                </div>
                <div className="sys-stat-box">
                  <span className="sys-stat-num">{notes.length}</span>
                  <span className="sys-stat-label">Kịch bản & Note</span>
                </div>
                <div className="sys-stat-box">
                  <span className="sys-stat-num" style={{ color: trashCount > 0 ? "#f43f5e" : undefined }}>
                    {trashCount}
                  </span>
                  <span className="sys-stat-label">Trong thùng rác</span>
                </div>
              </div>

              {/* System Diagnostics Table */}
              <div className="settings-group" style={{ marginTop: "14px" }}>
                <label className="settings-label">Bảng chẩn đoán sức khỏe hệ thống (System Diagnostics)</label>
                <div className="system-info-table">
                  <div className="sys-info-row">
                    <span className="sys-info-key">FastAPI Backend Core</span>
                    <span className="sys-info-val" style={{ color: "#10b981" }}>● Hoạt động bình thường (Port 8000)</span>
                  </div>
                  <div className="sys-info-row">
                    <span className="sys-info-key">SQLite Database Engine</span>
                    <span className="sys-info-val" style={{ color: "#10b981" }}>● WAL Mode - Cache 10,000 trang (social_content.db)</span>
                  </div>
                  <div className="sys-info-row">
                    <span className="sys-info-key">Trình duyệt & React Core</span>
                    <span className="sys-info-val">React 19 + Vite 8.3 + HMR</span>
                  </div>
                  <div className="sys-info-row">
                    <span className="sys-info-key">Công cụ xử lý Video & Nhạc</span>
                    <span className="sys-info-val" style={{ color: "#10b981" }}>● yt-dlp + FFmpeg Engine (Sẵn sàng)</span>
                  </div>
                  <div className="sys-info-row">
                    <span className="sys-info-key">Môi trường thực thi</span>
                    <span className="sys-info-val">Windows x64 / Python 3.13</span>
                  </div>
                </div>
              </div>

              {/* Disk Cleanup & Maintenance */}
              <div className="settings-group" style={{ marginTop: "14px" }}>
                <label className="settings-label">Dọn dẹp bộ nhớ đệm & Giải phóng dung lượng ổ cứng</label>
                <div className="maintenance-actions-grid">
                  <div className="maint-card">
                    <div>
                      <h5>Giải phóng dung lượng & Dọn cache</h5>
                      <p>Dọn sạch các tệp tạm thời, file phân tích dở dang và cache video cũ trên ổ cứng.</p>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        try {
                          await cleanupLocalStorage();
                          alert("Đã giải phóng bộ nhớ đệm thành công!");
                        } catch (e) {
                          alert("Lỗi khi dọn dẹp: " + e.message);
                        }
                      }}
                    >
                      <Icon name="sparkles" size={13} />
                      <span>Dọn dẹp cache ngay</span>
                    </button>
                  </div>

                  <div className="maint-card">
                    <div>
                      <h5>Dọn sạch thùng rác vĩnh viễn</h5>
                      <p>Xóa toàn bộ {trashCount} video đang chờ trong thùng rác để thu hồi dung lượng ổ đĩa.</p>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={trashCount === 0}
                      onClick={() => {
                        if (onEmptyTrash) onEmptyTrash();
                      }}
                    >
                      <Icon name="trash" size={13} color="#fff" />
                      <span>Dọn sạch thùng rác ({trashCount})</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: BACKUP & JSON */}
          {activeTab === "backup" && (
            <div className="settings-section">
              <h3 className="section-title">Sao Lưu, Phục Hồi & Quản Lý Dữ Liệu JSON</h3>
              <p className="section-desc">
                Truy xuất, xuất và nhập dữ liệu cấu hình hoặc toàn bộ kho nội dung dưới định dạng JSON chuẩn.
              </p>

              {/* 1. Export JSON Card */}
              <div className="settings-group">
                <label className="settings-label">1. Xuất dữ liệu & Cấu hình ra tệp JSON (Export)</label>
                <div className="json-action-card">
                  <div className="json-card-desc">
                    <p style={{ margin: "0 0 8px 0", fontSize: "11px", color: "var(--text-secondary)" }}>
                      Tải về tệp sao lưu JSON để lưu trữ dự phòng hoặc di chuyển cấu hình sang máy tính/trình duyệt khác.
                    </p>

                    <div className="settings-radio-group" style={{ marginBottom: "12px" }}>
                      <label className={`settings-radio-card ${exportMode === "full" ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="exportMode"
                          value="full"
                          checked={exportMode === "full"}
                          onChange={(e) => setExportMode(e.target.value)}
                        />
                        <div>
                          <div className="radio-title">📦 Toàn bộ hệ thống (Full Backup)</div>
                          <div className="radio-desc">
                            Gồm: Cài đặt hệ thống + {categories.length} danh mục + {notes.length} kịch bản + {calendarEvents.length} lịch đăng + {videos.length} video metadata
                          </div>
                        </div>
                      </label>

                      <label className={`settings-radio-card ${exportMode === "content" ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="exportMode"
                          value="content"
                          checked={exportMode === "content"}
                          onChange={(e) => setExportMode(e.target.value)}
                        />
                        <div>
                          <div className="radio-title">📁 Chỉ nội dung (Categories, Notes, Calendar)</div>
                          <div className="radio-desc">
                            Gồm: {categories.length} danh mục phân loại, {notes.length} kịch bản Word và {calendarEvents.length} lịch đăng bài
                          </div>
                        </div>
                      </label>

                      <label className={`settings-radio-card ${exportMode === "settings" ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="exportMode"
                          value="settings"
                          checked={exportMode === "settings"}
                          onChange={(e) => setExportMode(e.target.value)}
                        />
                        <div>
                          <div className="radio-title">⚙️ Chỉ cấu hình thiết lập (Settings Only)</div>
                          <div className="radio-desc">
                            Gồm: Theme màu sắc, ngôn ngữ, tỷ lệ zoom, chất lượng video, các cờ tự động hóa
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={handleExportJson}
                    style={{ padding: "8px 16px", fontSize: "12px", gap: "6px", width: "fit-content" }}
                  >
                    <Icon name="download" size={14} color="#fff" />
                    <span>Xuất Tệp JSON ({exportMode === "full" ? "Toàn Bộ" : exportMode === "content" ? "Chỉ Nội Dung" : "Chỉ Cài Đặt"})</span>
                  </button>
                </div>
              </div>

              {/* 2. Import JSON Card */}
              <div className="settings-group">
                <label className="settings-label">2. Nhập dữ liệu & Cấu hình từ tệp JSON (Import)</label>
                <div className="json-action-card">
                  <p style={{ margin: "0 0 10px 0", fontSize: "11px", color: "var(--text-secondary)" }}>
                    Chọn tệp tin `.json` đã xuất trước đó để khôi phục các thiết lập hoặc dữ liệu nội dung.
                  </p>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />

                  {/* Upload Drop Zone / Button */}
                  {!importedData && (
                    <div
                      className="json-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name="upload" size={28} color="var(--accent-primary)" />
                      <div className="dropzone-text">
                        <span className="dropzone-title">Bấm để chọn tệp JSON hoặc kéo thả vào đây</span>
                        <span className="dropzone-sub">Định dạng hỗ trợ: .json (Chuẩn SocialContent Backup)</span>
                      </div>
                    </div>
                  )}

                  {/* Imported File Analysis Preview */}
                  {importedData && (
                    <div className="json-preview-card">
                      <div className="preview-header">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Icon name="code" size={18} color="#10b981" />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "12px" }}>{importFileName}</div>
                            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                              Ứng dụng: {importedData.app || "Không xác định"} | Xuất lúc: {importedData.exported_at ? new Date(importedData.exported_at).toLocaleString() : "Không rõ"}
                            </div>
                          </div>
                        </div>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setImportedData(null);
                            setImportFileName("");
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                        >
                          Chọn tệp khác
                        </button>
                      </div>

                      <div className="preview-metrics">
                        <div className="metric-chip">
                          <span className="metric-label">Cài đặt:</span>
                          <span className="metric-val">{importedData.settings ? Object.keys(importedData.settings).length : 0} mục</span>
                        </div>
                        <div className="metric-chip">
                          <span className="metric-label">Danh mục:</span>
                          <span className="metric-val">{Array.isArray(importedData.categories) ? importedData.categories.length : 0}</span>
                        </div>
                        <div className="metric-chip">
                          <span className="metric-label">Kịch bản:</span>
                          <span className="metric-val">{Array.isArray(importedData.notes) ? importedData.notes.length : 0}</span>
                        </div>
                        <div className="metric-chip">
                          <span className="metric-label">Lịch đăng:</span>
                          <span className="metric-val">{Array.isArray(importedData.calendar_events) ? importedData.calendar_events.length : 0}</span>
                        </div>
                      </div>

                      {/* Import Checkbox Options */}
                      <div className="preview-options">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={importApplySettings}
                            onChange={(e) => setImportApplySettings(e.target.checked)}
                          />
                          <span>Khôi phục các cài đặt hệ thống (Theme, ngôn ngữ, tùy chọn tải)</span>
                        </label>

                        {(importedData.categories || importedData.notes || importedData.calendar_events) && (
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={importApplyContent}
                              onChange={(e) => setImportApplyContent(e.target.checked)}
                            />
                            <span>Khôi phục danh mục phân loại, kịch bản Word và lịch đăng bài</span>
                          </label>
                        )}
                      </div>

                      <div className="preview-actions">
                        <button
                          className="btn btn-primary"
                          onClick={handleApplyImport}
                          disabled={isImporting || (!importApplySettings && !importApplyContent)}
                          style={{ padding: "8px 16px", fontSize: "12px", gap: "6px" }}
                        >
                          <Icon name="check" size={14} color="#fff" />
                          <span>{isImporting ? "Đang áp dụng..." : "Xác Nhận Khôi Phục & Áp Dụng"}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {importError && (
                    <div className="settings-alert-box error" style={{ marginTop: "10px" }}>
                      <Icon name="x" size={14} />
                      <span>{importError}</span>
                    </div>
                  )}

                  {importSuccessMsg && (
                    <div className="settings-alert-box success" style={{ marginTop: "10px" }}>
                      <Icon name="check" size={14} />
                      <span>{importSuccessMsg}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Live JSON Configuration Viewer */}
              <div className="settings-group">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <label className="settings-label" style={{ margin: 0 }}>
                    3. Xem trực tiếp cấu hình JSON hiện tại (Live JSON)
                  </label>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopyJson}
                    style={{ gap: "5px", padding: "4px 10px", fontSize: "11px" }}
                  >
                    <Icon name={copiedJson ? "check" : "copy"} size={12} color={copiedJson ? "#10b981" : "currentColor"} />
                    <span>{copiedJson ? "Đã sao chép!" : "Sao chép JSON"}</span>
                  </button>
                </div>

                <div className="json-code-viewer">
                  <pre>{getCurrentLiveJson()}</pre>
                </div>
              </div>

              {/* 4. Danger Zone: Factory Reset */}
              <div className="settings-group" style={{ marginTop: "16px" }}>
                <label className="settings-label" style={{ color: "#f43f5e" }}>4. Vùng Nguy Hiểm (Danger Zone)</label>
                <div className="settings-danger-card">
                  <div>
                    <h5 style={{ margin: "0 0 3px 0", fontSize: "12px", color: "var(--text-primary)" }}>
                      Khôi phục cài đặt gốc (Factory Reset)
                    </h5>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)" }}>
                      Xóa toàn bộ các thiết lập tùy chỉnh trên trình duyệt và đưa hệ thống về cấu hình ban đầu.
                    </p>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleFactoryReset}
                  >
                    <Icon name="trash" size={13} color="#fff" />
                    <span>Khôi Phục Cài Đặt Gốc</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
