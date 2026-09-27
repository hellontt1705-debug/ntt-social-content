import React, { memo } from "react";
import { Icon } from "./Icons";
import LazyThumbnail from "./LazyThumbnail";

/**
 * VideoCard - Memoized video card component for MediaVault grid.
 * Prevents unnecessary re-renders when parent state changes but card data hasn't.
 */
const VideoCard = memo(function VideoCard({
  video,
  isSelected,
  isTrashView,
  scheduledVideoIds,
  calendarEvents,
  getThumbnailSrc,
  formatDuration,
  toggleSelectVideo,
  onSelectVideoForDetail,
  onOpenScheduleModal,
  onDeleteVideo,
  onToggleVideoUsed,
  onOpenAudioStudio,
  handleOpenExportModal,
  onRestoreVideo,
  onPermanentDeleteVideo,
  onResetVideoSaved,
  t
}) {
  const scheduledEv = scheduledVideoIds.has(video.id)
    ? (calendarEvents || []).find((ev) => ev.video_id === video.id)
    : null;
  const isScheduled = Boolean(scheduledEv);
  const hasUsed = Boolean(video.is_used);
  const hasSaved = Boolean(video.is_saved_to_computer) || (video.local_export_count || 0) > 0;

  // Pre-compute badge positions
  let badgeTop = 25;
  const usedBadgeTop = badgeTop;
  if (hasUsed) badgeTop += 22;
  const savedBadgeTop = badgeTop;
  if (hasSaved) badgeTop += 22;
  const scheduledBadgeTop = badgeTop;

  return (
    <div
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
        <LazyThumbnail
          src={getThumbnailSrc(video)}
          alt={video.title}
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
          <span>{video.platform === "drive" ? "GDRIVE" : video.platform === "x" ? "X / Twitter" : video.platform?.toUpperCase() || "VIDEO"}</span>
        </div>

        {/* Badges on Thumbnail */}
        {/* 1. Already Used Badge */}
        {hasUsed && (
          <div
            className="video-used-badge"
            style={{
              position: "absolute",
              top: `${usedBadgeTop}px`,
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

        {/* 2. Saved to Computer Badge */}
        {hasSaved && (
          <div
            className="video-saved-computer-badge"
            style={{
              position: "absolute",
              top: `${savedBadgeTop}px`,
              left: "5px",
              zIndex: 4,
              background: "linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)",
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
            title={`Đã lưu vào máy tính ${video.local_export_count || 1} lần${video.last_export_folder ? ` • Thư mục: ${video.last_export_folder}` : ""}${video.last_exported_at ? ` • Lúc: ${new Date(video.last_exported_at).toLocaleString()}` : ""}`}
          >
            <Icon name="download" size={10} color="#fff" />
            <span>ĐÃ LƯU MÁY {video.local_export_count > 1 ? `(x${video.local_export_count})` : ""}</span>
          </div>
        )}

        {/* 3. Scheduled Badge */}
        {isScheduled && (
          <div
            className="video-scheduled-badge"
            style={{
              position: "absolute",
              top: `${scheduledBadgeTop}px`,
              left: "5px",
              zIndex: 4,
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
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
            title={`Đã lên lịch đăng lúc: ${scheduledEv?.scheduled_date} ${scheduledEv?.scheduled_time || ""}`}
          >
            <Icon name="calendar" size={10} color="#fff" />
            <span>ĐÃ LÊN LỊCH</span>
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

        {/* Note: Video đã lên lịch đăng */}
        {isScheduled && scheduledEv && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              fontWeight: 600,
              color: "#c084fc",
              background: "rgba(139, 92, 246, 0.08)",
              border: "1px solid rgba(139, 92, 246, 0.25)",
              borderRadius: "5px",
              padding: "3px 7px",
              marginTop: "4px",
              marginBottom: "4px"
            }}
            title={`Lịch xuất bản: ${scheduledEv.scheduled_date} ${scheduledEv.scheduled_time || ""}`}
          >
            <Icon name="calendar" size={12} color="#c084fc" />
            <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
              Đã lên lịch: {scheduledEv.scheduled_date} {scheduledEv.scheduled_time || ""}
            </span>
          </div>
        )}

        {/* Saved to computer info */}
        {hasSaved && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "5px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--accent-cyan)",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              borderRadius: "5px",
              padding: "3px 7px",
              marginTop: "4px",
              marginBottom: "4px"
            }}
            title={video.last_export_folder ? `Thư mục gần nhất: ${video.last_export_folder}` : undefined}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, overflow: "hidden" }}>
              <Icon name="folder" size={12} color="var(--accent-cyan)" />
              <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                Đã lưu vào máy ({video.local_export_count || 1} lượt tải)
              </span>
            </div>
            {onResetVideoSaved && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Bỏ thông tin hiển thị đã lưu máy cho video này?")) {
                    onResetVideoSaved(video.id);
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(6, 182, 212, 0.7)",
                  cursor: "pointer",
                  padding: "0 2px",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0
                }}
                title="Bỏ thông tin hiển thị lưu máy (Reset lượt tải)"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        )}

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
                  className={`icon-btn ${scheduledVideoIds.has(video.id) ? "active" : ""}`}
                  title={
                    scheduledVideoIds.has(video.id)
                      ? "Đã lên lịch đăng. Bấm để xem hoặc đổi lịch."
                      : t("schedule_post")
                  }
                  onClick={() => onOpenScheduleModal(video)}
                  style={{
                    color: scheduledVideoIds.has(video.id) ? "#c084fc" : undefined,
                    background: scheduledVideoIds.has(video.id) ? "rgba(139, 92, 246, 0.15)" : undefined,
                    borderRadius: "4px"
                  }}
                >
                  <Icon name="calendar" size={13} color={scheduledVideoIds.has(video.id) ? "#c084fc" : "currentColor"} />
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
                  title={
                    (video.local_export_count || 0) > 0
                      ? `Đã lưu vào máy ${video.local_export_count} lần. Bấm để tải/lưu tiếp vào thư mục khác.`
                      : video.media_type === "image"
                      ? "Tải ảnh này về thư mục máy tính"
                      : "Tải video này về thư mục máy tính"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenExportModal([video.id]);
                  }}
                  style={{
                    position: "relative",
                    color: (video.local_export_count || 0) > 0 ? "var(--accent-cyan)" : undefined,
                    background: (video.local_export_count || 0) > 0 ? "rgba(6, 182, 212, 0.15)" : undefined,
                    borderRadius: "4px"
                  }}
                >
                  <Icon name="download" size={13} color="var(--accent-cyan)" />
                  {(video.local_export_count || 0) > 1 && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-5px",
                        right: "-5px",
                        background: "var(--accent-cyan)",
                        color: "#000",
                        fontSize: "9px",
                        fontWeight: 800,
                        borderRadius: "8px",
                        padding: "0 3px",
                        lineHeight: "12px",
                        minWidth: "12px",
                        textAlign: "center"
                      }}
                    >
                      {video.local_export_count}
                    </span>
                  )}
                </button>

                {/* 5. Mở VD gốc */}
                {video.source_url && (
                  <a
                    href={video.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="icon-btn"
                    title={`Mở VD gốc (${video.source_url})`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: "var(--accent-cyan)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none"
                    }}
                  >
                    <Icon name="externalLink" size={13} />
                  </a>
                )}

                {/* 6. Chuyển thùng rác */}
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
});

export default VideoCard;
