import React, { useState } from "react";
import { Icon } from "./Icons";
import { MEDIA_BASE, openDownloadsFolder } from "../api";
import { useLanguage } from "../i18n";
import ExportFolderModal from "./ExportFolderModal";
import CategoryLockScreen from "./CategoryLockScreen";
import { extractCleanUrl, extractBatchUrls } from "../utils/urlHelper";

export default function MediaVault({
  videos,
  categories,
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
  onBatchToggleUsed
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

  const handleOpenExportModal = (ids) => {
    setExportVideoIds(ids);
    setIsExportFolderOpen(true);
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

  const filteredVideos = videos.filter((v) => {
    if (platformFilter !== "all" && v.platform !== platformFilter) return false;
    if (usedFilter === "used" && !v.is_used) return false;
    if (usedFilter === "unused" && Boolean(v.is_used)) return false;
    if (mediaTypeFilter === "video" && v.media_type === "image") return false;
    if (mediaTypeFilter === "image" && v.media_type !== "image") return false;
    return true;
  });

  const totalCount = videos.length;
  const usedCount = videos.filter((v) => Boolean(v.is_used)).length;
  const unusedCount = totalCount - usedCount;
  const videoCount = videos.filter((v) => v.media_type !== "image").length;
  const imageCount = videos.filter((v) => v.media_type === "image").length;

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


  const formatDuration = (sec) => {
    if (!sec) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getThumbnailSrc = (video) => {
    if (video.local_thumbnail) {
      const filename = video.local_thumbnail.split(/[\\/]/).pop();
      return `${MEDIA_BASE}/thumbnails/${filename}`;
    }
    if (video.thumbnail_url && !video.thumbnail_url.includes("googleusercontent.com/d/")) return video.thumbnail_url;
    if (video.drive_file_id) return `/api/drive/thumbnail/${video.drive_file_id}`;
    return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80";
  };

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

  const activeCatObj = categories.find((c) => c.id === selectedCategory);
  const isCurrentCategoryLocked = !isTrashView && selectedCategory !== "all" && Boolean(activeCatObj?.is_locked) && !unlockedCategoryIds?.[selectedCategory];
  const isRemembered = Boolean(activeCatObj && localStorage.getItem(`remember_cat_${activeCatObj.id}`) === "true");

  if (isCurrentCategoryLocked) {
    return (
      <div className="view-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
        <CategoryLockScreen
          category={activeCatObj}
          onUnlock={(pass, remember) => onUnlockCategory(activeCatObj.id, pass, remember)}
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
            <option value="all">{t("all_unclassified")}</option>
            {categories.filter((c) => c.id !== "all").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.is_locked ? "🔒" : ""}
              </option>
            ))}
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

      {/* 2. Top Controls & Filter Pills */}
      <div className="vault-header">
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

        {/* Lọc Trạng Thái Sử Dụng: Tất cả / Chưa dùng / Đã dùng */}
        <div className="vault-used-filter-pills" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
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
            <span>{isCleaningDisk ? "Đang dọn..." : "Giải Phóng Ổ Cứng"}</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleOpenFolder}
            disabled={isOpeningFolder}
            title="Mở thư mục video trên máy tính (Windows Explorer)"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Icon name="folder" size={14} color="var(--accent-cyan)" />
            <span>{isOpeningFolder ? "Đang mở..." : "Mở Thư Mục Máy Tính"}</span>
          </button>

          <span className="vault-count-tag">
            {filteredVideos.length} {t("video_unit")}
          </span>

          {filteredVideos.length > 0 && (
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
          )}
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
              <option value="all">{t("all_unclassified")}</option>
              {categories.filter((c) => c.id !== "all").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_locked ? "🔒" : ""}
                </option>
              ))}
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
        <div className="video-grid">
          {filteredVideos.map((video) => {
            const isSelected = selectedVideoIds.includes(video.id);

            return (
              <div
                key={video.id}
                className={`video-card ${video.is_used ? "is-used" : ""}`}
                style={{
                  borderColor: video.is_used ? "rgba(16, 185, 129, 0.45)" : undefined,
                  boxShadow: video.is_used ? "0 0 10px rgba(16, 185, 129, 0.12)" : undefined
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", video.id);
                  e.dataTransfer.setData("videoId", video.id);
                }}
                onClick={() => onSelectVideoForDetail(video)}
              >
                {/* Thumbnail Container */}
                <div className="video-thumb-container">
                  <img
                    src={getThumbnailSrc(video)}
                    alt={video.title}
                    className="video-thumb"
                    loading="lazy"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80";
                    }}
                  />

                  {/* Multi-select checkbox */}
                  <div
                    className={`video-checkbox ${isSelected ? "checked" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectVideo(video.id);
                    }}
                  >
                    {isSelected && <Icon name="check" size={13} color="#fff" />}
                  </div>

                  {/* Platform Badge */}
                  <div className={`video-platform-badge platform-${video.platform || "other"}`}>
                    <Icon
                      name={
                        video.platform === "douyin"
                          ? "tiktok"
                          : video.platform === "x"
                          ? "xTwitter"
                          : video.platform === "drive"
                          ? "drive"
                          : video.platform || "folder"
                      }
                      size={12}
                      color="#fff"
                    />
                    <span>{video.platform === "drive" ? "GDRIVE" : video.platform?.toUpperCase() || "VIDEO"}</span>
                  </div>

                  {/* Already Used Badge */}
                  {Boolean(video.is_used) && (
                    <div
                      className="video-used-badge"
                      style={{
                        position: "absolute",
                        top: "25px",
                        left: "5px",
                        zIndex: 4,
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "#fff",
                        fontSize: "9px",
                        fontWeight: 800,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
                        border: "1px solid rgba(255, 255, 255, 0.35)",
                        letterSpacing: "0.03em"
                      }}
                      title="Video này đã được sử dụng"
                    >
                      <Icon name="checkCircle" size={11} color="#fff" />
                      <span>ĐÃ DÙNG</span>
                    </div>
                  )}

                  {/* Duration or Image Badge */}
                  {video.media_type === "image" ? (
                    <div
                      className="video-duration-badge"
                      style={{
                        background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                        color: "#fff",
                        fontWeight: 700,
                        letterSpacing: "0.03em"
                      }}
                    >
                      ẢNH HD
                    </div>
                  ) : video.duration > 0 ? (
                    <div className="video-duration-badge">
                      {formatDuration(video.duration)}
                    </div>
                  ) : null}

                  {/* Drive synced indicator */}
                  {video.drive_synced === 1 && (
                    <div className="video-drive-indicator" title="Google Drive">
                      <Icon name="cloud" size={12} color="#fff" />
                      <span>Drive</span>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="video-card-body">
                  <h4 className="video-title" title={video.title}>
                    {video.title || t("no_title")}
                  </h4>

                  <div className="video-uploader">
                    <span className="uploader-name">{t("author_prefix")}{video.uploader || "creator"}</span>
                    {video.quality && (
                      <span className="quality-pill">{video.quality}</span>
                    )}
                  </div>

                  {/* Hashtags list */}
                  {video.hashtags && video.hashtags.length > 0 && (
                    <div className="video-tags">
                      {video.hashtags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="video-tag">
                          #{tag.replace(/^#/, "")}
                        </span>
                      ))}
                      {video.hashtags.length > 3 && (
                        <span className="video-tag more-tag">
                          +{video.hashtags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Card Footer Actions */}
                  <div className="video-card-footer" onClick={(e) => e.stopPropagation()}>
                    {isTrashView ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{
                            color: "var(--accent-green)",
                            borderColor: "rgba(16, 185, 129, 0.4)",
                            background: "rgba(16, 185, 129, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            flex: 1,
                            justifyContent: "center"
                          }}
                          title={t("restore_video")}
                          onClick={() => onRestoreVideo && onRestoreVideo(video.id)}
                        >
                          <Icon name="check" size={13} color="var(--accent-green)" />
                          <span>{t("restore_video")}</span>
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          style={{
                            color: "#f43f5e",
                            borderColor: "rgba(244, 63, 94, 0.4)",
                            background: "rgba(244, 63, 94, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            flex: 1,
                            justifyContent: "center"
                          }}
                          title={t("permanent_delete")}
                          onClick={() => {
                            if (confirm(t("permanent_delete_confirm"))) {
                              if (onPermanentDeleteVideo) onPermanentDeleteVideo(video.id);
                            }
                          }}
                        >
                          <Icon name="trash" size={13} color="#f43f5e" />
                          <span>{t("permanent_delete")}</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectVideoForDetail(video)}
                          style={{ padding: "3px 7px", fontSize: "11px", gap: "4px" }}
                        >
                          <Icon name="play" size={11} color="var(--accent-primary)" />
                          <span>{t("view_details")}</span>
                        </button>

                        <div className="video-actions">
                          {/* 1. Đánh dấu đã sử dụng */}
                          <button
                            className={`icon-btn ${video.is_used ? "active" : ""}`}
                            title={video.is_used ? "Đã sử dụng (Bấm để bỏ đánh dấu)" : "Đánh dấu video này đã sử dụng"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onToggleVideoUsed) onToggleVideoUsed(video.id);
                            }}
                            style={{
                              color: video.is_used ? "#10b981" : undefined,
                              background: video.is_used ? "rgba(16, 185, 129, 0.15)" : undefined,
                              borderRadius: "4px"
                            }}
                          >
                            <Icon name={video.is_used ? "checkCircle" : "bookmarkCheck"} size={13} color={video.is_used ? "#10b981" : "currentColor"} />
                          </button>

                          {/* 2. Lên lịch */}
                          <button
                            className="icon-btn"
                            title={t("schedule_post")}
                            onClick={() => onOpenScheduleModal(video)}
                          >
                            <Icon name="calendar" size={13} />
                          </button>

                          {/* 3. Studio Âm Thanh (Chỉ áp dụng cho video) */}
                          {video.media_type !== "image" && (
                            <button
                              className="icon-btn"
                              title="Studio Âm Thanh (Tách nhạc MP3 / Tăng giảm âm lượng)"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenAudioStudio) onOpenAudioStudio(video);
                              }}
                            >
                              <Icon name="music" size={13} color="#a855f7" />
                            </button>
                          )}

                          {/* 4. Tải về máy */}
                          <button
                            className="icon-btn"
                            title={video.media_type === "image" ? "Tải ảnh này về thư mục máy tính" : "Tải video này về thư mục máy tính"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenExportModal([video.id]);
                            }}
                          >
                            <Icon name="download" size={13} color="var(--accent-cyan)" />
                          </button>

                          {/* 5. Chuyển thùng rác */}
                          <button
                            className="icon-btn danger"
                            title={t("move_to_trash")}
                            onClick={() => {
                              if (confirm(t("soft_delete_confirm"))) {
                                onDeleteVideo(video.id);
                              }
                            }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Lưu Video Vào Thư Mục Máy Tính (Hỏi chọn ổ đĩa) */}
      <ExportFolderModal
        isOpen={isExportFolderOpen}
        onClose={() => setIsExportFolderOpen(false)}
        videoIds={exportVideoIds}
        videos={videos}
      />
    </div>
  );
}
