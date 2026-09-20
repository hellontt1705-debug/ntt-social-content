import React, { useState, useEffect, useRef } from "react";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MediaVault from "./components/MediaVault";
import DownloaderModal from "./components/DownloaderModal";
import VideoDetailModal from "./components/VideoDetailModal";
import CalendarView from "./components/CalendarView";
import DocumentStudio from "./components/DocumentStudio";
import AudioStudio from "./components/AudioStudio";
import DashboardView from "./components/DashboardView";
import SettingsView from "./components/SettingsView";
import PromptVault from "./components/PromptVault";
import CategoryLockModal from "./components/CategoryLockModal";
import DriveSettingsModal from "./components/DriveSettingsModal";
import DownloadTrackerWidget from "./components/DownloadTrackerWidget";
import { Icon } from "./components/Icons";

import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleFavoriteCategory,
  fetchVideos,
  deleteVideo,
  restoreVideo,
  permanentDeleteVideo,
  getTrashCount,
  emptyTrash,
  batchMoveVideos,
  batchTrashVideos,
  batchRestoreVideos,
  batchPermanentDeleteVideos,
  cleanupLocalStorage,
  syncVideoToDrive,
  exportVideosZip,
  fetchCalendarEvents,
  saveCalendarEvent,
  deleteCalendarEvent,
  fetchNotes,
  saveNote,
  deleteNote,
  fetchDriveStatus,
  unlockCategory,
  downloadSingleVideo,
  downloadBatchVideos,
  clearCompletedDownloadTasks,
  toggleVideoUsed,
  batchToggleVideosUsed,
  WS_BASE
} from "./api";
import { LanguageProvider, useLanguage } from "./i18n";

function AppContent() {
  const { t } = useLanguage();
  const [theme, setTheme] = useState(() => localStorage.getItem("app_theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  useEffect(() => {
    // Reset zoom hoàn toàn để đảm bảo giao diện hiển thị 100% nguyên trang full-screen chuẩn UX/UI
    document.documentElement.style.zoom = "";
    localStorage.removeItem("ui_zoom");
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const [currentView, setCurrentView] = useState("dashboard"); // "dashboard" | "vault" | "calendar" | "notes" | "trash" | "audio"
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [videos, setVideos] = useState([]);
  const [trashVideos, setTrashVideos] = useState([]);
  const [trashCount, setTrashCount] = useState(0);
  const [unlockedCategoryIds, setUnlockedCategoryIds] = useState(() => {
    try {
      const initial = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("remember_cat_") && localStorage.getItem(key) === "true") {
          const catId = key.replace("remember_cat_", "");
          initial[catId] = true;
        }
      }
      return initial;
    } catch {
      return {};
    }
  });
  const [rememberTrigger, setRememberTrigger] = useState(0);
  const [lockingCategory, setLockingCategory] = useState(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);
  const [securityToast, setSecurityToast] = useState(null);

  // Modals & Active objects
  const [isDownloaderOpen, setIsDownloaderOpen] = useState(false);
  const [downloaderTab, setDownloaderTab] = useState("single");
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [detailVideo, setDetailVideo] = useState(null);
  const [audioStudioInitialVideo, setAudioStudioInitialVideo] = useState(null);

  const handleOpenAudioStudio = (video = null) => {
    setAudioStudioInitialVideo(video);
    setCurrentView("audio");
  };

  const handleOpenDownloader = (tab = "single") => {
    setDownloaderTab(tab);
    setIsDownloaderOpen(true);
  };

  // Content calendar & Notes
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [driveStatus, setDriveStatus] = useState(null);

  // Active download tasks (Realtime WebSocket)
  const [activeTasks, setActiveTasks] = useState([]);
  const [downloadLogs, setDownloadLogs] = useState([]);
  const [isDownloadTrackerOpen, setIsDownloadTrackerOpen] = useState(false);
  const wsRef = useRef(null);

  const addDownloadLog = (message, type = "info") => {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    setDownloadLogs((prev) => [
      ...prev.slice(-199),
      { id: Math.random().toString(36).slice(2), time: timeStr, message, type }
    ]);
  };

  const sortCategories = (cats) => {
    if (!Array.isArray(cats)) return [];
    return [...cats].sort((a, b) => {
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      const favA = a.is_favorite ? 1 : 0;
      const favB = b.is_favorite ? 1 : 0;
      if (favA !== favB) return favB - favA;
      // If both are favorites, sort by favorited_at ASC (FIFO: earliest favorited first)
      if (favA === 1 && favB === 1) {
        const timeA = a.favorited_at || a.created_at || "";
        const timeB = b.favorited_at || b.created_at || "";
        if (timeA && timeB && timeA !== timeB) {
          return timeA.localeCompare(timeB);
        }
      }
      return (a.order_num || 0) - (b.order_num || 0);
    });
  };

  // 1. Fetch initial data
  const loadCategories = async () => {
    try {
      const data = await fetchCategories();
      setCategories(sortCategories(data));
    } catch (e) {
      console.error(e);
    }
  };

  const loadVideos = async () => {
    try {
      const data = await fetchVideos(selectedCategory, searchQuery);
      setVideos(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadCalendar = async () => {
    try {
      const data = await fetchCalendarEvents();
      setCalendarEvents(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadNotes = async () => {
    try {
      const data = await fetchNotes();
      setNotes(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadDriveStatus = async () => {
    try {
      const data = await fetchDriveStatus();
      setDriveStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadTrashCount = async () => {
    try {
      const res = await getTrashCount();
      setTrashCount(res.count || 0);
    } catch (e) {
      console.error(e);
    }
  };

  const loadTrashVideos = async () => {
    try {
      const data = await fetchVideos("all", "", "trashed");
      setTrashVideos(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCategories();
    loadDriveStatus();
    loadCalendar();
    loadNotes();
    loadTrashCount();
  }, []);

  // Tự động kiểm tra trạng thái mở khóa khi chuyển tab hoặc đổi sang danh mục khác:
  // - Nếu danh mục được BẬT "Ghi nhớ mật khẩu" (ON) -> Luôn tự động giữ mở khóa, không cần nhập lại mật khẩu.
  // - Nếu danh mục TẮT ghi nhớ (OFF) -> Giữ mở khóa trong phiên hiện tại, tự động khóa lại khi rời sang danh mục khác hoặc chuyển view.
  useEffect(() => {
    setUnlockedCategoryIds((prev) => {
      const next = {};
      // Giữ lại các danh mục đang được nhớ mật khẩu
      Object.keys(prev).forEach((id) => {
        if (localStorage.getItem(`remember_cat_${id}`) === "true") {
          next[id] = true;
        }
      });
      // Nếu danh mục hiện tại đang được nhớ mật khẩu hoặc đã mở khóa trong phiên
      if (selectedCategory && selectedCategory !== "all") {
        if (localStorage.getItem(`remember_cat_${selectedCategory}`) === "true") {
          next[selectedCategory] = true;
        } else if (prev[selectedCategory]) {
          next[selectedCategory] = true;
        }
      }
      return next;
    });
  }, [selectedCategory, currentView]);

  useEffect(() => {
    if (currentView === "trash") {
      loadTrashVideos();
    } else {
      loadVideos();
    }
  }, [selectedCategory, searchQuery, currentView]);

  // 2. Setup WebSocket for Realtime Download Progress
  useEffect(() => {
    let socket = null;
    let retryTimeout = null;
    let isMounted = true;

    const connectWebSocket = () => {
      if (!isMounted) return;
      socket = new WebSocket(WS_BASE);

      socket.onopen = () => {
        console.log("WebSocket connected to SocialContent OS");
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "init") {
            const rawTasks = msg.tasks || [];
            setActiveTasks(rawTasks);
            // Chỉ tự động mở Tiến Trình Tải Xuống khi load trang nếu có video ĐANG TẢI DỞ (chưa hoàn thành)
            const hasPendingTasks = rawTasks.some(
              (t) => !t.isCompleted && !t.isError && (t.percent || 0) < 100
            );
            setIsDownloadTrackerOpen(hasPendingTasks);
          } else if (msg.type === "task_update") {
            setActiveTasks((prev) => {
              const existing = prev.findIndex((t) => t.task_id === msg.task.task_id);
              if (existing >= 0) {
                const prevTask = prev[existing];
                if (msg.task.status && msg.task.status !== prevTask.status) {
                  addDownloadLog(`⬇️ [${msg.task.title || "Video"}]: ${msg.task.status}`, "progress");
                }
                const next = [...prev];
                next[existing] = { ...prevTask, ...msg.task };
                return next;
              }
              addDownloadLog(`🚀 Bắt đầu tải: "${msg.task.title || msg.task.url}"`, "info");
              return [...prev, msg.task];
            });
            setIsDownloadTrackerOpen(true);
          } else if (msg.type === "task_completed") {
            // Refresh video list & categories
            loadVideos();
            loadCategories();
            loadTrashCount();
            const compTask = {
              ...msg.task,
              percent: 100,
              status: "Hoàn thành! Đã lưu vào Kho Video",
              isCompleted: true
            };
            setActiveTasks((prev) => {
              const existing = prev.findIndex((t) => t.task_id === msg.task.task_id);
              let next;
              if (existing >= 0) {
                next = [...prev];
                next[existing] = compTask;
              } else {
                next = [...prev, compTask];
              }
              const compCount = next.filter((t) => t.isCompleted || t.percent >= 100).length;
              const totalCount = next.length;
              addDownloadLog(`✅ [${compCount}/${totalCount}] Hoàn thành: "${msg.task.title || msg.task.url}" đã lưu vào Kho Video!`, "success");
              if (compCount === totalCount && totalCount > 1) {
                addDownloadLog(`🎉 ĐÃ HOÀN THÀNH TẤT CẢ: ${compCount}/${totalCount} video đã tải về Kho thành công!`, "success");
              }
              return next;
            });
            setIsDownloadTrackerOpen(true);
          } else if (msg.type === "task_error") {
            const errTask = {
              ...(msg.task || {}),
              status: `Lỗi: ${msg.error || "Không thể tải video"}`,
              isError: true,
            };
            setActiveTasks((prev) => {
              const existing = prev.findIndex((t) => t.task_id === msg.task?.task_id);
              let next;
              if (existing >= 0) {
                next = [...prev];
                next[existing] = errTask;
              } else {
                next = [...prev, errTask];
              }
              const compCount = next.filter((t) => t.isCompleted || t.percent >= 100).length;
              const totalCount = next.length;
              addDownloadLog(`❌ [${compCount}/${totalCount}] Thất bại: "${msg.task?.title || msg.task?.url}" - ${msg.error || "Lỗi tải"}`, "error");
              return next;
            });
            setIsDownloadTrackerOpen(true);
          } else if (msg.type === "video_updated" && msg.video) {
            setVideos((prev) =>
              prev.map((v) => (v.id === msg.video.id ? { ...v, ...msg.video } : v))
            );
          } else if (msg.type === "task_removed") {
            setActiveTasks((prev) => prev.filter((t) => t.task_id !== msg.task_id));
          }
        } catch (e) {
          console.error("WS error parsing message:", e);
        }
      };

      socket.onclose = () => {
        if (isMounted) {
          retryTimeout = setTimeout(connectWebSocket, 3000);
        }
      };

      wsRef.current = socket;
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => socket.close();
        }
      }
    };
  }, []);

  // Handlers
  const handleAddCategory = async (catData) => {
    try {
      await createCategory(catData);
      await loadCategories();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  const handleUpdateCategory = async (catId, catData) => {
    try {
      await updateCategory(catId, catData);
      await loadCategories();
    } catch (err) {
      alert("Lỗi khi cập nhật danh mục: " + err.message);
    }
  };

  const handleToggleFavoriteCategory = async (catId) => {
    if (catId === "all") return;
    const currentCat = categories.find((c) => c.id === catId);
    const currentFav = currentCat?.is_favorite ? 1 : 0;
    const nextFav = currentFav ? 0 : 1;
    const nowIso = new Date().toISOString();
    try {
      setCategories((prev) => {
        const next = prev.map((c) =>
          c.id === catId
            ? {
                ...c,
                is_favorite: nextFav,
                favorited_at: nextFav ? (c.favorited_at || nowIso) : null,
              }
            : c
        );
        return sortCategories(next);
      });
      await toggleFavoriteCategory(catId, currentFav);
      await loadCategories();
    } catch (err) {
      console.error("Lỗi khi cập nhật danh mục yêu thích:", err);
      await loadCategories();
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (catId === "all") return;
    const cat = categories.find((c) => c.id === catId);
    const catName = cat ? cat.name : catId;
    if (!window.confirm(`Bạn có chắc muốn xóa danh mục "${catName}"?\nTất cả video trong danh mục này sẽ tự động chuyển về "Tất cả Video".`)) {
      return;
    }
    try {
      localStorage.removeItem(`remember_cat_${catId}`);
      await deleteCategory(catId);
      if (selectedCategory === catId) {
        setSelectedCategory("all");
      }
      await loadCategories();
      await loadVideos();
    } catch (err) {
      alert("Lỗi khi xóa danh mục: " + err.message);
    }
  };

  // Category Lock handlers
  const handleUnlockCategory = async (catId, password, remember = false) => {
    await unlockCategory(catId, password);
    setUnlockedCategoryIds((prev) => ({ ...prev, [catId]: true }));
    if (remember) {
      localStorage.setItem(`remember_cat_${catId}`, "true");
    } else {
      localStorage.removeItem(`remember_cat_${catId}`);
    }
    setRememberTrigger((prev) => prev + 1);
    const data = await fetchVideos(catId, searchQuery);
    setVideos(data);
  };

  const handleLockCategory = (catId) => {
    localStorage.removeItem(`remember_cat_${catId}`);
    setUnlockedCategoryIds((prev) => {
      const next = { ...prev };
      delete next[catId];
      return next;
    });
    setRememberTrigger((prev) => prev + 1);

    const catObj = categories.find((c) => c.id === catId);
    const catName = catObj?.name || "danh mục";

    // Nếu người dùng đang đứng tại danh mục bị khóa, tự động chuyển về "Tất cả Video"
    if (selectedCategory === catId) {
      setSelectedCategory("all");
    }

    setSecurityToast({
      message: `🔒 Đã khóa danh mục "${catName}" và xóa bỏ ghi nhớ mật khẩu!`,
      type: "lock"
    });
    setTimeout(() => {
      setSecurityToast(null);
    }, 4000);
  };

  const handleToggleRemember = (catId) => {
    const key = `remember_cat_${catId}`;
    const catObj = categories.find((c) => c.id === catId);
    const catName = catObj?.name || "danh mục";

    if (localStorage.getItem(key) === "true") {
      localStorage.removeItem(key);
      setSecurityToast({
        message: `Đã tắt ghi nhớ mật khẩu cho "${catName}". Danh mục sẽ tự động khóa lại khi bạn thoát ra hoặc bấm Khóa.`,
        type: "info"
      });
    } else {
      localStorage.setItem(key, "true");
      setSecurityToast({
        message: `Đã bật ghi nhớ mật khẩu cho "${catName}". Lần sau vào sẽ không cần nhập mật khẩu.`,
        type: "success"
      });
    }
    setTimeout(() => {
      setSecurityToast(null);
    }, 4000);
    setRememberTrigger((prev) => prev + 1);
  };

  const handleLockModalSuccess = async () => {
    await loadCategories();
    await loadVideos();
  };

  // Drag & Drop video into Category
  const handleDropOnCategory = async (videoId, targetCategoryId) => {
    try {
      await batchMoveVideos([videoId], targetCategoryId);
      await loadVideos();
      await loadCategories();
      const targetCat = categories.find((c) => c.id === targetCategoryId);
      if (targetCat?.is_locked) {
        alert(`Đã chuyển video vào danh mục bảo mật "${targetCat.name}"!\nVideo đã được khóa và tự động ẩn khỏi trang Tất cả Video.`);
      }
    } catch (err) {
      alert("Lỗi khi chuyển danh mục: " + err.message);
    }
  };

  const handleBatchMove = async (videoIds, targetCategoryId) => {
    try {
      await batchMoveVideos(videoIds, targetCategoryId);
      setSelectedVideoIds([]);
      await loadVideos();
      await loadCategories();
    } catch (err) {
      alert("Lỗi khi chuyển danh mục hàng loạt: " + err.message);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    try {
      await deleteVideo(videoId);
      await loadVideos();
      await loadCategories();
      await loadTrashCount();
      if (currentView === "trash") await loadTrashVideos();
      if (detailVideo?.id === videoId) setDetailVideo(null);
    } catch (err) {
      alert("Lỗi khi chuyển vào thùng rác: " + err.message);
    }
  };

  const handleRestoreVideo = async (videoId) => {
    try {
      await restoreVideo(videoId);
      await loadTrashVideos();
      await loadTrashCount();
      await loadCategories();
      await loadVideos();
      if (detailVideo?.id === videoId) setDetailVideo(null);
    } catch (err) {
      alert("Lỗi khi khôi phục video: " + err.message);
    }
  };

  const handlePermanentDeleteVideo = async (videoId) => {
    try {
      await permanentDeleteVideo(videoId);
      await loadTrashVideos();
      await loadTrashCount();
      await loadCategories();
      if (detailVideo?.id === videoId) setDetailVideo(null);
    } catch (err) {
      alert("Lỗi khi xóa vĩnh viễn video: " + err.message);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash();
      await loadTrashVideos();
      await loadTrashCount();
      await loadCategories();
      if (detailVideo) setDetailVideo(null);
    } catch (err) {
      alert("Lỗi khi dọn sạch thùng rác: " + err.message);
    }
  };

  const handleBatchTrash = async (videoIds) => {
    try {
      const res = await batchTrashVideos(videoIds);
      setSelectedVideoIds([]);
      await loadVideos();
      await loadCategories();
      await loadTrashCount();
      if (currentView === "trash") await loadTrashVideos();
      alert(res.message || "Đã chuyển các video đã chọn vào thùng rác!");
    } catch (err) {
      alert("Lỗi khi chuyển vào thùng rác: " + err.message);
    }
  };

  const handleBatchRestore = async (videoIds) => {
    try {
      const res = await batchRestoreVideos(videoIds);
      setSelectedVideoIds([]);
      await loadTrashVideos();
      await loadTrashCount();
      await loadCategories();
      await loadVideos();
      alert(res.message || "Đã khôi phục các video đã chọn!");
    } catch (err) {
      alert("Lỗi khi khôi phục: " + err.message);
    }
  };

  const handleBatchPermanentDelete = async (videoIds) => {
    try {
      const res = await batchPermanentDeleteVideos(videoIds);
      setSelectedVideoIds([]);
      await loadTrashVideos();
      await loadTrashCount();
      await loadCategories();
      alert(res.message || "Đã xóa vĩnh viễn các video đã chọn!");
    } catch (err) {
      alert("Lỗi khi xóa vĩnh viễn: " + err.message);
    }
  };

  const handleCleanupDisk = async () => {
    try {
      const res = await cleanupLocalStorage();
      await loadVideos();
      alert(res.message || "Đã giải phóng dung lượng ổ đĩa thành công!");
    } catch (err) {
      alert("Lỗi khi dọn dẹp ổ đĩa: " + err.message);
    }
  };

  const handleSyncDrive = async (videoId) => {
    try {
      const res = await syncVideoToDrive(videoId);
      alert(res.message || "Đã đồng bộ lên Google Drive thành công!");
      await loadVideos();
    } catch (err) {
      alert("Lỗi khi đồng bộ Drive: " + err.message);
    }
  };

  const handleExportSelectedZip = async () => {
    if (selectedVideoIds.length === 0) return;
    try {
      await exportVideosZip(selectedVideoIds);
      setSelectedVideoIds([]);
    } catch (err) {
      alert("Lỗi khi tải file zip: " + err.message);
    }
  };

  const handleToggleVideoUsed = async (videoId) => {
    // Optimistic update
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? { ...v, is_used: v.is_used ? 0 : 1, used_at: v.is_used ? null : new Date().toISOString() }
          : v
      )
    );
    try {
      const res = await toggleVideoUsed(videoId);
      if (res && res.video) {
        setVideos((prev) =>
          prev.map((v) => (v.id === videoId ? { ...v, ...res.video } : v))
        );
        if (detailVideo?.id === videoId) {
          setDetailVideo((prev) => (prev ? { ...prev, ...res.video } : null));
        }
      }
    } catch (err) {
      await loadVideos();
      alert("Lỗi khi cập nhật trạng thái đã sử dụng: " + err.message);
    }
  };

  const handleBatchToggleUsed = async (videoIds, isUsed) => {
    if (!videoIds || videoIds.length === 0) return;
    const targetVal = isUsed ? 1 : 0;
    const nowIso = isUsed ? new Date().toISOString() : null;

    // Optimistic update
    setVideos((prev) =>
      prev.map((v) =>
        videoIds.includes(v.id)
          ? { ...v, is_used: targetVal, used_at: nowIso }
          : v
      )
    );
    try {
      await batchToggleVideosUsed(videoIds, isUsed);
      setSelectedVideoIds([]);
    } catch (err) {
      await loadVideos();
      alert("Lỗi khi cập nhật trạng thái hàng loạt: " + err.message);
    }
  };

  // Start downloads
  const handleStartSingleDownload = async (url, categoryId, syncToDrive, isPrivate = false) => {
    try {
      setIsDownloadTrackerOpen(true);
      addDownloadLog(`🚀 Khởi tạo yêu cầu tải 1 video: ${url}`, "info");
      await downloadSingleVideo(url, categoryId, syncToDrive, isPrivate);
    } catch (err) {
      addDownloadLog(`❌ Lỗi gửi yêu cầu tải: ${err.message}`, "error");
      alert(err.message);
    }
  };

  const handleStartBatchDownload = async (urls, categoryId, syncToDrive, isPrivate = false) => {
    try {
      setIsDownloadTrackerOpen(true);
      addDownloadLog(`📦 Bắt đầu tải hàng loạt ${urls.length} video về kho...`, "info");
      urls.forEach((u, i) => addDownloadLog(`  [#${i + 1}] ${u}`, "info"));
      await downloadBatchVideos(urls, categoryId, syncToDrive, isPrivate);
    } catch (err) {
      addDownloadLog(`❌ Lỗi gửi yêu cầu tải hàng loạt: ${err.message}`, "error");
      alert(err.message);
    }
  };

  // Calendar
  const handleSaveCalendarEvent = async (eventData) => {
    try {
      await saveCalendarEvent(eventData);
      await loadCalendar();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  const handleDeleteCalendarEvent = async (eventId) => {
    try {
      await deleteCalendarEvent(eventId);
      await loadCalendar();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  // Notes
  const handleSaveNote = async (noteData) => {
    try {
      await saveNote(noteData);
      await loadNotes();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteNote(noteId);
      await loadNotes();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  return (
    <div className="app-container">
      {/* 1. Sidebar */}
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        categories={categories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onToggleFavoriteCategory={handleToggleFavoriteCategory}
        onDropOnCategory={handleDropOnCategory}
        onOpenCategoryLockModal={(cat) => setLockingCategory(cat)}
        unlockedCategoryIds={unlockedCategoryIds}
        onLockCategory={handleLockCategory}
        driveStatus={driveStatus}
        onOpenDriveModal={() => setIsDriveModalOpen(true)}
        onOpenDownloader={() => handleOpenDownloader("single")}
        trashCount={trashCount}
      />

      {/* 2. Main Wrapper */}
      <div className="main-wrapper">
        <Navbar
          currentView={currentView}
          setCurrentView={setCurrentView}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedVideosCount={selectedVideoIds.length}
          onExportSelectedZip={handleExportSelectedZip}
          onOpenDownloader={() => handleOpenDownloader("single")}
          onOpenDriveModal={() => setIsDriveModalOpen(true)}
          theme={theme}
          toggleTheme={toggleTheme}
          trashCount={trashCount}
        />

        {/* View Switching */}
        {currentView === "dashboard" && (
          <DashboardView
            videos={videos}
            categories={categories}
            calendarEvents={calendarEvents}
            notes={notes}
            driveStatus={driveStatus}
            trashCount={trashCount}
            onSelectVideoForDetail={(v) => setDetailVideo(v)}
            onOpenDownloader={handleOpenDownloader}
            setCurrentView={setCurrentView}
            setSelectedCategory={setSelectedCategory}
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
          />
        )}

        {currentView === "prompts" && (
          <PromptVault />
        )}

        {currentView === "vault" && (
          <MediaVault
            videos={videos}
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectVideoForDetail={(v) => setDetailVideo(v)}
            onOpenScheduleModal={(v) => {
              setDetailVideo(null);
              setCurrentView("calendar");
            }}
            onDeleteVideo={handleDeleteVideo}
            onSyncDrive={handleSyncDrive}
            onBatchMove={handleBatchMove}
            selectedVideoIds={selectedVideoIds}
            setSelectedVideoIds={setSelectedVideoIds}
            onOpenDownloader={handleOpenDownloader}
            onStartSingleDownload={handleStartSingleDownload}
            onStartBatchDownload={handleStartBatchDownload}
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
            driveStatus={driveStatus}
            onBatchTrash={handleBatchTrash}
            onCleanupDisk={handleCleanupDisk}
            unlockedCategoryIds={unlockedCategoryIds}
            onUnlockCategory={handleUnlockCategory}
            onLockCategory={handleLockCategory}
            onToggleRemember={handleToggleRemember}
            onSelectCategory={setSelectedCategory}
            onOpenAudioStudio={handleOpenAudioStudio}
            onToggleVideoUsed={handleToggleVideoUsed}
            onBatchToggleUsed={handleBatchToggleUsed}
          />
        )}

        {currentView === "trash" && (
          <MediaVault
            videos={trashVideos}
            categories={categories}
            selectedCategory="all"
            onSelectVideoForDetail={(v) => setDetailVideo(v)}
            onOpenScheduleModal={(v) => {
              setDetailVideo(null);
              setCurrentView("calendar");
            }}
            onDeleteVideo={handleDeleteVideo}
            onSyncDrive={handleSyncDrive}
            onBatchMove={handleBatchMove}
            selectedVideoIds={selectedVideoIds}
            setSelectedVideoIds={setSelectedVideoIds}
            onOpenDownloader={handleOpenDownloader}
            onStartSingleDownload={handleStartSingleDownload}
            onStartBatchDownload={handleStartBatchDownload}
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
            driveStatus={driveStatus}
            isTrashView={true}
            onRestoreVideo={handleRestoreVideo}
            onPermanentDeleteVideo={handlePermanentDeleteVideo}
            onEmptyTrash={handleEmptyTrash}
            onBatchRestore={handleBatchRestore}
            onBatchPermanentDelete={handleBatchPermanentDelete}
            onCleanupDisk={handleCleanupDisk}
          />
        )}

        {currentView === "calendar" && (
          <CalendarView
            calendarEvents={calendarEvents}
            videos={videos}
            onSaveCalendarEvent={handleSaveCalendarEvent}
            onDeleteCalendarEvent={handleDeleteCalendarEvent}
            onSelectVideoForDetail={(v) => setDetailVideo(v)}
          />
        )}

        {currentView === "notes" && (
          <DocumentStudio
            notes={notes}
            videos={videos}
            onSaveNote={handleSaveNote}
            onDeleteNote={handleDeleteNote}
            onSelectVideoForDetail={(v) => setDetailVideo(v)}
          />
        )}

        {currentView === "audio" && (
          <AudioStudio
            videos={videos}
            categories={categories}
            initialVideo={audioStudioInitialVideo}
            onSaveSuccess={loadVideos}
            onBackToVault={() => setCurrentView("vault")}
          />
        )}

        {currentView === "settings" && (
          <SettingsView
            theme={theme}
            setTheme={setTheme}
            toggleTheme={toggleTheme}
            driveStatus={driveStatus}
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
            loadDriveStatus={loadDriveStatus}
            categories={categories}
            videos={videos}
            notes={notes}
            calendarEvents={calendarEvents}
            trashCount={trashCount}
            onCleanupDisk={handleCleanupDisk}
            setCurrentView={setCurrentView}
            onEmptyTrash={handleEmptyTrash}
            onToggleFavoriteCategory={handleToggleFavoriteCategory}
            onOpenCategoryLockModal={(cat) => setLockingCategory(cat)}
            onReloadData={async () => {
              await Promise.all([loadCategories(), loadVideos(), loadCalendar(), loadNotes()]);
            }}
          />
        )}
      </div>

      {/* Realtime Floating Download Manager & Log Drawer at Bottom-Right */}
      <DownloadTrackerWidget
        tasks={activeTasks}
        logs={downloadLogs}
        isOpen={isDownloadTrackerOpen && activeTasks.length > 0}
        onClose={async () => {
          setIsDownloadTrackerOpen(false);
          try {
            await clearCompletedDownloadTasks();
          } catch (e) {}
          setActiveTasks((prev) => prev.filter((t) => !t.isCompleted && !t.isError && (t.percent || 0) < 100));
        }}
        onOpenModal={(t) => handleOpenDownloader(t || "tasks")}
        onClearCompleted={async () => {
          try {
            await clearCompletedDownloadTasks();
          } catch (e) {}
          setActiveTasks((prev) => prev.filter((t) => !t.isCompleted && !t.isError && (t.percent || 0) < 100));
        }}
        onClearLogs={() => setDownloadLogs([])}
      />

      {/* Modals */}
      <DownloaderModal
        isOpen={isDownloaderOpen}
        onClose={() => setIsDownloaderOpen(false)}
        initialTab={downloaderTab}
        categories={categories}
        onStartSingleDownload={handleStartSingleDownload}
        onStartBatchDownload={handleStartBatchDownload}
        activeTasks={activeTasks}
        driveStatus={driveStatus}
      />

      <VideoDetailModal
        video={detailVideo}
        onClose={() => setDetailVideo(null)}
        categories={categories}
        onOpenScheduleModal={(v) => {
          setDetailVideo(null);
          setCurrentView("calendar");
        }}
        onDeleteVideo={handleDeleteVideo}
        onSyncDrive={handleSyncDrive}
        onVideoUpdated={(updated) => {
          setDetailVideo(updated);
          loadVideos();
        }}
        onOpenAudioStudio={handleOpenAudioStudio}
      />

      <DriveSettingsModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        driveStatus={driveStatus}
        onDriveStatusUpdated={(newStatus) => setDriveStatus(newStatus)}
      />

      {/* 5. Category Lock Management Modal */}
      {lockingCategory && (
        <CategoryLockModal
          isOpen={Boolean(lockingCategory)}
          category={lockingCategory}
          onClose={() => setLockingCategory(null)}
          onLockSuccess={handleLockModalSuccess}
        />
      )}

      {/* Floating Security Toast */}
      {securityToast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: securityToast.type === "lock" ? "rgba(225, 29, 72, 0.95)" : "rgba(139, 92, 246, 0.95)",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: "10px",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            animation: "fadeIn 0.2s ease-out"
          }}
        >
          <Icon name={securityToast.type === "lock" ? "lock" : "shield"} size={16} color="#fff" />
          <span>{securityToast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

