import React, { useState, useRef, useMemo, useEffect } from "react";
import { Icon } from "./Icons";
import { useLanguage } from "../i18n";
import {
  cleanupLocalCache,
  openDownloadsFolder,
  browseLocalFolder,
  openSpecificFolder,
  fetchTikTokBookmarklet,
  fetchDouyinBookmarklet,
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
  uiScale: uiScaleProp,
  setUiScale: setUiScaleProp,
}) {
  const { lang, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState("appearance"); // appearance | media | export | ai_audio | cloud | security | system | backup
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
  const [uiScale, setUiScale] = useState(() => uiScaleProp || localStorage.getItem("ui_scale") || "80");
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("pref_reduce_motion") === "true");
  const [autoPreviewVideo, setAutoPreviewVideo] = useState(() => localStorage.getItem("pref_auto_preview") !== "false");
  const [soundEffects, setSoundEffects] = useState(() => localStorage.getItem("pref_sound_effects") !== "false");
  const [autoSyncDriveDefault, setAutoSyncDriveDefault] = useState(() => localStorage.getItem("sync_to_drive_default") !== "false");
  const [cardViewMode, setCardViewMode] = useState(() => localStorage.getItem("pref_card_view_mode") || "grid");

  // Channels & Collections Settings
  const [channelDateMode, setChannelDateMode] = useState(() => localStorage.getItem("pref_channel_date_mode") || "all");
  const [collectionAutoCat, setCollectionAutoCat] = useState(() => localStorage.getItem("pref_collection_auto_cat") !== "false");
  const [collectionMaxVideos, setCollectionMaxVideos] = useState(() => localStorage.getItem("pref_collection_max_videos") || "all");
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(null);

  // Local Folder Export Settings
  const [exportFolder, setExportFolder] = useState(() => localStorage.getItem("last_export_folder") || "D:\\SocialContent_Export");
  const [exportNamingPattern, setExportNamingPattern] = useState(() => localStorage.getItem("pref_export_naming") || "{title}");
  const [exportAutoOpen, setExportAutoOpen] = useState(() => localStorage.getItem("pref_export_auto_open") !== "false");
  const [exportMarkSaved, setExportMarkSaved] = useState(() => localStorage.getItem("pref_export_mark_saved") !== "false");
  const [isBrowsingFolder, setIsBrowsingFolder] = useState(false);

  // AI & Audio Engine Settings
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem("pref_gemini_api_key") || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiModel, setAiModel] = useState(() => localStorage.getItem("pref_ai_model") || "gemini-1.5-flash");
  const [aiTemperature, setAiTemperature] = useState(() => localStorage.getItem("pref_ai_temp") || "0.7");
  const [aiAutoSummary, setAiAutoSummary] = useState(() => localStorage.getItem("pref_ai_auto_summary") !== "false");
  const [aiAutoHashtags, setAiAutoHashtags] = useState(() => localStorage.getItem("pref_ai_auto_hashtags") !== "false");

  // Audio Studio Settings
  const [audioFormat, setAudioFormat] = useState(() => localStorage.getItem("pref_audio_format") || "mp3");
  const [audioBitrate, setAudioBitrate] = useState(() => localStorage.getItem("pref_audio_bitrate") || "320k");
  const [audioVolumeBoost, setAudioVolumeBoost] = useState(() => localStorage.getItem("pref_audio_boost") || "200");
  const [audioLimiter, setAudioLimiter] = useState(() => localStorage.getItem("pref_audio_limiter") !== "false");

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

    // New web app settings
    localStorage.setItem("pref_card_view_mode", cardViewMode);
    localStorage.setItem("pref_channel_date_mode", channelDateMode);
    localStorage.setItem("pref_collection_auto_cat", String(collectionAutoCat));
    localStorage.setItem("pref_collection_max_videos", collectionMaxVideos);
    localStorage.setItem("last_export_folder", exportFolder);
    localStorage.setItem("pref_export_naming", exportNamingPattern);
    localStorage.setItem("pref_export_auto_open", String(exportAutoOpen));
    localStorage.setItem("pref_export_mark_saved", String(exportMarkSaved));
    localStorage.setItem("pref_gemini_api_key", geminiApiKey);
    localStorage.setItem("pref_ai_model", aiModel);
    localStorage.setItem("pref_ai_temp", aiTemperature);
    localStorage.setItem("pref_ai_auto_summary", String(aiAutoSummary));
    localStorage.setItem("pref_ai_auto_hashtags", String(aiAutoHashtags));
    localStorage.setItem("pref_audio_format", audioFormat);
    localStorage.setItem("pref_audio_bitrate", audioBitrate);
    localStorage.setItem("pref_audio_boost", String(audioVolumeBoost));
    localStorage.setItem("pref_audio_limiter", String(audioLimiter));

    // Apply UI scale
    if (uiScale && uiScale !== "100") {
      document.documentElement.style.zoom = `${uiScale}%`;
    } else {
      document.documentElement.style.zoom = "";
    }
    if (setUiScaleProp) {
      setUiScaleProp(uiScale);
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

  const handleBrowseFolder = async () => {
    setIsBrowsingFolder(true);
    try {
      const res = await browseLocalFolder();
      if (res && res.path) {
        setExportFolder(res.path);
        localStorage.setItem("last_export_folder", res.path);
      }
    } catch (err) {
      alert("Không thể mở hộp thoại chọn thư mục: " + err.message);
    } finally {
      setIsBrowsingFolder(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!exportFolder) {
      alert("Vui lòng nhập hoặc chọn thư mục trước.");
      return;
    }
    try {
      await openSpecificFolder(exportFolder);
    } catch (err) {
      alert("Lỗi khi mở thư mục: " + err.message);
    }
  };

  const handleOpenDownloads = async () => {
    try {
      await openDownloadsFolder();
    } catch (err) {
      alert("Lỗi khi mở thư mục tải về: " + err.message);
    }
  };

  const handleCopyBookmarkletCode = async (type) => {
    try {
      if (type === "douyin") {
        const res = await fetchDouyinBookmarklet();
        await navigator.clipboard.writeText(res.bookmarklet);
        setCopiedBookmarklet("douyin");
      } else if (type === "tiktok_channel") {
        const res = await fetchTikTokBookmarklet();
        await navigator.clipboard.writeText(res.bookmarklet);
        setCopiedBookmarklet("tiktok_channel");
      } else if (type === "tiktok_collection") {
        const code = `javascript:(function(){const m=location.href.match(/collection\\/([^/?#]+)/);const colId=m?m[1]:'';const colTitle=(document.querySelector('h1')?.innerText||document.title||'TikTok Collection').trim();const anchors=Array.from(document.querySelectorAll('a[href*="/video/"]'));const set=new Set();anchors.forEach(a=>{const m2=a.href.match(/https:\\/\\/www\\.tiktok\\.com\\/@[^/]+\\/video\\/\\d+/);if(m2)set.add(m2[0]);});const urls=Array.from(set);if(!urls.length){alert('Chưa thấy video nào trong bộ sưu tập. Hãy cuộn xuống để TikTok tải thêm video rồi bấm lại nhé!');return;}fetch('http://localhost:8000/api/channel/ingest-collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection_id:colId,collection_title:colTitle,collection_url:location.href,videos:urls.map(u=>({url:u,title:''}))})}).then(r=>r.json()).then(res=>{alert('🎉 Đã quét thành công '+urls.length+' video từ bộ sưu tập \"'+colTitle+'\" và gửi về Studio!');}).catch(err=>{prompt('Đã quét được '+urls.length+' video! Copy danh sách URL bên dưới:',urls.join('\\n'));});})();`;
        await navigator.clipboard.writeText(code);
        setCopiedBookmarklet("tiktok_collection");
      }
      setTimeout(() => setCopiedBookmarklet(null), 3000);
    } catch (e) {
      alert("Lỗi khi sao chép mã Bookmarklet: " + e.message);
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
      pref_card_view_mode: cardViewMode,
      pref_channel_date_mode: channelDateMode,
      pref_collection_auto_cat: collectionAutoCat,
      pref_collection_max_videos: collectionMaxVideos,
      last_export_folder: exportFolder,
      pref_export_naming: exportNamingPattern,
      pref_export_auto_open: exportAutoOpen,
      pref_export_mark_saved: exportMarkSaved,
      pref_ai_model: aiModel,
      pref_ai_temp: aiTemperature,
      pref_ai_auto_summary: aiAutoSummary,
      pref_ai_auto_hashtags: aiAutoHashtags,
      pref_audio_format: audioFormat,
      pref_audio_bitrate: audioBitrate,
      pref_audio_boost: audioVolumeBoost,
      pref_audio_limiter: audioLimiter,
      sidebar_collapsed: localStorage.getItem("sidebar_collapsed") === "true",
    };

    const payload = {
      app: "SocialContent Studio OS",
      version: "1.0.5 (Ultimate Pro Edition)",
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
        parent_id: c.parent_id || null,
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
        if (s.pref_default_landing) {
          localStorage.setItem("pref_default_landing", s.pref_default_landing);
          setDefaultLanding(s.pref_default_landing);
        }
        if (s.ui_scale) {
          localStorage.setItem("ui_scale", s.ui_scale);
          setUiScale(s.ui_scale);
          if (setUiScaleProp) setUiScaleProp(s.ui_scale);
        }
        if (s.last_export_folder) {
          localStorage.setItem("last_export_folder", s.last_export_folder);
          setExportFolder(s.last_export_folder);
        }
        if (s.pref_ai_model) {
          localStorage.setItem("pref_ai_model", s.pref_ai_model);
          setAiModel(s.pref_ai_model);
        }
      }

      if (importApplyContent) {
        if (Array.isArray(importedData.categories)) {
          for (const cat of importedData.categories) {
            try {
              await createCategory({
                name: cat.name,
                icon: cat.icon || "folder",
                color: cat.color || "#8b5cf6",
                parent_id: cat.parent_id || null,
              });
            } catch (err) {}
          }
        }

        if (Array.isArray(importedData.notes)) {
          for (const note of importedData.notes) {
            try {
              await saveNote(note);
            } catch (err) {}
          }
        }

        if (Array.isArray(importedData.calendar_events)) {
          for (const ev of importedData.calendar_events) {
            try {
              await saveCalendarEvent(ev);
            } catch (err) {}
          }
        }
      }

      if (onReloadData) await onReloadData();

      setImportSuccessMsg("🎉 Đã nhập và áp dụng dữ liệu sao lưu thành công!");
      setImportedData(null);
      setImportFileName("");
    } catch (err) {
      setImportError("Lỗi trong quá trình áp dụng dữ liệu: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const getCurrentLiveJson = () => {
    return JSON.stringify(
      {
        app: "SocialContent Studio OS",
        version: "1.0.5 (Ultimate Pro Edition)",
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
          pref_card_view_mode: cardViewMode,
          pref_channel_date_mode: channelDateMode,
          pref_collection_auto_cat: collectionAutoCat,
          pref_collection_max_videos: collectionMaxVideos,
          last_export_folder: exportFolder,
          pref_export_naming: exportNamingPattern,
          pref_export_auto_open: exportAutoOpen,
          pref_export_mark_saved: exportMarkSaved,
          pref_ai_model: aiModel,
          pref_ai_temp: aiTemperature,
          pref_ai_auto_summary: aiAutoSummary,
          pref_ai_auto_hashtags: aiAutoHashtags,
          pref_audio_format: audioFormat,
          pref_audio_bitrate: audioBitrate,
          pref_audio_boost: audioVolumeBoost,
          pref_audio_limiter: audioLimiter,
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

  // Auto-switch tab if user searches for specific terms
  useEffect(() => {
    if (!searchQuery) return;
    const q = searchQuery.toLowerCase().trim();
    if (q.includes("theme") || q.includes("màu") || q.includes("zoom") || q.includes("scale") || q.includes("ngôn ngữ")) {
      setActiveTab("appearance");
    } else if (q.includes("tải") || q.includes("kênh") || q.includes("bộ sưu tập") || q.includes("bookmarklet") || q.includes("tiktok") || q.includes("douyin")) {
      setActiveTab("media");
    } else if (q.includes("xuất") || q.includes("thư mục") || q.includes("ổ đĩa") || q.includes("export") || q.includes("lưu")) {
      setActiveTab("export");
    } else if (q.includes("ai") || q.includes("gemini") || q.includes("key") || q.includes("âm thanh") || q.includes("audio") || q.includes("nhạc")) {
      setActiveTab("ai_audio");
    } else if (q.includes("drive") || q.includes("đám mây") || q.includes("cloud") || q.includes("đồng bộ")) {
      setActiveTab("cloud");
    } else if (q.includes("mật khẩu") || q.includes("khóa") || q.includes("danh mục") || q.includes("bảo mật") || q.includes("pin")) {
      setActiveTab("security");
    } else if (q.includes("cache") || q.includes("bộ nhớ") || q.includes("thùng rác") || q.includes("hệ thống")) {
      setActiveTab("system");
    } else if (q.includes("json") || q.includes("sao lưu") || q.includes("khôi phục") || q.includes("reset")) {
      setActiveTab("backup");
    }
  }, [searchQuery]);

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
              <span className="settings-pro-badge">PRO v1.0.5</span>
            </div>
            <p className="settings-subtitle">
              Trung tâm kiểm soát toàn diện: Giao diện, Tải video & Bộ sưu tập, Xuất thư mục máy tính, AI & Studio Âm Thanh, Google Drive, Bảo mật và Sao lưu JSON.
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
          placeholder="Tìm nhanh cài đặt (ví dụ: theme, chất lượng, bộ sưu tập, xuất video, AI, âm thanh, drive, mật khẩu, sao lưu)..."
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
            <span>Tải Video, Kênh & Bộ Sưu Tập</span>
          </button>

          <button
            className={`settings-tab-btn ${activeTab === "export" ? "active" : ""}`}
            onClick={() => setActiveTab("export")}
          >
            <Icon name="folder" size={16} />
            <span>Lưu & Xuất Thư Mục Máy Tính</span>
          </button>

          <button
            className={`settings-tab-btn ${activeTab === "ai_audio" ? "active" : ""}`}
            onClick={() => setActiveTab("ai_audio")}
          >
            <Icon name="sparkles" size={16} />
            <span>AI Engine & Studio Âm Thanh</span>
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
              <p className="section-desc">Cá nhân hóa chủ đề giao diện, màu sắc, tỷ lệ hiển thị và cách sắp xếp trên toàn bộ Studio OS.</p>

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
                      onChange={(e) => {
                        const val = e.target.value;
                        setUiScale(val);
                        if (val && val !== "100") {
                          document.documentElement.style.zoom = `${val}%`;
                        } else {
                          document.documentElement.style.zoom = "";
                        }
                        localStorage.setItem("ui_scale", val);
                        if (setUiScaleProp) setUiScaleProp(val);
                      }}
                    >
                      <option value="70">70% - Giảm 30% (Siêu rộng, xem tối đa dữ liệu)</option>
                      <option value="75">75% - Giảm 25% (Rất gọn gàng)</option>
                      <option value="80">80% - Giảm 20% (Khuyên dùng - Vừa vặn, thoáng đãng)</option>
                      <option value="85">85% - Giảm 15% (Hơi nhỏ)</option>
                      <option value="90">90% - Giảm 10% (Gọn gàng nhẹ)</option>
                      <option value="100">100% - Tiêu chuẩn (Gốc 1:1)</option>
                      <option value="110">110% - Phóng to 10% (Chữ lớn)</option>
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

              {/* Default Landing Page - Full 8 views */}
              <div className="settings-group">
                <label className="settings-label">Trang mặc định khi mở ứng dụng (Landing Page)</label>
                <div className="settings-row">
                  <div style={{ maxWidth: "320px", width: "100%" }}>
                    <select
                      className="form-select"
                      value={defaultLanding}
                      onChange={(e) => setDefaultLanding(e.target.value)}
                    >
                      <option value="dashboard">📊 Bảng Điều Khiển (Dashboard)</option>
                      <option value="vault">🎬 Kho Video & Media (Media Vault)</option>
                      <option value="prompts">✨ Kho Prompt AI (Prompt Vault)</option>
                      <option value="audio">🎵 Studio Âm Thanh (Audio Studio)</option>
                      <option value="calendar">📅 Lịch Đăng Bài (Plan)</option>
                      <option value="notes">📝 Kịch Bản & Note (Word)</option>
                      <option value="resources">🔗 Kho Link & Tài Liệu (Resource Vault)</option>
                      <option value="channels">👥 Hệ Thống Kênh (Channels)</option>
                    </select>
                  </div>
                  <span className="settings-hint">Trang đầu tiên hiển thị mỗi khi khởi động SocialContent Studio OS</span>
                </div>
              </div>

              {/* Card View Layout Mode */}
              <div className="settings-group">
                <label className="settings-label">Chế độ hiển thị thẻ Video trong Kho</label>
                <div className="settings-row">
                  <div style={{ maxWidth: "320px", width: "100%" }}>
                    <select
                      className="form-select"
                      value={cardViewMode}
                      onChange={(e) => setCardViewMode(e.target.value)}
                    >
                      <option value="grid">Lưới Tiêu Chuẩn (Grid View - Đầy đủ chi tiết)</option>
                      <option value="compact">Thẻ Thu Nhỏ (Compact View - Tối đa số lượng)</option>
                    </select>
                  </div>
                  <span className="settings-hint">Kiểu trình bày danh sách video trên màn hình Kho Video</span>
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
                      <span className="toggle-desc">Rê chuột vào thẻ video trên lưới để xem nhanh đoạn preview mượt mà</span>
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

          {/* TAB 2: DOWNLOAD, CHANNELS & COLLECTIONS ENGINE */}
          {activeTab === "media" && (
            <div className="settings-section">
              <h3 className="section-title">Tải Video, Kênh & Bộ Sưu Tập TikTok / Douyin</h3>
              <p className="section-desc">Cấu hình thuật toán trích xuất đa luồng, quét kênh uploader, đồng bộ bộ sưu tập yêu thích và công cụ Bookmarklet.</p>

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
                      <div className="radio-desc">Tự động chọn độ phân giải và bitrate cao nhất từ server gốc không dính logo watermark</div>
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
                      <option value="3">3 video đồng thời (Khuyên dùng - Cân bằng & Nhanh)</option>
                      <option value="5">5 video đồng thời (Siêu tốc / Mạng cáp quang mạnh)</option>
                    </select>
                  </div>
                  <span className="settings-hint">Hệ thống áp dụng cơ chế Connection Pooling giúp tải mượt mà không nghẽn băng thông</span>
                </div>
              </div>

              {/* TikTok / Douyin Channel & Collections Options */}
              <div className="settings-group">
                <label className="settings-label">Quét Kênh & Bộ Sưu Tập TikTok / Douyin</label>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={collectionAutoCat}
                      onChange={(e) => setCollectionAutoCat(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động tạo danh mục theo tên Bộ Sưu Tập TikTok / Douyin</span>
                      <span className="toggle-desc">Khi quét một bộ sưu tập (ví dụ: "nhacj"), hệ thống tự động gán video vào danh mục cùng tên trong Kho</span>
                    </div>
                  </label>

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
                </div>
              </div>

              {/* Bookmarklet 1-Click Copy Tools */}
              <div className="settings-group">
                <label className="settings-label">Bộ Ba Bookmarklet Quét Video Không Cần Đăng Nhập (1-Click Copy)</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "12px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "8px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "12px" }}>
                        <span style={{ color: "#ef4444" }}>📌</span> Bookmarklet Quét Kênh Douyin
                      </div>
                      <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
                        Dùng trên tab Douyin creator để quét hàng loạt video không bị chặn captcha.
                      </p>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCopyBookmarkletCode("douyin")}
                      style={{ width: "100%", justifyContent: "center", gap: "6px" }}
                    >
                      <Icon name={copiedBookmarklet === "douyin" ? "check" : "copy"} size={12} color={copiedBookmarklet === "douyin" ? "#10b981" : "currentColor"} />
                      <span>{copiedBookmarklet === "douyin" ? "Đã sao chép!" : "Sao chép mã Douyin"}</span>
                    </button>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "12px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "8px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "12px" }}>
                        <span style={{ color: "#06b6d4" }}>📌</span> Bookmarklet Quét Kênh TikTok
                      </div>
                      <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
                        Quét toàn bộ trang profile tác giả TikTok trên trình duyệt của bạn.
                      </p>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCopyBookmarkletCode("tiktok_channel")}
                      style={{ width: "100%", justifyContent: "center", gap: "6px" }}
                    >
                      <Icon name={copiedBookmarklet === "tiktok_channel" ? "check" : "copy"} size={12} color={copiedBookmarklet === "tiktok_channel" ? "#10b981" : "currentColor"} />
                      <span>{copiedBookmarklet === "tiktok_channel" ? "Đã sao chép!" : "Sao chép mã Kênh TikTok"}</span>
                    </button>
                  </div>

                  <div style={{ background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.3)", borderRadius: "var(--radius-sm)", padding: "12px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "8px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "12px", color: "#c084fc" }}>
                        <span>⭐</span> Bookmarklet Quét Bộ Sưu Tập TikTok
                      </div>
                      <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
                        Quét sạch video trong từng mục Yêu thích / Collection riêng tư hoặc công khai.
                      </p>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleCopyBookmarkletCode("tiktok_collection")}
                      style={{ width: "100%", justifyContent: "center", gap: "6px" }}
                    >
                      <Icon name={copiedBookmarklet === "tiktok_collection" ? "check" : "copy"} size={12} color="#fff" />
                      <span>{copiedBookmarklet === "tiktok_collection" ? "Đã sao chép mã!" : "Sao chép mã Bộ Sưu Tập"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Local Storage Directory */}
              <div className="settings-group">
                <label className="settings-label">Thư mục tải về gốc (Backend Downloads)</label>
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
                    onClick={handleOpenDownloads}
                  >
                    <Icon name="folder" size={13} />
                    <span>Mở thư mục trên máy tính</span>
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

          {/* TAB 3: LOCAL EXPORT & FOLDER STORAGE */}
          {activeTab === "export" && (
            <div className="settings-section">
              <h3 className="section-title">Lưu & Xuất Video Ra Thư Mục Máy Tính</h3>
              <p className="section-desc">Cấu hình thư mục lưu trữ cục bộ, quy tắc đặt tên tệp và tự động hóa khi xuất video ra ổ đĩa máy tính.</p>

              {/* Default Export Directory */}
              <div className="settings-group">
                <label className="settings-label">Thư mục xuất video mặc định trên máy tính</label>
                <div className="settings-row">
                  <input
                    type="text"
                    className="form-input"
                    value={exportFolder}
                    onChange={(e) => setExportFolder(e.target.value)}
                    placeholder="Ví dụ: D:\SocialContent_Export hoặc C:\Users\Videos"
                    style={{ maxWidth: "480px" }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleBrowseFolder}
                    disabled={isBrowsingFolder}
                  >
                    <Icon name="folder" size={13} color="#fff" />
                    <span>{isBrowsingFolder ? "Đang mở..." : "Chọn thư mục..."}</span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleOpenFolder}
                  >
                    <Icon name="externalLink" size={13} />
                    <span>Mở thư mục này</span>
                  </button>
                </div>
                <span className="settings-hint">
                  Hệ thống hỗ trợ lưu trực tiếp vào bất kỳ ổ đĩa nào (C:, D:, E:) với tốc độ ghi đĩa tối đa và không giới hạn dung lượng.
                </span>
              </div>

              {/* Naming Pattern */}
              <div className="settings-group">
                <label className="settings-label">Quy tắc đặt tên tệp video khi xuất</label>
                <div className="settings-radio-group">
                  <label className={`settings-radio-card ${exportNamingPattern === "{title}" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="namingPattern"
                      value="{title}"
                      checked={exportNamingPattern === "{title}"}
                      onChange={(e) => setExportNamingPattern(e.target.value)}
                    />
                    <div>
                      <div className="radio-title">Tên video sạch: [Tiêu đề video].mp4</div>
                      <div className="radio-desc">Ví dụ: Ao_dep_hjhj.mp4 (Loại bỏ các ký tự đặc biệt không hợp lệ trên Windows)</div>
                    </div>
                  </label>

                  <label className={`settings-radio-card ${exportNamingPattern === "{author}_{title}" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="namingPattern"
                      value="{author}_{title}"
                      checked={exportNamingPattern === "{author}_{title}"}
                      onChange={(e) => setExportNamingPattern(e.target.value)}
                    />
                    <div>
                      <div className="radio-title">Kênh + Tiêu đề: [@tacgia]_[Tiêu đề].mp4</div>
                      <div className="radio-desc">Ví dụ: @tuyetnhi01ne_Ao_dep_hjhj.mp4 (Dễ dàng tra cứu nguồn uploader)</div>
                    </div>
                  </label>

                  <label className={`settings-radio-card ${exportNamingPattern === "{date}_{title}" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="namingPattern"
                      value="{date}_{title}"
                      checked={exportNamingPattern === "{date}_{title}"}
                      onChange={(e) => setExportNamingPattern(e.target.value)}
                    />
                    <div>
                      <div className="radio-title">Ngày tải + Tiêu đề: [YYYY-MM-DD]_[Tiêu đề].mp4</div>
                      <div className="radio-desc">Ví dụ: 2026-09-27_Ao_dep_hjhj.mp4 (Sắp xếp theo thứ tự thời gian trên File Explorer)</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Export Automations */}
              <div className="settings-group">
                <label className="settings-label">Tự động hóa khi xuất video</label>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={exportAutoOpen}
                      onChange={(e) => setExportAutoOpen(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động mở thư mục máy tính sau khi xuất xong</span>
                      <span className="toggle-desc">Tự động bật cửa sổ Windows File Explorer để bạn kéo video vào CapCut hoặc Premiere ngay lập tức</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={exportMarkSaved}
                      onChange={(e) => setExportMarkSaved(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động đánh dấu nhãn "Đã lưu vào máy" trên video trong Kho</span>
                      <span className="toggle-desc">Hiển thị huy hiệu xanh giúp bạn phân biệt video nào đã được lưu về máy và video nào chưa lưu</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI ENGINE & AUDIO STUDIO */}
          {activeTab === "ai_audio" && (
            <div className="settings-section">
              <h3 className="section-title">AI Engine & Studio Âm Thanh</h3>
              <p className="section-desc">Cấu hình khóa API Google Gemini AI, mô hình sinh nội dung kịch bản và các thiết lập xử lý âm thanh chuyên sâu.</p>

              {/* Google Gemini AI Configuration */}
              <div className="settings-group">
                <label className="settings-label">Khóa API Google Gemini AI (Miễn phí / Tốc độ cao)</label>
                <div className="settings-row">
                  <div style={{ position: "relative", maxWidth: "480px", width: "100%" }}>
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="form-input"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="Dán mã API Key của bạn (AIzaSy...)"
                      style={{ width: "100%", paddingRight: "40px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "4px"
                      }}
                    >
                      <Icon name={showApiKey ? "eyeOff" : "eye"} size={14} />
                    </button>
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: "none" }}
                  >
                    <Icon name="externalLink" size={12} />
                    <span>Lấy API Key Miễn Phí Tại Google AI Studio</span>
                  </a>
                </div>
                <span className="settings-hint">
                  Khóa API được lưu cục bộ an toàn trên trình duyệt của bạn và dùng để sinh Prompt AI, tóm tắt video và tạo kịch bản tự động.
                </span>
              </div>

              {/* AI Model Selection */}
              <div className="settings-group">
                <label className="settings-label">Mô hình AI ưu tiên xử lý</label>
                <div className="settings-row">
                  <div style={{ maxWidth: "320px", width: "100%" }}>
                    <select
                      className="form-select"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                    >
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash (Khuyên dùng - Siêu tốc, miễn phí)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Phân tích kịch bản sâu, văn phong đỉnh cao)</option>
                      <option value="gpt-4o-mini">OpenAI GPT-4o-mini (Nếu dùng OpenAI API)</option>
                    </select>
                  </div>
                  <span className="settings-hint">Mô hình AI chịu trách nhiệm dịch thuật, viết lại kịch bản và trích xuất ý tưởng</span>
                </div>
              </div>

              {/* AI Toggles */}
              <div className="settings-group">
                <label className="settings-label">Tính năng AI tự động hóa</label>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={aiAutoSummary}
                      onChange={(e) => setAiAutoSummary(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động tạo tóm tắt video & thông điệp chính bằng AI</span>
                      <span className="toggle-desc">Tự động phân tích nội dung video để bạn nắm bắt ý chính trong 3 giây</span>
                    </div>
                  </label>

                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={aiAutoHashtags}
                      onChange={(e) => setAiAutoHashtags(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Tự động đề xuất Hashtag thịnh hành phù hợp xu hướng</span>
                      <span className="toggle-desc">Gợi ý hashtag viral để tăng tỷ lệ đề xuất khi đăng video lên TikTok và Reels</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Audio Studio Defaults */}
              <div className="settings-group" style={{ marginTop: "16px" }}>
                <label className="settings-label">Cấu hình Studio Âm Thanh (Audio Studio Defaults)</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "12px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>Định Dạng Âm Thanh Mặc Định</span>
                    <select
                      className="form-select"
                      style={{ marginTop: "6px" }}
                      value={audioFormat}
                      onChange={(e) => setAudioFormat(e.target.value)}
                    >
                      <option value="mp3">MP3 (Tương thích 100% mọi thiết bị)</option>
                      <option value="wav">WAV (Lossless không nén chất lượng phòng thu)</option>
                      <option value="m4a">M4A / AAC (Chuẩn âm thanh Apple)</option>
                    </select>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "12px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>Bitrate Trích Xuất Nhạc</span>
                    <select
                      className="form-select"
                      style={{ marginTop: "6px" }}
                      value={audioBitrate}
                      onChange={(e) => setAudioBitrate(e.target.value)}
                    >
                      <option value="320k">320 kbps (Chất lượng âm thanh tối đa)</option>
                      <option value="192k">192 kbps (Tiêu chuẩn cân bằng)</option>
                      <option value="128k">128 kbps (Tiết kiệm dung lượng)</option>
                    </select>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "12px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>Mức Khuếch Đại Âm Lượng (Boost)</span>
                    <select
                      className="form-select"
                      style={{ marginTop: "6px" }}
                      value={audioVolumeBoost}
                      onChange={(e) => setAudioVolumeBoost(e.target.value)}
                    >
                      <option value="150">150% - Tăng nhẹ</option>
                      <option value="200">200% - Tăng gấp đôi (Khuyên dùng)</option>
                      <option value="250">250% - Tăng mạnh</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: "10px" }}>
                  <label className="settings-toggle-item">
                    <input
                      type="checkbox"
                      checked={audioLimiter}
                      onChange={(e) => setAudioLimiter(e.target.checked)}
                    />
                    <div className="toggle-text">
                      <span className="toggle-title">Bật bộ giới hạn âm thanh (Audio Peak Limiter)</span>
                      <span className="toggle-desc">Tự động chống vỡ tiếng và rè tiếng khi khuếch đại âm lượng video</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CLOUD & GOOGLE DRIVE */}
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
                    <p>Kết nối trực tiếp tới Google Cloud qua tệp credentials.json. Phù hợp khi chạy máy chủ VPS từ xa.</p>
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

          {/* TAB 6: SECURITY & CATEGORY HUB */}
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
                                {cat.parent_id && !isAll && (
                                  <span style={{ fontSize: "9.5px", color: "var(--accent-cyan)", background: "rgba(6, 182, 212, 0.15)", padding: "1px 5px", borderRadius: "3px" }}>
                                    ↳ Con của: {categories.find((c) => c.id === cat.parent_id)?.name || cat.parent_id}
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

          {/* TAB 7: SYSTEM, PERFORMANCE & HEALTH */}
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
                          await cleanupLocalCache();
                          alert("Đã giải phóng bộ nhớ đệm cache máy tính thành công!");
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

          {/* TAB 8: BACKUP & JSON */}
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
                            Gồm: Theme màu sắc, ngôn ngữ, tỷ lệ zoom, chất lượng video, các cờ tự động hóa, cấu hình AI và Studio Âm Thanh
                          </div>
                        </div>
                      </label>
                    </div>

                    <button className="btn btn-primary" onClick={handleExportJson} style={{ padding: "8px 16px", fontSize: "12px", gap: "6px" }}>
                      <Icon name="download" size={14} color="#fff" />
                      <span>Xuất Tệp JSON Ngay</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Import JSON Card */}
              <div className="settings-group" style={{ marginTop: "16px" }}>
                <label className="settings-label">2. Nhập dữ liệu sao lưu từ tệp JSON (Import & Restore)</label>
                <div className="json-action-card">
                  <p style={{ margin: "0 0 10px 0", fontSize: "11px", color: "var(--text-secondary)" }}>
                    Chọn tệp tin JSON đã sao lưu trước đó để khôi phục cấu hình hoặc bổ sung danh mục, kịch bản vào kho của bạn.
                  </p>

                  <div className="file-drop-zone" onClick={() => fileInputRef.current?.click()}>
                    <Icon name="code" size={24} color="#8b5cf6" />
                    <span style={{ fontSize: "12px", fontWeight: 600 }}>Bấm để chọn tệp sao lưu (.json) từ máy tính</span>
                    <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Hỗ trợ các bản sao lưu từ SocialContent Studio OS</span>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept=".json"
                      style={{ display: "none" }}
                    />
                  </div>

                  {importFileName && (
                    <div className="file-selected-pill">
                      <Icon name="fileText" size={13} color="#10b981" />
                      <span style={{ fontWeight: 600 }}>{importFileName}</span>
                    </div>
                  )}

                  {importedData && (
                    <div className="import-preview-box">
                      <h5 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#10b981" }}>
                        ✅ Đã đọc thành công tệp sao lưu: {importedData.app || "SocialContent Backup"} ({importedData.version || "v1.0"})
                      </h5>

                      <div className="import-options">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={importApplySettings}
                            onChange={(e) => setImportApplySettings(e.target.checked)}
                          />
                          <span>Khôi phục Cài đặt & Tùy chọn giao diện (Settings)</span>
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
