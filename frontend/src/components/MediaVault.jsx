import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Icon } from "./Icons";
import { MEDIA_BASE, openDownloadsFolder } from "../api";
import { useLanguage } from "../i18n";
import ExportFolderModal from "./ExportFolderModal";
import CategoryLockScreen from "./CategoryLockScreen";
import VideoCard from "./VideoCard";
import { extractCleanUrl, extractBatchUrls } from "../utils/urlHelper";
import { renderCategorySelectOptions } from "../utils/categoryHelper";

const PAGE_SIZE = 24; // Number of cards to render per batch

export default function MediaVault({
  videos,
  categories,
  calendarEvents = [],
  selectedCategory,
  onSelectVideoForDetail,
  onOpenScheduleModal,
  onDeleteVideo,
  onSyncDrive,
  onBatchMove,
  selectedVideoIds = [],
  setSelectedVideoIds,
  onOpenDownloader,
  onStartSingleDownload,
  onStartBatchDownload,
  onOpenDriveModal,
  driveStatus,
  isTrashView = false,
  onRestoreVideo,
  onPermanentDeleteVideo,
  onEmptyTrash,
  onBatchTrash,
  onBatchRestore,
  onBatchPermanentDelete,
  onCleanupDisk,
  unlockedCategoryIds = {},
  onUnlockCategory,
  onLockCategory,
  onToggleRemember,
  onSelectCategory,
  onOpenAudioStudio,
  onToggleVideoUsed,
  onBatchToggleUsed,
  onToggleVideoLearned,
  onBatchToggleLearned,
  onOpenExportModal,
  onResetVideoSaved,
  onBatchResetSaved,
  onAddCategory
}) {
  const { t } = useLanguage();
  const [platformFilter, setPlatformFilter] = useState("all");
  const [usedFilter, setUsedFilter] = useState("all"); // "all" | "unused" | "used"
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all"); // "all" | "video" | "image"
  const [quickUrl, setQuickUrl] = useState("");
  const [quickCat, setQuickCat] = useState("all");
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isExportFolderOpen, setIsExportFolderOpen] = useState(false);
  const [exportVideoIds, setExportVideoIds] = useState([]);
  const [isCleaningDisk, setIsCleaningDisk] = useState(false);

  // Pagination state: user can choose 17, 30, 50, all or custom number
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("mediavault_pagesize");
    if (!saved || saved === "24") return 17;
    return saved === "all" ? "all" : parseInt(saved, 10) || 17;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [customPageSize, setCustomPageSize] = useState("");
  const [jumpPage, setJumpPage] = useState("");

  const handleOpenExportModal = (ids) => {
    if (onOpenExportModal) {
      onOpenExportModal(ids);
    } else {
      setExportVideoIds(ids);
      setIsExportFolderOpen(true);
    }
  };

  const handleTriggerCleanupDisk = async () => {
    if (confirm("Hệ thống sẽ quét và dọn sạch các file video .mp4 trên máy tính đối với những video đã được lưu trên Google Drive để giải phóng dung lượng ổ đĩa. Bạn có muốn tiếp tục?")) {
      setIsCleaningDisk(true);
      try {
        if (onCleanupDisk) await onCleanupDisk();
      } finally {
        setIsCleaningDisk(false);
      }
    }
  };

  const handleOpenFolder = async () => {
    try {
      setIsOpeningFolder(true);
      await openDownloadsFolder();
    } catch (err) {
      alert("Không thể mở thư mục: " + err.message);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  // --- Category & Subcategory Resolution for Parent Filtering ---
  const activeCatObj = useMemo(() => {
    return Array.isArray(categories) ? categories.find((c) => c.id === selectedCategory) : null;
  }, [categories, selectedCategory]);

  const parentCatObj = useMemo(() => {
    if (!activeCatObj) return null;
    if (activeCatObj.parent_id) {
      return (Array.isArray(categories) && categories.find((c) => c.id === activeCatObj.parent_id)) || activeCatObj;
    }
    return activeCatObj;
  }, [categories, activeCatObj]);

  const subcategories = useMemo(() => {
    if (!parentCatObj || parentCatObj.id === "all" || !Array.isArray(categories)) return [];
    return categories.filter((c) => c.parent_id === parentCatObj.id);
  }, [categories, parentCatObj]);

  // Thống kê số video thuộc từng danh mục con
  const subcatCounts = useMemo(() => {
    const counts = {};
    if (!Array.isArray(videos)) return counts;
    videos.forEach((v) => {
      if (v.category_id) {
        counts[v.category_id] = (counts[v.category_id] || 0) + 1;
      }
    });
    return counts;
  }, [videos]);

  // Số lượng video nằm trực tiếp ở danh mục cha (chưa phân vào mục con nào)
  const directParentCount = useMemo(() => {
    if (!parentCatObj || parentCatObj.id === "all") return 0;
    return (videos || []).filter((v) => v.category_id === parentCatObj.id).length;
  }, [videos, parentCatObj]);

  // Danh sách tất cả ID hợp lệ trong danh mục cha này (gồm direct parent + các subcategories)
  const allSubcatIds = useMemo(() => {
    if (!parentCatObj || parentCatObj.id === "all") return [];
    const ids = subcategories.map((s) => s.id);
    if (directParentCount > 0 || ids.length === 0) {
      ids.unshift(parentCatObj.id);
    }
    return ids;
  }, [parentCatObj, subcategories, directParentCount]);

  // Danh sách ID các danh mục con (và mục cha) được tích chọn hiển thị trong danh mục cha
  const [selectedSubcatIds, setSelectedSubcatIds] = useState([]);

  // Tự động tích chọn tất cả mục con khi chuyển sang danh mục cha mới hoặc khi subcategories thay đổi
  useEffect(() => {
    if (parentCatObj && parentCatObj.id !== "all" && subcategories.length > 0) {
      setSelectedSubcatIds(allSubcatIds);
    } else {
      setSelectedSubcatIds([]);
    }
  }, [selectedCategory, parentCatObj?.id, allSubcatIds.length]);

  const isAllSubcatsSelected = useMemo(() => {
    if (!allSubcatIds.length) return false;
    return allSubcatIds.every((id) => selectedSubcatIds.includes(id));
  }, [allSubcatIds, selectedSubcatIds]);

  const toggleSubcatFilter = (id) => {
    setSelectedSubcatIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectAllSubcats = () => {
    if (isAllSubcatsSelected) {
      setSelectedSubcatIds([]);
    } else {
      setSelectedSubcatIds(allSubcatIds);
    }
  };

  // Video sau khi áp dụng bộ lọc tích chọn danh mục con trong danh mục cha
  const videosInSelectedSubcats = useMemo(() => {
    if (!parentCatObj || parentCatObj.id === "all" || subcategories.length === 0 || selectedCategory !== parentCatObj.id) {
      return videos;
    }
    return videos.filter((v) => {
      if (v.category_id === parentCatObj.id) {
        return selectedSubcatIds.includes(parentCatObj.id);
      }
      return selectedSubcatIds.includes(v.category_id);
    });
  }, [videos, parentCatObj, subcategories.length, selectedCategory, selectedSubcatIds]);

  // Platform Filter options
  const platforms = [
    { id: "all", label: t("all_platforms") },
    { id: "tiktok", label: "TikTok", icon: "tiktok" },
    { id: "youtube", label: "YouTube", icon: "youtube" },
    { id: "instagram", label: "Instagram", icon: "instagram" },
    { id: "x", label: "X / Twitter", icon: "xTwitter" },
    { id: "douyin", label: "Douyin", icon: "tiktok" },
    { id: "drive", label: "Google Drive", icon: "drive" },
  ];

  const filteredVideos = useMemo(() => videosInSelectedSubcats.filter((v) => {
    if (platformFilter !== "all" && v.platform !== platformFilter) return false;
    if (usedFilter === "used" && !v.is_used) return false;
    if (usedFilter === "unused" && Boolean(v.is_used)) return false;
    if (usedFilter === "learned" && !v.is_learned) return false;
    if (usedFilter === "unlearned" && Boolean(v.is_learned)) return false;
    if (usedFilter === "saved_to_computer" && !(v.local_export_count > 0 || v.is_saved_to_computer)) return false;
    if (usedFilter === "scheduled" && !calendarEvents.some((ev) => ev.video_id === v.id)) return false;
    if (mediaTypeFilter === "video" && v.media_type === "image") return false;
    if (mediaTypeFilter === "image" && v.media_type !== "image") return false;
    return true;
  }), [videosInSelectedSubcats, platformFilter, usedFilter, mediaTypeFilter, calendarEvents]);

  // Total pages calculation
  const totalPages = useMemo(() => {
    if (pageSize === "all") return 1;
    return Math.max(1, Math.ceil(filteredVideos.length / pageSize));
  }, [filteredVideos.length, pageSize]);

  // Ensure current page is valid within range
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  // Reset page to 1 when filters or category change
  useEffect(() => {
    setCurrentPage(1);
  }, [platformFilter, usedFilter, mediaTypeFilter, selectedCategory]);

  // Sliced videos for display on current page
  const displayedVideos = useMemo(() => {
    if (pageSize === "all") return filteredVideos;
    const start = (safePage - 1) * pageSize;
    return filteredVideos.slice(start, start + pageSize);
  }, [filteredVideos, safePage, pageSize]);

  const handlePageChange = (p) => {
    const target = Math.min(Math.max(1, p), totalPages);
    setCurrentPage(target);
    const container = document.querySelector(".view-content");
    if (container) {
      container.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
    localStorage.setItem("mediavault_pagesize", String(newSize));
  };

  const handleApplyCustomPageSize = (e) => {
    if (e) e.preventDefault();
    const val = parseInt(customPageSize.trim(), 10);
    if (!isNaN(val) && val > 0) {
      handlePageSizeChange(val);
      setCustomPageSize("");
    }
  };

  const handleJumpToPage = (e) => {
    if (e) e.preventDefault();
    const val = parseInt(jumpPage.trim(), 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      handlePageChange(val);
      setJumpPage("");
    }
  };

  const scheduledVideoIds = useMemo(
    () => new Set((calendarEvents || []).map((ev) => ev.video_id).filter(Boolean)),
    [calendarEvents]
  );
  const totalCount = videosInSelectedSubcats.length;
  const usedCount = videosInSelectedSubcats.filter((v) => Boolean(v.is_used)).length;
  const unusedCount = totalCount - usedCount;
  const learnedCount = videosInSelectedSubcats.filter((v) => Boolean(v.is_learned)).length;
  const unlearnedCount = totalCount - learnedCount;
  const savedToComputerCount = videosInSelectedSubcats.filter((v) => Boolean(v.local_export_count > 0 || v.is_saved_to_computer)).length;
  const scheduledCount = videosInSelectedSubcats.filter((v) => scheduledVideoIds.has(v.id)).length;
  const videoCount = videosInSelectedSubcats.filter((v) => v.media_type !== "image").length;
  const imageCount = videosInSelectedSubcats.filter((v) => v.media_type === "image").length;

  const toggleSelectVideo = (id) => {
    if (selectedVideoIds.includes(id)) {
      setSelectedVideoIds(selectedVideoIds.filter((v) => v !== id));
    } else {
      setSelectedVideoIds([...selectedVideoIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedVideoIds.length === filteredVideos.length) {
      setSelectedVideoIds([]);
    } else {
      setSelectedVideoIds(filteredVideos.map((v) => v.id));
    }
  };

  // --- Marquee Drag-to-Select (Quét chuột chọn nhiều video như Windows Explorer) ---
  const gridContainerRef = useRef(null);
  const marqueeRef = useRef(null);
  const marqueeCountBadgeRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const selectedVideoIdsRef = useRef(selectedVideoIds);
  const rafIdRef = useRef(null);
  const modifierRef = useRef({ shift: false, ctrl: false });

  useEffect(() => {
    selectedVideoIdsRef.current = selectedVideoIds;
  }, [selectedVideoIds]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      document.body.style.userSelect = "";
    };
  }, []);

  const handleGridMouseDown = useCallback((e) => {
    // Chỉ kích hoạt khi nhấn chuột trái
    if (e.button !== 0) return;

    // Không kích hoạt kéo chọn khi click vào các nút, input, checkbox, hoặc phần tử tương tác
    const interactive = e.target.closest(
      'button, a, input, select, textarea, .video-checkbox, .video-action-btn, .video-actions, .vault-pagination-bar, .batch-actions-bar, [data-no-drag], [draggable="true"]'
    );
    if (interactive) return;

    const startX = e.clientX;
    const startY = e.clientY;
    dragStartPosRef.current = { x: startX, y: startY };
    isDraggingRef.current = false;
    modifierRef.current = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };

    const scrollEl = gridContainerRef.current?.closest(".view-content");
    const initialScrollTop = scrollEl ? scrollEl.scrollTop : 0;

    // TỐI ƯU 120FPS: Cache tọa độ tất cả các thẻ video 1 lần duy nhất lúc bắt đầu kéo (Không gọi getBoundingClientRect lặp lại!)
    const cardNodes = gridContainerRef.current
      ? Array.from(gridContainerRef.current.querySelectorAll(".video-card[data-video-id]"))
      : [];

    const cachedCards = cardNodes.map((card) => {
      const rect = card.getBoundingClientRect();
      const checkbox = card.querySelector(".video-checkbox");
      const id = card.getAttribute("data-video-id");
      const wasSelected = selectedVideoIdsRef.current.includes(id);
      return {
        el: card,
        checkboxEl: checkbox,
        id,
        // Chuyển sang tọa độ tương đối với container (kháng cuộn trang)
        top: rect.top + initialScrollTop,
        bottom: rect.bottom + initialScrollTop,
        left: rect.left,
        right: rect.right,
        initiallySelected: wasSelected,
        currentSelected: wasSelected
      };
    });

    const activeSelectedSet = new Set(selectedVideoIdsRef.current);
    let latestX = startX;
    let latestY = startY;

    const updateMarquee = () => {
      const currentX = latestX;
      const currentY = latestY;
      const dx = currentX - startX;
      const dy = currentY - startY;

      // Ngưỡng di chuyển 5px để phân biệt giữa click xem chi tiết và kéo quét chọn
      if (!isDraggingRef.current) {
        if (Math.hypot(dx, dy) >= 5) {
          isDraggingRef.current = true;
          document.body.style.userSelect = "none";
          if (gridContainerRef.current) {
            gridContainerRef.current.classList.add("is-marquee-active");
          }
          if (marqueeRef.current) {
            marqueeRef.current.style.display = "block";
          }
        } else {
          return;
        }
      }

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const right = left + width;
      const bottom = top + height;

      // Di chuyển khung marquee mượt mà
      if (marqueeRef.current) {
        marqueeRef.current.style.left = `${left}px`;
        marqueeRef.current.style.top = `${top}px`;
        marqueeRef.current.style.width = `${width}px`;
        marqueeRef.current.style.height = `${height}px`;
      }

      // Tự động cuộn trang mượt mà khi kéo sát viền
      const currentScrollTop = scrollEl ? scrollEl.scrollTop : 0;
      if (scrollEl) {
        const sRect = scrollEl.getBoundingClientRect();
        const threshold = 50;
        const speed = 12;
        if (currentY < sRect.top + threshold && scrollEl.scrollTop > 0) {
          scrollEl.scrollTop -= speed;
        } else if (currentY > sRect.bottom - threshold) {
          scrollEl.scrollTop += speed;
        }
      }

      // Quét va chạm siêu tốc trong bộ nhớ (Zero Layout Reflows, Zero Forced Reflow!)
      let hitCount = 0;
      activeSelectedSet.clear();

      for (let i = 0; i < cachedCards.length; i++) {
        const card = cachedCards[i];
        const cardViewTop = card.top - currentScrollTop;
        const cardViewBottom = card.bottom - currentScrollTop;

        const isHit = !(
          card.right < left ||
          card.left > right ||
          cardViewBottom < top ||
          cardViewTop > bottom
        );

        let isSelected;
        if (modifierRef.current.shift) {
          isSelected = card.initiallySelected || isHit;
        } else if (modifierRef.current.ctrl) {
          isSelected = isHit ? !card.initiallySelected : card.initiallySelected;
        } else {
          isSelected = isHit;
        }

        if (isSelected) {
          activeSelectedSet.add(card.id);
          hitCount++;
        }

        // Cập nhật DOM trực tiếp chỉ khi trạng thái thay đổi -> KHÔNG gây re-render React khi đang rê chuột!
        if (isSelected !== card.currentSelected) {
          card.currentSelected = isSelected;
          card.el.classList.toggle("selected", isSelected);
          if (card.checkboxEl) {
            card.checkboxEl.classList.toggle("checked", isSelected);
          }
        }
      }

      // Cập nhật số lượng video trên huy hiệu của khung quét
      if (marqueeCountBadgeRef.current) {
        if (hitCount > 0) {
          marqueeCountBadgeRef.current.style.display = "inline-flex";
          marqueeCountBadgeRef.current.textContent = `${hitCount} video`;
        } else {
          marqueeCountBadgeRef.current.style.display = "none";
        }
      }
    };

    const handleMouseMove = (moveEv) => {
      latestX = moveEv.clientX;
      latestY = moveEv.clientY;
      if (isDraggingRef.current) {
        moveEv.preventDefault();
      }
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(updateMarquee);
    };

    const handleMouseUp = (upEv) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      document.body.style.userSelect = "";

      if (gridContainerRef.current) {
        gridContainerRef.current.classList.remove("is-marquee-active");
      }

      if (marqueeRef.current) {
        marqueeRef.current.style.display = "none";
        marqueeRef.current.style.width = "0px";
        marqueeRef.current.style.height = "0px";
      }
      if (marqueeCountBadgeRef.current) {
        marqueeCountBadgeRef.current.style.display = "none";
      }

      if (isDraggingRef.current) {
        // Chặn sự kiện click theo sau để không mở Modal chi tiết video khi vừa kết thúc thao tác kéo
        const suppressClick = (cEv) => {
          cEv.stopPropagation();
          cEv.preventDefault();
          window.removeEventListener("click", suppressClick, true);
        };
        window.addEventListener("click", suppressClick, true);

        // ĐỒNG BỘ VỚI REACT STATE 1 LẦN DUY NHẤT KHI THẢ CHUỘT
        const finalIds = Array.from(activeSelectedSet);
        setSelectedVideoIds(finalIds);

        isDraggingRef.current = false;
      } else {
        // Nhấp chuột đơn lẻ vào khoảng trống (không trúng card nào): Hủy chọn toàn bộ
        const clickedCard = upEv.target.closest(".video-card");
        if (!clickedCard && !modifierRef.current.shift && !modifierRef.current.ctrl) {
          setSelectedVideoIds([]);
        }
      }
    };

    const handleKeyDown = (keyEv) => {
      // Phím Escape hủy bỏ thao tác kéo chọn
      if (keyEv.key === "Escape") {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("keydown", handleKeyDown);
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        document.body.style.userSelect = "";

        if (gridContainerRef.current) {
          gridContainerRef.current.classList.remove("is-marquee-active");
        }
        if (marqueeRef.current) {
          marqueeRef.current.style.display = "none";
        }
        if (marqueeCountBadgeRef.current) {
          marqueeCountBadgeRef.current.style.display = "none";
        }

        // Khôi phục lại trạng thái giao diện ban đầu
        cachedCards.forEach((c) => {
          c.el.classList.toggle("selected", c.initiallySelected);
          if (c.checkboxEl) {
            c.checkboxEl.classList.toggle("checked", c.initiallySelected);
          }
        });

        isDraggingRef.current = false;
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
  }, [setSelectedVideoIds]);

  const formatDuration = useCallback((sec) => {
    if (!sec) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, []);

  const getThumbnailSrc = useCallback((video) => {
    if (!video) return "";
    // 1. ƯU TIÊN CAO NHẤT: Link CDN trực tiếp trên Cloud (ImgBB, CDN mạng ngoài) -> Tải trực tiếp siêu tốc 0ms, không nghẽn server localhost!
    if (video.thumbnail_url && (video.thumbnail_url.startsWith("http://") || video.thumbnail_url.startsWith("https://")) && !video.thumbnail_url.includes("googleusercontent.com")) {
      return video.thumbnail_url;
    }
    // 2. Ảnh lưu tạm trên máy nếu có
    if (video.local_thumbnail) {
      const filename = video.local_thumbnail.split(/[\\/]/).pop();
      return `${MEDIA_BASE}/thumbnails/${filename}`;
    }
    // 3. Video trên Google Drive
    if (video.drive_file_id) {
      return `/api/drive/thumbnail/${video.drive_file_id}`;
    }
    // 4. Fallback endpoint backend theo ID
    if (video.id) {
      return `/api/videos/${video.id}/thumbnail`;
    }
    return video.thumbnail_url || "";
  }, []);

  const handleQuickDownload = () => {
    const raw = quickUrl.trim();
    if (!raw) return;

    // Tự động nhận diện nếu người dùng dán nhiều link video (hàng loạt)
    const batchUrls = extractBatchUrls(raw);
    if (batchUrls.length > 1 && onStartBatchDownload) {
      onStartBatchDownload(batchUrls, quickCat || "all", true);
      setQuickUrl("");
      return;
    }

    const clean = extractCleanUrl(raw);
    if (!clean.trim()) return;
    if (onStartSingleDownload) {
      onStartSingleDownload(clean.trim(), quickCat || "all", true);
      setQuickUrl("");
    }
  };



  // Bảng tra cứu danh mục nhanh theo ID để hiển thị tag danh mục con
  const categoryMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(categories)) {
      categories.forEach((c) => {
        map.set(c.id, c);
      });
    }
    return map;
  }, [categories]);

  // Tính toán Tag danh mục / danh mục con cho từng video
  const getCategoryTag = useCallback((video) => {
    if (!video.category_id || video.category_id === "all" || video.category_id === "default") {
      return null;
    }
    const cat = categoryMap.get(video.category_id);
    if (!cat) return null;

    // 1. Khi đang xem danh mục cha lớn (VD: Cảnh Vật):
    if (parentCatObj && parentCatObj.id !== "all") {
      // Nếu video này thuộc một danh mục con (ví dụ: Mưa) trong danh mục cha này:
      if (cat.parent_id === parentCatObj.id || cat.id !== parentCatObj.id) {
        return {
          id: cat.id,
          name: cat.name,
          color: cat.color || "#06b6d4",
          icon: cat.icon || "folder",
          isSubcategory: true,
          parentName: parentCatObj.name
        };
      }
      return null;
    }

    // 2. Khi đang xem riêng 1 danh mục con:
    if (activeCatObj && activeCatObj.parent_id) {
      return {
        id: cat.id,
        name: cat.name,
        color: cat.color || "#06b6d4",
        icon: cat.icon || "folder",
        isSubcategory: true
      };
    }

    // 3. Khi đang xem "Tất cả Video":
    if (cat.parent_id) {
      const parent = categoryMap.get(cat.parent_id);
      return {
        id: cat.id,
        name: cat.name,
        color: cat.color || "#06b6d4",
        icon: cat.icon || "folder",
        isSubcategory: true,
        parentName: parent ? parent.name : null
      };
    }

    return {
      id: cat.id,
      name: cat.name,
      color: cat.color || "#8b5cf6",
      icon: cat.icon || "folder",
      isSubcategory: false
    };
  }, [categoryMap, parentCatObj, activeCatObj]);

  // Kiểm tra khóa mật khẩu (kế thừa từ danh mục cha nếu là danh mục con)
  const lockedCatObj = activeCatObj?.is_locked ? activeCatObj : (parentCatObj?.is_locked ? parentCatObj : null);
  const isCurrentCategoryLocked = !isTrashView && selectedCategory !== "all" && Boolean(lockedCatObj?.is_locked) && !unlockedCategoryIds?.[lockedCatObj.id] && localStorage.getItem(`remember_cat_${lockedCatObj.id}`) !== "true";
  const isRemembered = Boolean(lockedCatObj && localStorage.getItem(`remember_cat_${lockedCatObj.id}`) === "true");

  if (isCurrentCategoryLocked && lockedCatObj) {
    return (
      <div className="view-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
        <CategoryLockScreen
          category={lockedCatObj}
          onUnlock={(pass, remember) => onUnlockCategory(lockedCatObj.id, pass, remember)}
          onBack={() => onSelectCategory && onSelectCategory("all")}
        />
      </div>
    );
  }

  return (
    <div className="view-content">
      {/* 0. Locked Category Security Banner (When Unlocked) */}
      {!isTrashView && selectedCategory !== "all" && Boolean(activeCatObj?.is_locked) && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))",
          borderRadius: "12px",
          border: "1px solid rgba(139, 92, 246, 0.35)",
          marginBottom: "16px",
          gap: "12px",
          flexWrap: "wrap"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "rgba(139, 92, 246, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Icon name="lock" size={16} color="#a78bfa" />
            </div>
            <div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#fff" }}>
                Danh mục bảo mật: {activeCatObj.name}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                Đã mở khóa • Video ẩn khỏi "Tất cả Video" • {isRemembered ? "Đang BẬT ghi nhớ (không hỏi lại mật khẩu)" : "Đang TẮT ghi nhớ (tự động khóa khi rời đi)"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Toggle Ghi nhớ mật khẩu ON/OFF */}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "12px",
                color: isRemembered ? "#a78bfa" : "var(--text-muted)",
                cursor: "pointer",
                userSelect: "none",
                background: isRemembered ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.05)",
                padding: "5px 12px",
                borderRadius: "20px",
                border: isRemembered ? "1px solid rgba(139, 92, 246, 0.45)" : "1px solid var(--border-color)",
                fontWeight: 600,
                transition: "all 0.2s ease"
              }}
              title="BẬT: Không cần nhập lại mật khẩu mỗi lần vào danh mục. TẮT: Phải nhập lại mật khẩu mỗi lần vào."
            >
              <input
                type="checkbox"
                checked={isRemembered}
                onChange={() => onToggleRemember && onToggleRemember(activeCatObj.id)}
                style={{ cursor: "pointer", accentColor: "#8b5cf6", width: "14px", height: "14px" }}
              />
              <span>Ghi nhớ mật khẩu: {isRemembered ? "BẬT (ON)" : "TẮT (OFF)"}</span>
            </label>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onLockCategory && onLockCategory(activeCatObj.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#f43f5e",
                borderColor: "rgba(244, 63, 94, 0.4)",
                background: "rgba(244, 63, 94, 0.12)",
                fontWeight: 600
              }}
              title="Khóa lại danh mục này ngay lập tức và xóa bỏ ghi nhớ mật khẩu"
            >
              <Icon name="lock" size={13} color="#f43f5e" />
              <span>Khóa Danh Mục & Bỏ Ghi Nhớ</span>
            </button>
          </div>
        </div>
      )}
      {/* 1. Quick Ingestion Bar OR Trash Banner */}
      {isTrashView ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          background: "rgba(244, 63, 94, 0.08)",
          borderRadius: "12px",
          border: "1px solid rgba(244, 63, 94, 0.25)",
          marginBottom: "16px",
          gap: "16px",
          flexWrap: "wrap"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(244, 63, 94, 0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <Icon name="trash" size={20} color="#f43f5e" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                {t("trash_banner_title")} ({filteredVideos.length})
              </h3>
              <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                {t("trash_banner_desc")}
              </p>
            </div>
          </div>

          {filteredVideos.length > 0 && (
            <button
              className="btn btn-primary"
              style={{
                background: "linear-gradient(135deg, #e11d48 0%, #be123c 100%)",
                borderColor: "#be123c",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                padding: "8px 14px"
              }}
              onClick={() => {
                if (confirm(t("empty_trash_confirm"))) {
                  if (onEmptyTrash) onEmptyTrash();
                }
              }}
            >
              <Icon name="trash" size={14} color="#fff" />
              <span>{t("empty_trash")}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="vault-quick-bar">
          <div className="quick-input-group">
            <Icon name="link" size={16} color="var(--accent-primary)" />
            <input
              type="text"
              className="quick-url-input"
              placeholder="Dán nhanh liên kết video / ảnh (TikTok, Douyin, YouTube, Reels, X, Drive...)"
              value={quickUrl}
              onChange={(e) => setQuickUrl(extractCleanUrl(e.target.value))}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData("text") || "";
                if (pasted) {
                  const clean = extractCleanUrl(pasted);
                  if (clean && clean !== pasted) {
                    e.preventDefault();
                    setQuickUrl(clean);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickDownload();
              }}
            />
          </div>

          <select
            className="quick-cat-select"
            value={quickCat}
            onChange={(e) => setQuickCat(e.target.value)}
            title={t("move_category")}
          >
            {renderCategorySelectOptions(categories, { includeAll: true, allLabel: t("all_unclassified") })}
          </select>

          <button
            className="btn btn-primary btn-quick-submit"
            onClick={handleQuickDownload}
            disabled={!quickUrl.trim()}
          >
            <Icon name="download" size={15} color="#fff" />
            <span>{t("download_now")}</span>
          </button>
        </div>
      )}

      {/* 1.5. Thanh Danh Mục Con & Bộ Lọc Tích Chọn Danh Mục Con */}
      {!isTrashView && parentCatObj && parentCatObj.id !== "all" && (subcategories.length > 0 || activeCatObj?.parent_id) && (
        <div className="vault-subcategories-bar">
          {/* Trường hợp 1: Đang xem tại Danh mục Cha -> Hiển thị Bộ lọc tích chọn các danh mục con */}
          {selectedCategory === parentCatObj.id ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, fontSize: "12px", fontWeight: 700, color: "var(--accent-secondary)", marginRight: "4px" }}>
                <Icon name={parentCatObj.icon || "folder"} size={14} color="var(--accent-primary)" />
                <span>{parentCatObj.name}:</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-muted)" }}>Lọc mục con:</span>
              </div>

              {/* Pill Tất cả: Tích chọn tất cả / Bỏ chọn tất cả */}
              <button
                type="button"
                className={`subcat-pill ${isAllSubcatsSelected ? "is-checked" : "is-unchecked"}`}
                onClick={toggleSelectAllSubcats}
                title={isAllSubcatsSelected ? "Bỏ tích tất cả mục con" : "Tích chọn hiển thị tất cả video"}
              >
                <span className={`subcat-checkbox-box ${isAllSubcatsSelected ? "checked" : ""}`}>
                  {isAllSubcatsSelected && <Icon name="check" size={10} color="#fff" />}
                </span>
                <span>Tất cả ({videos.length})</span>
              </button>

              {/* Pill Chỉ video thuộc mục cha (chưa phân vào mục con nào) */}
              {directParentCount > 0 && (
                <button
                  type="button"
                  className={`subcat-pill ${selectedSubcatIds.includes(parentCatObj.id) ? "is-checked" : "is-unchecked"}`}
                  onClick={() => toggleSubcatFilter(parentCatObj.id)}
                  title="Tích chọn để hiển thị các video nằm trực tiếp ở mục cha này (chưa phân vào mục con nào)"
                >
                  <span className={`subcat-checkbox-box ${selectedSubcatIds.includes(parentCatObj.id) ? "checked" : ""}`}>
                    {selectedSubcatIds.includes(parentCatObj.id) && <Icon name="check" size={10} color="#fff" />}
                  </span>
                  <Icon name="folder" size={12} color={selectedSubcatIds.includes(parentCatObj.id) ? "var(--accent-primary)" : "var(--text-muted)"} />
                  <span>Chỉ mục cha</span>
                  <span className="subcat-badge">{directParentCount}</span>
                  <span
                    className="subcat-isolate-btn"
                    title="Chỉ hiển thị riêng video mục cha"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSubcatIds([parentCatObj.id]);
                    }}
                  >
                    chỉ xem
                  </span>
                </button>
              )}

              {/* Các Pill danh mục con với checkbox tích chọn */}
              {subcategories.map((sub) => {
                const isChecked = selectedSubcatIds.includes(sub.id);
                const subCount = subcatCounts[sub.id] || 0;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    className={`subcat-pill ${isChecked ? "is-checked" : "is-unchecked"}`}
                    onClick={() => toggleSubcatFilter(sub.id)}
                    title={`Tích chọn để hiển thị video của mục con "${sub.name}". Bấm để bật/tắt.`}
                  >
                    <span className={`subcat-checkbox-box ${isChecked ? "checked" : ""}`}>
                      {isChecked && <Icon name="check" size={10} color="#fff" />}
                    </span>
                    <Icon name={sub.icon || "folder"} size={12} color={isChecked ? "var(--accent-cyan)" : "var(--text-muted)"} />
                    <span>{sub.name}</span>
                    <span className="subcat-badge">{subCount}</span>
                    <span
                      className="subcat-isolate-btn"
                      title={`Chỉ hiển thị riêng mục con "${sub.name}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSubcatIds([sub.id]);
                      }}
                    >
                      chỉ xem
                    </span>
                  </button>
                );
              })}

              {/* Nút thêm nhanh danh mục con trực tiếp từ thanh này */}
              <button
                type="button"
                className="subcat-pill add-sub-pill"
                onClick={() => {
                  const name = window.prompt(`Nhập tên danh mục con mới cho danh mục "${parentCatObj.name}":`);
                  if (name && name.trim()) {
                    const catId = name.toLowerCase().trim().replace(/[^a-z0-9]/g, "_") + "_" + Date.now().toString(36);
                    if (onAddCategory) {
                      onAddCategory({
                        id: catId,
                        name: name.trim(),
                        icon: "folder",
                        color: "#8b5cf6",
                        parent_id: parentCatObj.id
                      });
                    }
                  }
                }}
                title={`Tạo thêm danh mục con cho "${parentCatObj.name}"`}
              >
                <Icon name="plus" size={11} color="var(--accent-secondary)" />
                <span>+ Thêm mục con</span>
              </button>
            </>
          ) : (
            /* Trường hợp 2: Người dùng đang bấm vào riêng 1 danh mục con từ sidebar -> Cung cấp nút quay lại danh mục cha */
            <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                <Icon name={parentCatObj.icon || "folder"} size={13} color="var(--accent-secondary)" />
                <span>{parentCatObj.name}</span>
                <span style={{ color: "var(--text-muted)" }}>›</span>
                <strong style={{ color: "var(--accent-cyan)" }}>{activeCatObj?.name}</strong>
                <span className="subcat-badge" style={{ marginLeft: "4px" }}>{videos.length} video</span>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onSelectCategory && onSelectCategory(parentCatObj.id)}
                style={{ padding: "3px 10px", fontSize: "11.5px", gap: "5px" }}
                title={`Xem toàn bộ danh mục lớn "${parentCatObj.name}" và lọc theo các mục con`}
              >
                <Icon name="arrowLeft" size={12} />
                <span>Xem danh mục cha ({parentCatObj.name})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Top Controls & Filter Pills */}
      <div className="vault-header">
        {/* Hàng 1: Bộ lọc nền tảng */}
        <div className="vault-filter-pills-row">
          <div className="vault-filter-pills">
            {platforms.map((p) => (
              <button
                key={p.id}
                className={`filter-pill ${platformFilter === p.id ? "active" : ""}`}
                onClick={() => setPlatformFilter(p.id)}
              >
                {p.icon && <Icon name={p.icon} size={14} style={{ marginRight: 6 }} />}
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Hàng 2: Trạng thái & Định dạng (Trái) + Thao tác công cụ & Chọn tất cả (Phải) */}
        <div className="vault-subfilters-row">
          <div className="vault-subfilter-left">
            {/* Lọc Trạng Thái Sử Dụng: Tất cả / Chưa dùng / Đã dùng */}
            <div className="vault-used-filter-pills">
          <button
            className={`filter-pill ${usedFilter === "all" ? "active" : ""}`}
            onClick={() => setUsedFilter("all")}
            title="Hiển thị tất cả video"
          >
            <span>Tất cả ({totalCount})</span>
          </button>
          <button
            className={`filter-pill ${usedFilter === "unused" ? "active" : ""}`}
            onClick={() => setUsedFilter("unused")}
            title="Chỉ hiển thị video chưa sử dụng"
          >
            <span>Chưa dùng ({unusedCount})</span>
          </button>
          <button
            className={`filter-pill ${usedFilter === "used" ? "active" : ""}`}
            onClick={() => setUsedFilter("used")}
            title="Chỉ hiển thị video đã sử dụng"
            style={{
              color: usedFilter === "used" ? "#fff" : "#10b981",
              borderColor: usedFilter === "used" ? "#10b981" : "rgba(16, 185, 129, 0.35)",
              background: usedFilter === "used" ? "#10b981" : "rgba(16, 185, 129, 0.08)"
            }}
          >
            <Icon name="checkCircle" size={12} style={{ marginRight: 4 }} color={usedFilter === "used" ? "#fff" : "#10b981"} />
            <span>Đã dùng ({usedCount})</span>
          </button>
          <button
            className={`filter-pill ${usedFilter === "learned" ? "active" : ""}`}
            onClick={() => setUsedFilter(usedFilter === "learned" ? "all" : "learned")}
            title="Chỉ hiển thị các video đã xem học làm edit CapCut"
            style={{
              color: usedFilter === "learned" ? "#fff" : "#10b981",
              borderColor: usedFilter === "learned" ? "#10b981" : "rgba(16, 185, 129, 0.4)",
              background: usedFilter === "learned" ? "linear-gradient(135deg, #10b981 0%, #0d9488 100%)" : "rgba(16, 185, 129, 0.08)"
            }}
          >
            <Icon name="graduationCap" size={12} style={{ marginRight: 4 }} color={usedFilter === "learned" ? "#fff" : "#10b981"} />
            <span>Đã học ({learnedCount})</span>
          </button>
          <button
            className={`filter-pill ${usedFilter === "unlearned" ? "active" : ""}`}
            onClick={() => setUsedFilter(usedFilter === "unlearned" ? "all" : "unlearned")}
            title="Chỉ hiển thị các video chưa xem học làm edit CapCut"
            style={{
              color: usedFilter === "unlearned" ? "#fff" : "#f59e0b",
              borderColor: usedFilter === "unlearned" ? "#f59e0b" : "rgba(245, 158, 11, 0.4)",
              background: usedFilter === "unlearned" ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "rgba(245, 158, 11, 0.08)"
            }}
          >
            <Icon name="book" size={12} style={{ marginRight: 4 }} color={usedFilter === "unlearned" ? "#fff" : "#f59e0b"} />
            <span>Chưa học ({unlearnedCount})</span>
          </button>
          <button
            className={`filter-pill ${usedFilter === "saved_to_computer" ? "active" : ""}`}
            onClick={() => setUsedFilter(usedFilter === "saved_to_computer" ? "all" : "saved_to_computer")}
            title="Chỉ hiển thị các video đã được lưu vào máy tính"
            style={{
              color: usedFilter === "saved_to_computer" ? "#fff" : "var(--accent-cyan)",
              borderColor: usedFilter === "saved_to_computer" ? "var(--accent-cyan)" : "rgba(6, 182, 212, 0.35)",
              background: usedFilter === "saved_to_computer" ? "var(--accent-cyan)" : "rgba(6, 182, 212, 0.08)"
            }}
          >
            <Icon name="download" size={12} style={{ marginRight: 4 }} color={usedFilter === "saved_to_computer" ? "#fff" : "var(--accent-cyan)"} />
            <span>Đã lưu máy ({savedToComputerCount})</span>
          </button>
          <button
            className={`filter-pill ${usedFilter === "scheduled" ? "active" : ""}`}
            onClick={() => setUsedFilter(usedFilter === "scheduled" ? "all" : "scheduled")}
            title="Chỉ hiển thị các video đã được lên lịch đăng bài"
            style={{
              color: usedFilter === "scheduled" ? "#fff" : "#c084fc",
              borderColor: usedFilter === "scheduled" ? "#8b5cf6" : "rgba(139, 92, 246, 0.35)",
              background: usedFilter === "scheduled" ? "#8b5cf6" : "rgba(139, 92, 246, 0.08)"
            }}
          >
            <Icon name="calendar" size={12} style={{ marginRight: 4 }} color={usedFilter === "scheduled" ? "#fff" : "#c084fc"} />
            <span>Đã lên lịch ({scheduledCount})</span>
          </button>
        </div>

        {/* Lọc Định Dạng: Tất cả / Video / Ảnh */}
        <div className="vault-mediatype-filter-pills" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <button
            className={`filter-pill ${mediaTypeFilter === "all" ? "active" : ""}`}
            onClick={() => setMediaTypeFilter("all")}
            title="Hiển thị tất cả video và ảnh"
          >
            <span>Tất cả</span>
          </button>
          <button
            className={`filter-pill ${mediaTypeFilter === "video" ? "active" : ""}`}
            onClick={() => setMediaTypeFilter("video")}
            title="Chỉ hiển thị video"
          >
            <span>🎬 Video ({videoCount})</span>
          </button>
          <button
            className={`filter-pill ${mediaTypeFilter === "image" ? "active" : ""}`}
            onClick={() => setMediaTypeFilter("image")}
            title="Chỉ hiển thị ảnh chất lượng cao"
            style={{
              color: mediaTypeFilter === "image" ? "#fff" : "#38bdf8",
              borderColor: mediaTypeFilter === "image" ? "#38bdf8" : "rgba(56, 189, 248, 0.35)",
              background: mediaTypeFilter === "image" ? "#0284c7" : "rgba(56, 189, 248, 0.08)"
            }}
          >
            <span>🖼️ Ảnh HD ({imageCount})</span>
          </button>
        </div>
      </div>

      {/* Right side stats & multi-select controls */}
      <div className="vault-header-right">
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleTriggerCleanupDisk}
          disabled={isCleaningDisk}
          title="Dọn dẹp file .mp4 trên máy tính (Dữ liệu đã có trên Google Drive)"
          style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent-green)", borderColor: "rgba(16, 185, 129, 0.3)" }}
        >
          <Icon name="sparkles" size={14} color="var(--accent-green)" />
          <span className="vault-action-label">{isCleaningDisk ? "Đang dọn..." : "Giải Phóng Ổ Cứng"}</span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={handleOpenFolder}
          disabled={isOpeningFolder}
          title="Mở thư mục video trên máy tính (Windows Explorer)"
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          <Icon name="folder" size={14} color="var(--accent-cyan)" />
          <span className="vault-action-label">{isOpeningFolder ? "Đang mở..." : "Mở Thư Mục Máy Tính"}</span>
        </button>

        <span className="vault-count-tag">
          {filteredVideos.length} {t("video_unit")}
        </span>

        {filteredVideos.length > 0 && (
          <>
            <button
              className={`btn btn-sm ${selectedVideoIds.length === filteredVideos.length ? "btn-primary" : "btn-secondary"}`}
              onClick={handleSelectAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 600,
                background: selectedVideoIds.length === filteredVideos.length ? "var(--accent-primary)" : "rgba(139, 92, 246, 0.15)",
                borderColor: selectedVideoIds.length === filteredVideos.length ? "var(--accent-primary)" : "rgba(139, 92, 246, 0.4)",
                color: "#fff"
              }}
              title={selectedVideoIds.length === filteredVideos.length ? "Bỏ chọn toàn bộ video" : "Chọn toàn bộ video trong danh sách"}
            >
              <Icon name="check" size={13} color={selectedVideoIds.length === filteredVideos.length ? "#fff" : "var(--accent-secondary)"} />
              <span>
                {selectedVideoIds.length === filteredVideos.length
                  ? `✓ Bỏ chọn (${filteredVideos.length})`
                  : `Chọn tất cả (${filteredVideos.length})`}
              </span>
            </button>

            <div
              className="marquee-drag-hint-badge"
              title="Mẹo: Nhấn giữ chuột và kéo ngang hoặc quét một vùng qua các video để chọn nhanh (như Windows Explorer). Giữ Shift để chọn thêm, Ctrl để đảo chọn."
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 10px",
                borderRadius: "8px",
                background: "rgba(139, 92, 246, 0.1)",
                border: "1px dashed rgba(139, 92, 246, 0.45)",
                color: "var(--accent-cyan)",
                fontSize: "11.5px",
                fontWeight: 500,
                cursor: "default",
                userSelect: "none"
              }}
            >
              <Icon name="sparkles" size={12} color="var(--accent-cyan)" />
              <span>Kéo chuột quét chọn video</span>
            </div>
          </>
        )}
      </div>
    </div>
  </div>

      {/* 2.5. Dedicated Multi-Select Bulk Actions Bar (Khi tích chọn video) */}
      {selectedVideoIds.length > 0 && (
        <div
          className="batch-actions-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(139, 92, 246, 0.22), rgba(6, 182, 212, 0.18))",
            border: "1px solid rgba(139, 92, 246, 0.5)",
            borderRadius: "12px",
            padding: "10px 16px",
            marginBottom: "18px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
            flexWrap: "wrap",
            gap: "10px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
            >
              <Icon name="check" size={12} color="#fff" />
              <span>Đã chọn: {selectedVideoIds.length} / {filteredVideos.length} video</span>
            </span>

            {/* Nút Chọn nhanh tất cả nếu chưa chọn hết */}
            {selectedVideoIds.length < filteredVideos.length && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSelectAll}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  background: "rgba(139, 92, 246, 0.25)",
                  borderColor: "rgba(139, 92, 246, 0.6)",
                  color: "#fff",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}
                title="Chọn nhanh toàn bộ video còn lại trong danh sách"
              >
                <Icon name="check" size={13} color="var(--accent-secondary)" />
                <span>Chọn tất cả ({filteredVideos.length})</span>
              </button>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedVideoIds([])}
              style={{ fontSize: "12px", padding: "4px 10px" }}
              title="Bỏ chọn tất cả"
            >
              Bỏ chọn
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Nút: Đánh dấu đã sử dụng hàng loạt */}
            {onBatchToggleUsed && !isTrashView && (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onBatchToggleUsed(selectedVideoIds, true)}
                  style={{
                    color: "#10b981",
                    borderColor: "rgba(16, 185, 129, 0.4)",
                    background: "rgba(16, 185, 129, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontWeight: 600
                  }}
                  title="Đánh dấu các video đã chọn là Đã sử dụng"
                >
                  <Icon name="checkCircle" size={14} color="#10b981" />
                  <span>Đã dùng ({selectedVideoIds.length})</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onBatchToggleUsed(selectedVideoIds, false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11.5px"
                  }}
                  title="Bỏ đánh dấu Đã sử dụng cho các video đã chọn"
                >
                  <Icon name="x" size={13} />
                  <span>Bỏ dấu dùng</span>
                </button>
              </>
            )}

            {/* Nút: Đánh dấu đã học làm video CapCut hàng loạt */}
            {onBatchToggleLearned && !isTrashView && (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onBatchToggleLearned(selectedVideoIds, true)}
                  style={{
                    color: "#10b981",
                    borderColor: "rgba(16, 185, 129, 0.4)",
                    background: "rgba(16, 185, 129, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontWeight: 600
                  }}
                  title="Đánh dấu các video đã chọn là Đã xem học làm CapCut"
                >
                  <Icon name="graduationCap" size={14} color="#10b981" />
                  <span>Đã học ({selectedVideoIds.length})</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onBatchToggleLearned(selectedVideoIds, false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11.5px"
                  }}
                  title="Bỏ đánh dấu Đã học làm cho các video đã chọn (chuyển về Chưa học)"
                >
                  <Icon name="x" size={13} />
                  <span>Bỏ dấu học</span>
                </button>
              </>
            )}

            {/* Nút: Lưu vào máy tính (Hỏi chọn ổ đĩa) */}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleOpenExportModal(selectedVideoIds)}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}
              title="Lưu các video đã chọn vào thư mục máy tính (Hỏi chọn ổ đĩa C, D, E...)"
            >
              <Icon name="download" size={14} color="#fff" />
              <span>Lưu Vào Máy Tính...</span>
            </button>

            {/* Nút: Bỏ lưu máy hàng loạt */}
            {onBatchResetSaved && !isTrashView && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const count = selectedVideoIds.filter(id => {
                    const v = videos.find(item => item.id === id);
                    return v && (Boolean(v.is_saved_to_computer) || (v.local_export_count || 0) > 0);
                  }).length;
                  if (count === 0) {
                    alert("Không có video nào trong danh sách chọn đang có thông tin đã lưu máy.");
                    return;
                  }
                  if (confirm(`Bạn có chắc muốn bỏ thông tin hiển thị đã lưu về máy cho ${count} video đã chọn?`)) {
                    onBatchResetSaved(selectedVideoIds);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11.5px",
                  color: "#06b6d4",
                  borderColor: "rgba(6, 182, 212, 0.4)",
                  background: "rgba(6, 182, 212, 0.08)"
                }}
                title="Bỏ thông tin hiển thị đã lưu về máy cho các video đã chọn"
              >
                <Icon name="x" size={13} color="#06b6d4" />
                <span>Bỏ lưu máy</span>
              </button>
            )}

            {/* Chuyển danh mục */}
            <select
              className="form-select"
              style={{ padding: "5px 10px", fontSize: "12px" }}
              onChange={(e) => {
                if (e.target.value) {
                  onBatchMove(selectedVideoIds, e.target.value);
                  e.target.value = "";
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>
                {t("move_category")} ({selectedVideoIds.length})...
              </option>
              {renderCategorySelectOptions(categories, { includeAll: true, allLabel: t("all_unclassified") })}
            </select>

            {!isTrashView && onBatchTrash && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (confirm(`Bạn có chắc muốn chuyển ${selectedVideoIds.length} video đã chọn vào Thùng rác?`)) {
                    onBatchTrash(selectedVideoIds);
                  }
                }}
                style={{
                  color: "#f43f5e",
                  borderColor: "rgba(244, 63, 94, 0.4)",
                  background: "rgba(244, 63, 94, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}
                title="Chuyển tất cả video đã chọn vào Thùng rác"
              >
                <Icon name="trash" size={14} color="#f43f5e" />
                <span>Chuyển Thùng Rác</span>
              </button>
            )}

            {/* Nếu ở Thùng rác: Khôi phục & Xóa vĩnh viễn */}
            {isTrashView && (
              <>
                {onBatchRestore && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onBatchRestore(selectedVideoIds)}
                    style={{
                      color: "var(--accent-green)",
                      borderColor: "rgba(16, 185, 129, 0.4)",
                      background: "rgba(16, 185, 129, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px"
                    }}
                    title="Khôi phục tất cả video đã chọn về kho chính"
                  >
                    <Icon name="check" size={14} color="var(--accent-green)" />
                    <span>Khôi Phục ({selectedVideoIds.length})</span>
                  </button>
                )}

                {onBatchPermanentDelete && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (confirm(`CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn ${selectedVideoIds.length} video khỏi máy tính và Google Drive. Bạn có chắc chắn?`)) {
                        onBatchPermanentDelete(selectedVideoIds);
                      }
                    }}
                    style={{
                      color: "#f43f5e",
                      borderColor: "rgba(244, 63, 94, 0.5)",
                      background: "rgba(244, 63, 94, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px"
                    }}
                    title="Xóa vĩnh viễn khỏi máy tính và Google Drive"
                  >
                    <Icon name="trash" size={14} color="#f43f5e" />
                    <span>Xóa Vĩnh Viễn ({selectedVideoIds.length})</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 3. Main Content: Empty State Hub OR Video Grid */}
      {filteredVideos.length === 0 ? (
        isTrashView ? (
          <div className="vault-empty-state" style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(244, 63, 94, 0.12)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px"
            }}>
              <Icon name="trash" size={30} color="#f43f5e" />
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#fff", margin: "0 0 8px 0" }}>
              {t("trash_empty_state")}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "420px", margin: "0 auto" }}>
              {t("trash_banner_desc")}
            </p>
          </div>
        ) : videos.length > 0 ? (
          <div className="vault-empty-state" style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.12)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px"
            }}>
              <Icon name="folder" size={26} color="var(--accent-secondary)" />
            </div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: "0 0 8px 0" }}>
              Không tìm thấy video nào theo bộ lọc danh mục con
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "440px", margin: "0 auto 16px auto" }}>
              Bạn có thể đã bỏ tích tất cả các danh mục con hoặc kết hợp bộ lọc không có video nào.
            </p>
            {selectedSubcatIds.length < allSubcatIds.length && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setSelectedSubcatIds(allSubcatIds)}
                style={{ gap: "6px" }}
              >
                <Icon name="check" size={13} />
                <span>Tích chọn tất cả mục con ({videos.length} video)</span>
              </button>
            )}
          </div>
        ) : (
          <div className="vault-hub-container">
            {/* Hero Showcase Card */}
            <div className="vault-hero-card">
              <div className="vault-hero-badge">
                <Icon name="sparkles" size={14} color="var(--accent-secondary)" />
                <span>{t("hero_badge")}</span>
              </div>

              <h2 className="vault-hero-title">
                {t("hero_title")}
              </h2>

              <p className="vault-hero-desc">
                {t("hero_desc")}
              </p>

            <div className="vault-hero-actions">
              <button className="btn btn-primary" onClick={() => onOpenDownloader("single")}>
                <Icon name="plus" size={15} color="#fff" />
                <span>{t("open_downloader")}</span>
              </button>
              <button className="btn btn-secondary" onClick={() => onOpenDownloader("drive")}>
                <Icon name="drive" size={16} />
                <span>{t("download_drive_folder")}</span>
              </button>
              <button className="btn btn-secondary" onClick={() => onOpenDownloader("batch")}>
                <Icon name="layers" size={15} />
                <span>{t("download_batch_links")}</span>
              </button>
            </div>
          </div>

          {/* Supported Platforms Grid */}
          <div className="platforms-overview-section">
            <div className="section-mini-heading">{t("supported_platforms_heading")}</div>
            <div className="platforms-cards-grid">
              <div className="platform-feature-card yt" onClick={() => onOpenDownloader("single")}>
                <div className="platform-card-header">
                  <div className="platform-icon-circle yt">
                    <Icon name="youtube" size={18} color="#fff" />
                  </div>
                  <span className="platform-tag">4K & Shorts</span>
                </div>
                <h4>YouTube</h4>
                <p>{t("yt_desc")}</p>
              </div>

              <div className="platform-feature-card tt" onClick={() => onOpenDownloader("single")}>
                <div className="platform-card-header">
                  <div className="platform-icon-circle tt">
                    <Icon name="tiktok" size={18} color="#fff" />
                  </div>
                  <span className="platform-tag">No Watermark</span>
                </div>
                <h4>TikTok</h4>
                <p>{t("tt_desc")}</p>
              </div>

              <div className="platform-feature-card dy" onClick={() => onOpenDownloader("single")}>
                <div className="platform-card-header">
                  <div className="platform-icon-circle dy">
                    <Icon name="tiktok" size={18} color="#fff" />
                  </div>
                  <span className="platform-tag">1080p Source</span>
                </div>
                <h4>Douyin (抖音)</h4>
                <p>{t("dy_desc")}</p>
              </div>

              <div className="platform-feature-card ig" onClick={() => onOpenDownloader("single")}>
                <div className="platform-card-header">
                  <div className="platform-icon-circle ig">
                    <Icon name="instagram" size={18} color="#fff" />
                  </div>
                  <span className="platform-tag">Reels & Post</span>
                </div>
                <h4>Instagram</h4>
                <p>{t("ig_desc")}</p>
              </div>

              <div className="platform-feature-card x" onClick={() => onOpenDownloader("single")}>
                <div className="platform-card-header">
                  <div className="platform-icon-circle x">
                    <Icon name="xTwitter" size={18} color="#fff" />
                  </div>
                  <span className="platform-tag">Full HD</span>
                </div>
                <h4>X / Twitter</h4>
                <p>{t("x_desc")}</p>
              </div>

              <div className="platform-feature-card gd" onClick={() => onOpenDownloader("drive")}>
                <div className="platform-card-header">
                  <div className="platform-icon-circle gd">
                    <Icon name="drive" size={18} />
                  </div>
                  <span className="platform-tag">Folder Sync</span>
                </div>
                <h4>Google Drive</h4>
                <p>{t("gd_desc")}</p>
              </div>
            </div>
          </div>

          {/* 3 Core Workflow Pillars */}
          <div className="workflow-pillars-grid">
            <div className="workflow-pillar-card">
              <div className="pillar-icon-box">
                <Icon name="sparkles" size={20} color="var(--accent-primary)" />
              </div>
              <div className="pillar-content">
                <h4>{t("pillar_1_title")}</h4>
                <p>{t("pillar_1_desc")}</p>
              </div>
            </div>

            <div className="workflow-pillar-card">
              <div className="pillar-icon-box">
                <Icon name="folder" size={20} color="var(--accent-cyan)" />
              </div>
              <div className="pillar-content">
                <h4>{t("pillar_2_title")}</h4>
                <p>{t("pillar_2_desc")}</p>
              </div>
            </div>

            <div className="workflow-pillar-card">
              <div className="pillar-icon-box">
                <Icon name="calendar" size={20} color="var(--accent-green)" />
              </div>
              <div className="pillar-content">
                <h4>{t("pillar_3_title")}</h4>
                <p>{t("pillar_3_desc")}</p>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div
          className="video-grid"
          ref={gridContainerRef}
          onMouseDown={handleGridMouseDown}
        >
          {displayedVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              categoryTag={getCategoryTag(video)}
              onSelectCategory={onSelectCategory}
              isSelected={selectedVideoIds.includes(video.id)}
              isTrashView={isTrashView}
              scheduledVideoIds={scheduledVideoIds}
              calendarEvents={calendarEvents}
              getThumbnailSrc={getThumbnailSrc}
              formatDuration={formatDuration}
              toggleSelectVideo={toggleSelectVideo}
              onSelectVideoForDetail={(v) => onSelectVideoForDetail && onSelectVideoForDetail(v, filteredVideos)}
              onOpenScheduleModal={onOpenScheduleModal}
              onDeleteVideo={onDeleteVideo}
              onToggleVideoUsed={onToggleVideoUsed}
              onToggleVideoLearned={onToggleVideoLearned}
              onOpenAudioStudio={onOpenAudioStudio}
              handleOpenExportModal={handleOpenExportModal}
              onRestoreVideo={onRestoreVideo}
              onPermanentDeleteVideo={onPermanentDeleteVideo}
              onResetVideoSaved={onResetVideoSaved}
              t={t}
            />
          ))}

          {/* Thanh Điều Hướng Phân Trang Trực Quan & Chuyển Trang Siêu Mượt */}
          {filteredVideos.length > 0 && (
            <div
              className="vault-pagination-bar"
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                marginTop: "16px",
                background: "rgba(18, 20, 34, 0.75)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(139, 92, 246, 0.25)",
                borderRadius: "12px",
                flexWrap: "wrap",
                gap: "12px"
              }}
            >
              {/* Thống kê số lượng trang & video */}
              <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="grid" size={14} color="var(--accent-primary)" />
                {pageSize === "all" ? (
                  <span>Đang hiển thị toàn bộ <strong>{filteredVideos.length}</strong> video</span>
                ) : (
                  <span>
                    Hiển thị <strong>{(safePage - 1) * pageSize + 1} - {Math.min(safePage * pageSize, filteredVideos.length)}</strong> trên tổng số <strong>{filteredVideos.length}</strong> video &bull; <strong style={{ color: "var(--accent-primary)" }}>Trang {safePage}/{totalPages}</strong>
                  </span>
                )}
              </div>

              {/* Các nút chuyển trang */}
              {pageSize !== "all" && totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={safePage <= 1}
                    onClick={() => handlePageChange(1)}
                    title="Về trang đầu tiên"
                    style={{ padding: "4px 8px", fontSize: "11.5px", opacity: safePage <= 1 ? 0.4 : 1 }}
                  >
                    « Đầu
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={safePage <= 1}
                    onClick={() => handlePageChange(safePage - 1)}
                    title="Về trang trước"
                    style={{ padding: "4px 10px", fontSize: "11.5px", opacity: safePage <= 1 ? 0.4 : 1 }}
                  >
                    ‹ Trước
                  </button>

                  {/* Danh sách các số trang */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1];
                      return (
                        <React.Fragment key={p}>
                          {prev && p - prev > 1 && (
                            <span style={{ padding: "0 4px", color: "var(--text-muted)", fontSize: "12px" }}>...</span>
                          )}
                          <button
                            className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => handlePageChange(p)}
                            style={{
                              padding: "4px 11px",
                              fontSize: "12px",
                              minWidth: "32px",
                              fontWeight: p === safePage ? 700 : 500,
                              background: p === safePage ? "var(--accent-primary)" : undefined,
                              borderColor: p === safePage ? "var(--accent-primary)" : undefined
                            }}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={safePage >= totalPages}
                    onClick={() => handlePageChange(safePage + 1)}
                    title="Sang trang tiếp theo"
                    style={{ padding: "4px 10px", fontSize: "11.5px", opacity: safePage >= totalPages ? 0.4 : 1 }}
                  >
                    Sau ›
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={safePage >= totalPages}
                    onClick={() => handlePageChange(totalPages)}
                    title="Đến trang cuối cùng"
                    style={{ padding: "4px 8px", fontSize: "11.5px", opacity: safePage >= totalPages ? 0.4 : 1 }}
                  >
                    Cuối »
                  </button>

                  {/* Nhập số trang muốn nhảy tới */}
                  <form
                    onSubmit={handleJumpToPage}
                    style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "8px" }}
                  >
                    <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Đến trang:</span>
                    <input
                      type="number"
                      min="1"
                      max={totalPages}
                      placeholder={String(safePage)}
                      value={jumpPage}
                      onChange={(e) => setJumpPage(e.target.value)}
                      style={{
                        width: "44px",
                        padding: "3px 4px",
                        fontSize: "11px",
                        height: "25px",
                        borderRadius: "5px",
                        border: "1px solid var(--border-color)",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "#fff",
                        textAlign: "center"
                      }}
                      title="Nhập số trang cần chuyển đến"
                    />
                    <button
                      type="submit"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: "2px 7px", fontSize: "11px", height: "25px" }}
                      title="Chuyển đến trang này"
                    >
                      Đi
                    </button>
                  </form>
                </div>
              )}

              {/* Tùy chọn số video mỗi trang: 17 | 30 | 50 | Tất cả | Nhập số trang */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                <span>Xem mỗi trang:</span>
                {[17, 30, 50, "all"].map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`btn btn-sm ${pageSize === size ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => handlePageSizeChange(size)}
                    style={{
                      padding: "3px 9px",
                      fontSize: "11px",
                      fontWeight: pageSize === size ? 700 : 500
                    }}
                  >
                    {size === "all" ? "Tất cả" : size}
                  </button>
                ))}

                {/* Nếu đang dùng số tùy chỉnh không thuộc preset */}
                {typeof pageSize === "number" && ![17, 30, 50].includes(pageSize) && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{
                      padding: "3px 9px",
                      fontSize: "11px",
                      fontWeight: 700
                    }}
                  >
                    {pageSize} (Tùy chỉnh)
                  </button>
                )}

                {/* Form Nhập số trang / số lượng tùy chỉnh */}
                <form
                  onSubmit={handleApplyCustomPageSize}
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="Nhập số..."
                    value={customPageSize}
                    onChange={(e) => setCustomPageSize(e.target.value)}
                    style={{
                      width: "68px",
                      padding: "3px 6px",
                      fontSize: "11px",
                      height: "25px",
                      borderRadius: "5px",
                      border: "1px solid var(--border-color)",
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "#fff",
                      textAlign: "center"
                    }}
                    title="Nhập số lượng video muốn hiển thị trên mỗi trang"
                  />
                  <button
                    type="submit"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "2px 8px", fontSize: "11px", height: "25px" }}
                    title="Áp dụng số lượng hiển thị"
                  >
                    Áp dụng
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Lưu Video Vào Thư Mục Máy Tính (Hỏi chọn ổ đĩa) - Fallback nếu không truyền onOpenExportModal */}
      {!onOpenExportModal && (
        <ExportFolderModal
          isOpen={isExportFolderOpen}
          onClose={() => setIsExportFolderOpen(false)}
          videoIds={exportVideoIds}
          videos={videos}
        />
      )}
      {/* Windows Explorer Style Marquee Drag-Selection Box */}
      <div
        ref={marqueeRef}
        className="marquee-selection-box"
      >
        <div
          ref={marqueeCountBadgeRef}
          className="marquee-selection-badge"
        />
      </div>
    </div>
  );
}
