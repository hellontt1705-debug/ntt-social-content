import React, { useState, useEffect, useRef, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MediaVault from "./components/MediaVault";
import DownloaderModal from "./components/DownloaderModal";
import VideoDetailModal from "./components/VideoDetailModal";
import CalendarView from "./components/CalendarView";
import DocumentStudio from "./components/DocumentStudio";
import ResourceVault from "./components/ResourceVault";
import AudioStudio from "./components/AudioStudio";
import DashboardView from "./components/DashboardView";
import SettingsView from "./components/SettingsView";
import PromptVault from "./components/PromptVault";
import ChannelManager from "./components/ChannelManager";
import CategoryLockModal from "./components/CategoryLockModal";
import DriveSettingsModal from "./components/DriveSettingsModal";
import DownloadTrackerWidget from "./components/DownloadTrackerWidget";
import ExportTrackerWidget from "./components/ExportTrackerWidget";
import ExportFolderModal from "./components/ExportFolderModal";
import ScheduleModal from "./components/ScheduleModal";
import ConfirmModal from "./components/ConfirmModal";
import ExtensionModal from "./components/ExtensionModal";
import PipFloatingWidget from "./components/PipFloatingWidget";
import DubbingProjectsView from "./components/dubbing/DubbingProjectsView";
import DubbingStudioView from "./components/dubbing/DubbingStudioView";
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
  syncAllPendingToDrive,
  syncVideoToDrive,
  exportVideosZip,
  exportVideosToFolder,
  cancelExport,
  dismissExport,
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
  toggleVideoLearned,
  batchToggleVideosLearned,
  resetVideoSaved,
  batchResetVideosSaved,
  WS_BASE
} from "./api";
import { LanguageProvider, useLanguage } from "./i18n";

function AppContent() {
  const [theme, setTheme] = useState(() => localStorage.getItem("app_theme") || "dark");
  const [uiScale, setUiScale] = useState(() => localStorage.getItem("ui_scale") || "80");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (uiScale && uiScale !== "100") {
      document.documentElement.style.zoom = `${uiScale}%`;
    } else {
      document.documentElement.style.zoom = "";
    }
    localStorage.setItem("ui_scale", uiScale);
  }, [uiScale]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const [currentView, setCurrentView] = useState(() => localStorage.getItem("pref_default_landing") || "dashboard");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [allVideos, setAllVideos] = useState([]);
  const setVideos = setAllVideos;

  // Lọc video tức thì trong RAM (0ms) cho từng view & danh mục mà không phải gọi lại API mạng
  const videos = useMemo(() => {
    if (!Array.isArray(allVideos) || allVideos.length === 0) return [];
    
    // Nếu ở dashboard, calendar, notes, audio -> dùng toàn bộ video trong kho
    if (currentView === "dashboard" || currentView === "calendar" || currentView === "notes" || currentView === "audio") {
      return allVideos;
    }

    let list = allVideos;

    // Lọc theo danh mục
    if (selectedCategory && selectedCategory !== "*") {
      if (selectedCategory === "all") {
        // "Tất cả Video" (chưa phân loại):
        const realCatIds = new Set((categories || []).filter((c) => c.id !== "all").map((c) => c.id));
        list = list.filter((v) => !v.category_id || v.category_id === "all" || v.category_id === "default" || !realCatIds.has(v.category_id));
      } else {
        // Danh mục cụ thể + tất cả danh mục con của nó
        const childIds = (categories || []).filter((c) => c.parent_id === selectedCategory).map((c) => c.id);
        const validIds = new Set([selectedCategory, ...childIds]);
        list = list.filter((v) => validIds.has(v.category_id));
      }
    }

    // Lọc theo ô tìm kiếm nếu có
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((v) =>
        (v.title && v.title.toLowerCase().includes(q)) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        (v.uploader && v.uploader.toLowerCase().includes(q)) ||
        (Array.isArray(v.hashtags) && v.hashtags.some((h) => String(h).toLowerCase().includes(q)))
      );
    }

    return list;
  }, [allVideos, selectedCategory, searchQuery, categories, currentView]);
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

  // Custom confirmation & alert modal state
  const [confirmModalState, setConfirmModalState] = useState({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
    confirmText: "",
    cancelText: "",
    showCancel: false,
    onConfirm: null
  });

  // Modals & Active objects
  const [isDownloaderOpen, setIsDownloaderOpen] = useState(false);
  const [downloaderTab, setDownloaderTab] = useState("single");
  const [downloaderInitialChannelUrl, setDownloaderInitialChannelUrl] = useState("");
  const [downloaderInitialPlatform, setDownloaderInitialPlatform] = useState("douyin");
  const [latestIngestedChannel, setLatestIngestedChannel] = useState(null);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [isPipOpen, setIsPipOpen] = useState(false);
  const [detailVideo, setDetailVideo] = useState(null);
  const [detailVideoList, setDetailVideoList] = useState([]);
  const [schedulingVideo, setSchedulingVideo] = useState(null);
  const [audioStudioInitialVideo, setAudioStudioInitialVideo] = useState(null);
  const [activeDubbingProjectId, setActiveDubbingProjectId] = useState(null);

  const handleOpenVideoDetail = (video, list = null) => {
    setDetailVideo(video);
    if (list && Array.isArray(list) && list.length > 0) {
      setDetailVideoList(list);
    } else if (currentView === "trash") {
      setDetailVideoList(trashVideos);
    } else {
      setDetailVideoList(videos);
    }
  };

  const handleOpenAudioStudio = (video = null) => {
    setAudioStudioInitialVideo(video);
    setCurrentView("audio");
  };

  const handleOpenDownloader = (tab = "single") => {
    setDownloaderTab(tab);
    setIsDownloaderOpen(true);
  };

  const handleOpenChannelScannerFromManager = (channelUrl, platform = "douyin") => {
    setDownloaderInitialChannelUrl(channelUrl || "");
    setDownloaderInitialPlatform(platform || "douyin");
    setDownloaderTab("channel");
    setIsDownloaderOpen(true);
  };

  // Content calendar & Notes
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [driveStatus, setDriveStatus] = useState(null);

  // Active download tasks (Realtime WebSocket)
  const [activeTasks, setActiveTasks] = useState([]);
  const [isDownloadTrackerOpen, setIsDownloadTrackerOpen] = useState(false);
  const [downloadLogs, setDownloadLogs] = useState([]);
  const wsRef = useRef(null);
  const refreshTimeoutRef = useRef(null);
  const lastInitialLoadRef = useRef(0);

  // Export to Local Folder Realtime State
  const [exportState, setExportState] = useState(null);
  const [isExportTrackerOpen, setIsExportTrackerOpen] = useState(false);
  const [isExportFolderModalOpen, setIsExportFolderModalOpen] = useState(false);
  const [exportFolderVideoIds, setExportFolderVideoIds] = useState([]);

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
      const data = await fetchVideos("*");
      setAllVideos(data);
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

  const loadAllInitialData = async () => {
    lastInitialLoadRef.current = Date.now();
    await Promise.allSettled([
      loadCategories(),
      loadVideos(),
      loadDriveStatus(),
      loadCalendar(),
      loadNotes(),
      loadTrashCount(),
    ]);
  };

  useEffect(() => {
    loadAllInitialData();
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
    } else if (allVideos.length === 0) {
      loadVideos();
    }
  }, [currentView === "trash"]);

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
        // Tự động nạp lại dữ liệu nếu cách lần nạp gần nhất hơn 8 giây (tránh gọi trùng lặp 2 lần liên tiếp khi vừa mở web)
        if (Date.now() - lastInitialLoadRef.current > 8000) {
          loadAllInitialData();
        }
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

            // Khôi phục trạng thái tiến trình xuất video ra máy tính nếu có
            if (msg.export_tasks && msg.export_tasks.length > 0) {
              const latestExport = msg.export_tasks[msg.export_tasks.length - 1];
              setExportState(latestExport);
              if (!latestExport.dismissed) {
                setIsExportTrackerOpen(true);
              }
            }
          } else if (msg.type === "export_start" || msg.type === "export_progress") {
            setExportState(msg.export);
            setIsExportTrackerOpen(true);
          } else if (msg.type === "export_completed") {
            setExportState(msg.export);
            setIsExportTrackerOpen(true);
            loadVideos();
          } else if (msg.type === "export_error") {
            setExportState((prev) => ({
              ...(prev || {}),
              ...(msg.export || {}),
              is_error: true,
              status: `Lỗi: ${msg.error || "Không thể lưu video"}`
            }));
          } else if (msg.type === "channel_ingested") {
            console.log("Channel ingested via WebSocket:", msg.data);
            setLatestIngestedChannel(msg.data);
            setDownloaderTab("channel");
            setIsDownloaderOpen(true);
            const count = msg.data.total_scanned || (msg.data.videos && msg.data.videos.length) || 0;
            addDownloadLog(`🎉 Đã tự động nhận ${count} video từ tab ${msg.platform === "douyin" ? "Douyin" : "TikTok"}!`, "success");
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
            // Cập nhật ngay video vào state tức thì (Optimistic UI) để truy xuất mượt mà, không chờ API
            if (msg.video) {
              setVideos((prev) => {
                if (prev.some((v) => v.id === msg.video.id)) {
                  return prev.map((v) => (v.id === msg.video.id ? { ...v, ...msg.video } : v));
                }
                return [msg.video, ...prev];
              });
            }

            // Debounce nạp lại DB (categories, trash count, full query) sau 500ms tránh nghẽn luồng khi tải hàng loạt
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
            }
            refreshTimeoutRef.current = setTimeout(() => {
              loadVideos();
              loadCategories();
              loadTrashCount();
            }, 500);

            const compTask = {
              ...msg.task,
              percent: 100,
              status: "Hoàn thành! Đã lưu vào Kho Video",
              speed: "",
              eta: "",
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
            setDetailVideo((cur) => (cur && cur.id === msg.video.id ? { ...cur, ...msg.video } : cur));
            setDetailVideoList((prevList) =>
              prevList.map((v) => (v.id === msg.video.id ? { ...v, ...msg.video } : v))
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
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
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
      const syncRes = await syncAllPendingToDrive().catch((err) => {
        console.warn("Sync pending error:", err);
        return null;
      });
      const res = await cleanupLocalStorage();
      await loadVideos();
      let msg = res.message || "Đã giải phóng dung lượng ổ đĩa thành công!";
      if (syncRes && syncRes.synced_count > 0) {
        msg = `Đã đồng bộ ${syncRes.synced_count} video lên Google Drive và giải phóng ${res.freed_mb || syncRes.freed_mb} MB ổ cứng!`;
      }
      alert(msg);
    } catch (err) {
      alert("Lỗi khi dọn dẹp ổ đĩa: " + err.message);
    }
  };

  const handleSyncDrive = async (videoId) => {
    try {
      const res = await syncVideoToDrive(videoId);
      loadVideos();
      return res;
    } catch (err) {
      alert("Lỗi khi đồng bộ lên Google Drive: " + err.message);
    }
  };

  const handleOpenExportModal = (videoIds) => {
    setExportFolderVideoIds(videoIds);
    // Nếu tiến trình export trước đó đã hoàn thành, bị lỗi hoặc bị hủy, reset exportState để modal sẵn sàng cho lần lưu mới
    if (exportState && (exportState.is_completed || exportState.is_error || exportState.is_cancelled)) {
      setExportState(null);
    }
    setIsExportFolderModalOpen(true);
  };

  const handleResetExportState = () => {
    setExportState(null);
  };

  const handleStartExport = async (videoIds, targetFolder) => {
    const res = await exportVideosToFolder(videoIds, targetFolder);
    if (res && res.export_id) {
      setIsExportTrackerOpen(true);
    }
    return res;
  };

  const handleCancelExport = async () => {
    if (exportState?.id) {
      try {
        await cancelExport(exportState.id);
      } catch (e) {}
    }
  };

  const handleDismissExport = async () => {
    setIsExportTrackerOpen(false);
    if (exportState?.id) {
      try {
        await dismissExport(exportState.id);
      } catch (e) {}
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

  const handleMarkVideoUsed = async (videoId, isUsed = true) => {
    const v = videos.find((item) => item.id === videoId);
    if (v && Boolean(v.is_used) === isUsed) return;
    setVideos((prev) =>
      prev.map((item) =>
        item.id === videoId
          ? { ...item, is_used: isUsed ? 1 : 0, used_at: isUsed ? new Date().toISOString() : null }
          : item
      )
    );
    try {
      await batchToggleVideosUsed([videoId], isUsed);
    } catch (err) {
      console.error("Error updating video is_used:", err);
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

  const handleToggleVideoLearned = async (videoId) => {
    // Optimistic update
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? { ...v, is_learned: v.is_learned ? 0 : 1, learned_at: v.is_learned ? null : new Date().toISOString() }
          : v
      )
    );
    try {
      const res = await toggleVideoLearned(videoId);
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
      alert("Lỗi khi cập nhật trạng thái học làm: " + err.message);
    }
  };

  const handleBatchToggleLearned = async (videoIds, isLearned) => {
    if (!videoIds || videoIds.length === 0) return;
    const targetVal = isLearned ? 1 : 0;
    const nowIso = isLearned ? new Date().toISOString() : null;

    // Optimistic update
    setVideos((prev) =>
      prev.map((v) =>
        videoIds.includes(v.id)
          ? { ...v, is_learned: targetVal, learned_at: nowIso }
          : v
      )
    );
    try {
      await batchToggleVideosLearned(videoIds, isLearned);
      setSelectedVideoIds([]);
    } catch (err) {
      await loadVideos();
      alert("Lỗi khi cập nhật trạng thái học làm hàng loạt: " + err.message);
    }
  };

  const handleResetVideoSaved = async (videoId) => {
    // Optimistic update
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? {
              ...v,
              is_saved_to_computer: 0,
              local_export_count: 0,
              last_exported_at: null,
              last_export_folder: null,
            }
          : v
      )
    );
    if (detailVideo && detailVideo.id === videoId) {
      setDetailVideo((prev) =>
        prev
          ? {
              ...prev,
              is_saved_to_computer: 0,
              local_export_count: 0,
              last_exported_at: null,
              last_export_folder: null,
            }
          : null
      );
    }
    try {
      await resetVideoSaved(videoId);
    } catch (err) {
      await loadVideos();
      alert("Lỗi khi bỏ thông tin lưu máy: " + err.message);
    }
  };

  const handleBatchResetSaved = async (videoIds) => {
    if (!videoIds || videoIds.length === 0) return;
    // Optimistic update
    setVideos((prev) =>
      prev.map((v) =>
        videoIds.includes(v.id)
          ? {
              ...v,
              is_saved_to_computer: 0,
              local_export_count: 0,
              last_exported_at: null,
              last_export_folder: null,
            }
          : v
      )
    );
    try {
      await batchResetVideosSaved(videoIds);
      setSelectedVideoIds([]);
    } catch (err) {
      await loadVideos();
      alert("Lỗi khi bỏ thông tin lưu máy hàng loạt: " + err.message);
    }
  };

  // Start downloads
  const handleStartSingleDownload = async (url, categoryId, syncToDrive, isPrivate = false) => {
    try {
      setIsDownloadTrackerOpen(true);
      addDownloadLog(`🚀 Khởi tạo yêu cầu tải 1 video: ${url}`, "info");
      const res = await downloadSingleVideo(url, categoryId, syncToDrive, isPrivate);
      return res;
    } catch (err) {
      addDownloadLog(`❌ Lỗi gửi yêu cầu tải: ${err.message}`, "error");
      alert(err.message);
      throw err;
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

  const handleDeleteCalendarEvent = async (eventIdOrIds) => {
    try {
      if (Array.isArray(eventIdOrIds)) {
        for (const id of eventIdOrIds) {
          await deleteCalendarEvent(id);
        }
      } else {
        await deleteCalendarEvent(eventIdOrIds);
      }
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
          onOpenExtensionModal={() => setIsExtensionModalOpen(true)}
          onOpenPip={() => setIsPipOpen(true)}
          theme={theme}
          toggleTheme={toggleTheme}
          trashCount={trashCount}
          uiScale={uiScale}
          setUiScale={setUiScale}
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
            onSelectVideoForDetail={(v, list) => handleOpenVideoDetail(v, list)}
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
            calendarEvents={calendarEvents}
            selectedCategory={selectedCategory}
            onSelectVideoForDetail={(v, list) => handleOpenVideoDetail(v, list)}
            onOpenScheduleModal={(v) => {
              setSchedulingVideo(v);
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
            onToggleVideoLearned={handleToggleVideoLearned}
            onBatchToggleLearned={handleBatchToggleLearned}
            onOpenExportModal={handleOpenExportModal}
            onResetVideoSaved={handleResetVideoSaved}
            onBatchResetSaved={handleBatchResetSaved}
            onAddCategory={handleAddCategory}
          />
        )}

        {currentView === "trash" && (
          <MediaVault
            videos={trashVideos}
            categories={categories}
            selectedCategory="all"
            onSelectVideoForDetail={(v, list) => handleOpenVideoDetail(v, list)}
            onOpenScheduleModal={(v) => {
              setSchedulingVideo(v);
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
            categories={categories}
            onSaveCalendarEvent={handleSaveCalendarEvent}
            onDeleteCalendarEvent={handleDeleteCalendarEvent}
            onSelectVideoForDetail={(v, list) => handleOpenVideoDetail(v, list)}
            onMarkVideoUsed={handleMarkVideoUsed}
            onOpenExportModal={handleOpenExportModal}
          />
        )}

        {currentView === "notes" && (
          <DocumentStudio
            notes={notes}
            videos={videos}
            onSaveNote={handleSaveNote}
            onDeleteNote={handleDeleteNote}
            onSelectVideoForDetail={(v, list) => handleOpenVideoDetail(v, list)}
            onSwitchToResources={() => setCurrentView("resources")}
          />
        )}

        {currentView === "resources" && (
          <ResourceVault />
        )}

        {currentView === "channels" && (
          <ChannelManager 
            onOpenChannelScanner={handleOpenChannelScannerFromManager} 
            uiScale={uiScale}
            setUiScale={setUiScale}
          />
        )}

        {currentView === "dubbing" && (
          activeDubbingProjectId ? (
            <DubbingStudioView 
              projectId={activeDubbingProjectId}
              onBackToProjects={() => setActiveDubbingProjectId(null)}
            />
          ) : (
            <DubbingProjectsView 
              onOpenStudio={(projId) => setActiveDubbingProjectId(projId)}
            />
          )
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
            uiScale={uiScale}
            setUiScale={setUiScale}
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
        isModalOpen={isDownloaderOpen}
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

      {/* Realtime Floating Export Manager at Bottom-Right */}
      <ExportTrackerWidget
        exportState={exportState}
        isOpen={isExportTrackerOpen && Boolean(exportState)}
        onClose={handleDismissExport}
        onOpenModal={() => setIsExportFolderModalOpen(true)}
        onCancel={handleCancelExport}
        hasDownloadTrackerOpen={isDownloadTrackerOpen && activeTasks.length > 0}
      />

      {/* Modal Lưu Video Vào Thư Mục Máy Tính (Hỏi chọn ổ đĩa) */}
      <ExportFolderModal
        isOpen={isExportFolderModalOpen}
        onClose={() => setIsExportFolderModalOpen(false)}
        videoIds={exportFolderVideoIds}
        videos={videos}
        exportState={exportState}
        onStartExport={handleStartExport}
        onResetExport={handleResetExportState}
      />

      {/* Modals */}
      <DownloaderModal
        isOpen={isDownloaderOpen}
        onClose={() => {
          setIsDownloaderOpen(false);
          setDownloaderInitialChannelUrl("");
        }}
        initialTab={downloaderTab}
        initialChannelUrl={downloaderInitialChannelUrl}
        initialChannelPlatform={downloaderInitialPlatform}
        latestIngestedChannel={latestIngestedChannel}
        categories={categories}
        onStartSingleDownload={handleStartSingleDownload}
        onStartBatchDownload={handleStartBatchDownload}
        activeTasks={activeTasks}
        driveStatus={driveStatus}
      />

      <VideoDetailModal
        video={detailVideo}
        videoList={detailVideoList}
        onSelectVideo={(v) => setDetailVideo(v)}
        onClose={() => setDetailVideo(null)}
        categories={categories}
        onOpenScheduleModal={(v) => {
          setDetailVideo(null);
          setSchedulingVideo(v);
        }}
        onDeleteVideo={handleDeleteVideo}
        onSyncDrive={handleSyncDrive}
        onVideoUpdated={(updated) => {
          setDetailVideo(updated);
          setDetailVideoList((prevList) =>
            prevList.map((v) => (v.id === updated.id ? { ...v, ...updated } : v))
          );
          loadVideos();
        }}
        onOpenAudioStudio={handleOpenAudioStudio}
        onResetVideoSaved={handleResetVideoSaved}
        onToggleVideoLearned={handleToggleVideoLearned}
      />

      <DriveSettingsModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        driveStatus={driveStatus}
        onDriveStatusUpdated={(newStatus) => setDriveStatus(newStatus)}
      />

      <ExtensionModal
        isOpen={isExtensionModalOpen}
        onClose={() => setIsExtensionModalOpen(false)}
      />

      <PipFloatingWidget
        isOpen={isPipOpen}
        onClose={() => setIsPipOpen(false)}
        categories={categories}
        activeTasks={activeTasks}
        recentVideos={allVideos}
        onStartSingleDownload={handleStartSingleDownload}
        onClearCompleted={async () => {
          try {
            await clearCompletedDownloadTasks();
            setActiveTasks((prev) => prev.filter((t) => !t.isCompleted && !t.isError && (t.percent || 0) < 100));
          } catch (e) {
            console.error(e);
          }
        }}
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

      {/* 6. Mini Form Lên Lịch Đăng Bài */}
      <ScheduleModal
        isOpen={Boolean(schedulingVideo)}
        video={schedulingVideo}
        onClose={() => setSchedulingVideo(null)}
        onSave={async (eventData) => {
          try {
            await handleSaveCalendarEvent(eventData);
            setConfirmModalState({
              isOpen: true,
              type: "success",
              title: "Lên Lịch Thành Công",
              message: "Video đã được lên lịch đăng bài thành công và đồng bộ thông tin sang Lịch Đăng Bài & Media Vault!",
              confirmText: "Đồng ý",
              showCancel: false
            });
          } catch (err) {
            setConfirmModalState({
              isOpen: true,
              type: "danger",
              title: "Lỗi Khi Lên Lịch",
              message: "Không thể lưu lịch đăng: " + err.message,
              confirmText: "Đóng",
              showCancel: false
            });
          }
        }}
      />

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

      {/* Custom Confirmation & Notification Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        type={confirmModalState.type}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText={confirmModalState.confirmText}
        cancelText={confirmModalState.cancelText}
        showCancel={confirmModalState.showCancel}
        onConfirm={confirmModalState.onConfirm}
        onClose={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
      />
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

