import React, { useState, useRef } from "react";
import { Icon } from "../Icons";
import { MEDIA_BASE } from "../../api";
import { STATUS_CONFIG, PLATFORM_CONFIG, normalizeStatus, formatDuration, formatFileSize } from "./PlannerConstants";

export default function ScheduleDetailPanel({
  event,
  video,
  onClose,
  onEdit,
  onCreate,
  onConfirmPublished,
  onReschedule,
  onOpenExportModal,
  onDelete,
  onSelectVideoForDetail
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDriveIframe, setShowDriveIframe] = useState(false);
  const videoRef = useRef(null);

  if (!event) {
    return (
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "12px",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          textAlign: "center",
          height: "100%",
          boxSizing: "border-box",
          gap: "6px"
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.03)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "6px",
            color: "var(--text-muted)"
          }}
        >
          <Icon name="calendar" size={24} />
        </div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
          Chưa chọn lịch đăng nào
        </div>
        <div style={{ fontSize: "11px", maxWidth: "220px", lineHeight: "1.4" }}>
          Nhấp vào một video trên lịch để xem chi tiết và thao tác, hoặc bấm nút dưới để tạo mới
        </div>
        {onCreate && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCreate}
            style={{
              marginTop: "10px",
              padding: "6px 16px",
              fontSize: "11.5px",
              fontWeight: 600,
              borderRadius: "8px",
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              boxShadow: "0 2px 10px rgba(139, 92, 246, 0.35)",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <Icon name="plus" size={13} color="#fff" />
            <span>+ Lên Lịch Video</span>
          </button>
        )}
      </div>
    );
  }

  const statusObj = normalizeStatus(event);
  const platforms = Array.isArray(event.platforms) ? event.platforms : [event.platform || "tiktok"];
  const isPublished = statusObj.id === "PUBLISHED_MANUALLY";

  // Resolve thumbnail and media url
  const getThumbnailSrc = () => {
    const directUrl = video?.thumbnail_url || event?.thumbnail_url;
    if (directUrl && (directUrl.startsWith("http://") || directUrl.startsWith("https://")) && !directUrl.includes("googleusercontent.com")) {
      return directUrl;
    }
    const videoId = video?.id || event.video_id;
    if (event.local_thumbnail) {
      const filename = event.local_thumbnail.split(/[\\/]/).pop();
      return `${MEDIA_BASE}/thumbnails/${filename}`;
    }
    if (video?.local_thumbnail) {
      const filename = video.local_thumbnail.split(/[\\/]/).pop();
      return `${MEDIA_BASE}/thumbnails/${filename}`;
    }
    const driveId = video?.drive_file_id || event.drive_file_id;
    if (driveId) return `/api/drive/thumbnail/${driveId}`;
    if (videoId) return `/api/videos/${videoId}/thumbnail`;
    return "/placeholder.png";
  };

  const filename = (video?.file_path || event.file_path) ? (video?.file_path || event.file_path).split(/[\\/]/).pop() : "";
  const videoStreamUrl = filename ? `${MEDIA_BASE}/${filename}` : (video?.video_url || event.video_url || "");
  const driveFileId = video?.drive_file_id || event.drive_file_id;

  // Extract caption & notes
  let parsedNotes = {};
  if (typeof event.notes === "string" && event.notes.startsWith("{")) {
    try {
      parsedNotes = JSON.parse(event.notes);
    } catch (e) {}
  }
  const caption = event.caption || parsedNotes.caption || event.title || "";
  const hashtags = event.hashtags || parsedNotes.hashtags || "";
  const timezone = event.timezone || parsedNotes.timezone || "(UTC+7) Asia/Ho_Chi_Minh";
  const publishedAt = event.published_at || parsedNotes.published_at || null;
  const publishedUrl = event.published_url || parsedNotes.published_url || null;

  // Resolve video object for modal detail
  const resolvedVideo = video || (event?.video_id ? {
    id: event.video_id,
    title: event.title,
    file_path: event.file_path,
    video_url: event.video_url,
    thumbnail_url: event.thumbnail_url,
    local_thumbnail: event.local_thumbnail,
    drive_file_id: event.drive_file_id,
    source_url: event.source_url || parsedNotes?.source_url || "",
    uploader: event.creator || "Cynex"
  } : null);

  const sourceUrl = video?.source_url || event?.source_url || parsedNotes?.source_url || "";

  const handleOpenVideoDetail = (e) => {
    if (e) e.stopPropagation();
    if (onSelectVideoForDetail && resolvedVideo) {
      onSelectVideoForDetail(resolvedVideo);
    } else if (sourceUrl) {
      window.open(sourceUrl, "_blank", "noreferrer");
    }
  };

  return (
    <div
      style={{
        background: "#0c101b",
        border: "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius: "12px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        height: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)"
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "13.5px", fontWeight: 700, color: "#fff" }}>
          Chi tiết lịch đăng
        </h4>
        {onClose && (
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            style={{ width: "24px", height: "24px" }}
            title="Đóng"
          >
            <Icon name="x" size={13} />
          </button>
        )}
      </div>

      {/* Video Preview / Player with Center Play Button */}
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: "150px",
          maxHeight: "190px",
          borderRadius: "10px",
          overflow: "hidden",
          background: "#000",
          boxShadow: "0 3px 10px rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {/* Nút xem chi tiết video ở góc trên bên phải */}
        {resolvedVideo && onSelectVideoForDetail && (
          <button
            type="button"
            onClick={handleOpenVideoDetail}
            title="Mở xem video và chi tiết đầy đủ trong cửa sổ lớn"
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              zIndex: 12,
              background: "rgba(0, 0, 0, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              borderRadius: "6px",
              padding: "3px 8px",
              color: "#fff",
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              backdropFilter: "blur(6px)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)"
            }}
          >
            <Icon name="externalLink" size={11} color="#38bdf8" />
            <span>Chi tiết video</span>
          </button>
        )}

        {videoStreamUrl ? (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <video
              ref={videoRef}
              src={videoStreamUrl}
              poster={getThumbnailSrc()}
              controls={isPlaying}
              playsInline
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: "#000",
                display: "block"
              }}
            />

            {!isPlaying && (
              <div
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.play();
                    setIsPlaying(true);
                  }
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0, 0, 0, 0.3)",
                  cursor: "pointer"
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    boxShadow: "0 0 20px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    border: "2px solid rgba(255, 255, 255, 0.9)",
                    transition: "all 0.2s ease"
                  }}
                  title="Bấm để phát video"
                >
                  <Icon name="play" size={18} color="#fff" style={{ marginLeft: "2px" }} />
                </div>
              </div>
            )}
          </div>
        ) : driveFileId ? (
          <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
            {showDriveIframe ? (
              <>
                <iframe
                  src={`https://drive.google.com/file/d/${driveFileId}/preview?autoplay=1`}
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  allow="autoplay"
                  title={event.title}
                />
                <button
                  type="button"
                  onClick={() => setShowDriveIframe(false)}
                  style={{
                    position: "absolute",
                    top: "6px",
                    left: "6px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "rgba(0, 0, 0, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    color: "#fff",
                    fontSize: "9.5px",
                    cursor: "pointer",
                    zIndex: 10
                  }}
                >
                  ✕ Đóng
                </button>
              </>
            ) : (
              <div
                style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer" }}
                onClick={() => {
                  if (onSelectVideoForDetail && resolvedVideo) {
                    handleOpenVideoDetail();
                  } else {
                    setShowDriveIframe(true);
                  }
                }}
              >
                <img
                  src={getThumbnailSrc()}
                  alt={event.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "/placeholder.png";
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                      boxShadow: "0 0 20px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      border: "2px solid rgba(255, 255, 255, 0.9)"
                    }}
                    title="Bấm để xem video"
                  >
                    <Icon name="play" size={18} color="#fff" style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer" }}
            onClick={handleOpenVideoDetail}
            title="Bấm để xem chi tiết video"
          >
            <img
              src={getThumbnailSrc()}
              alt={event.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder.png";
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0, 0, 0, 0.25)"
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  boxShadow: "0 0 20px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  border: "2px solid rgba(255, 255, 255, 0.9)"
                }}
                title="Bấm để xem video"
              >
                <Icon name="play" size={18} color="#fff" style={{ marginLeft: "2px" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Video Title & File info */}
      <div>
        <div style={{ fontWeight: 700, fontSize: "12.5px", color: "#fff", lineHeight: 1.3 }}>
          {event.title || "Video chưa có tiêu đề"}
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {filename || "media_file.mp4"}
        </div>
        {sourceUrl && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px", fontSize: "11px" }}>
            <span style={{ color: "var(--text-muted)" }}>VD gốc:</span>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent-cyan)", display: "inline-flex", alignItems: "center", gap: "3px", textDecoration: "none" }}
              title={`Mở VD gốc: ${sourceUrl}`}
            >
              <span>Mở link gốc</span>
              <Icon name="externalLink" size={11} />
            </a>
          </div>
        )}
        {(video?.is_saved_to_computer || (video?.local_export_count || 0) > 0) && (
          <div
            style={{
              marginTop: "6px",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              borderRadius: "6px",
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "10.5px",
              color: "#38bdf8"
            }}
          >
            <Icon name="check" size={12} color="#38bdf8" />
            <span>
              Đã lưu vào máy{video.local_export_count > 1 ? ` (${video.local_export_count} lượt tải)` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Metadata Specs */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          paddingTop: "8px",
          fontSize: "11px"
        }}
      >
        {/* Nền tảng */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="globe" size={13} color="#38bdf8" />
            <span>Nền tảng</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {platforms.map((p) => {
              const cfg = PLATFORM_CONFIG[p] || { label: p, color: "#fff" };
              return (
                <span
                  key={p}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "4px",
                    padding: "1px 6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: cfg.color
                  }}
                >
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Thời gian dự kiến */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="calendar" size={13} color="#c084fc" />
            <span>Thời gian dự kiến</span>
          </span>
          <span style={{ color: "#fff", fontWeight: 600 }}>
            {event.scheduled_date} {event.scheduled_time || "19:00"}
          </span>
        </div>

        {/* Thời gian thực tế */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="clock" size={13} color="#34d399" />
            <span>Thời gian thực tế</span>
          </span>
          <span style={{ color: publishedAt ? "#34d399" : "var(--text-muted)", fontWeight: publishedAt ? 600 : 400 }}>
            {publishedAt ? new Date(publishedAt).toLocaleString("vi-VN") : "Chưa cập nhật"}
          </span>
        </div>

        {/* Múi giờ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="globe" size={13} color="#a78bfa" />
            <span>Múi giờ</span>
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "10.5px" }}>
            {timezone}
          </span>
        </div>

        {/* Trạng thái */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="sparkles" size={13} color={statusObj.color} />
            <span>Trạng thái</span>
          </span>
          <span
            style={{
              background: statusObj.bg,
              border: `1px solid ${statusObj.border}`,
              color: statusObj.color,
              padding: "1px 6px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 700
            }}
          >
            {statusObj.badge} {statusObj.label}
          </span>
        </div>

        {/* Người tạo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="user" size={13} color="#38bdf8" />
            <span>Người tạo</span>
          </span>
          <span style={{ color: "#fff", fontWeight: 600 }}>
            {event.creator || "Cynex"}
          </span>
        </div>
      </div>

      {/* Caption & Hashtag */}
      <div
        style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          paddingTop: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "4px"
        }}
      >
        <div style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
          Nội dung bài đăng
        </div>
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "6px",
            padding: "8px",
            fontSize: "11px",
            color: "#fff",
            lineHeight: 1.4,
            maxHeight: "80px",
            overflowY: "auto",
            whiteSpace: "pre-wrap"
          }}
        >
          {caption || "Chưa có caption"}
        </div>
        {hashtags && (
          <div style={{ fontSize: "10.5px", color: "#38bdf8", fontWeight: 500, marginTop: "2px" }}>
            {hashtags}
          </div>
        )}
      </div>

      {/* Link bài đăng thực tế nếu đã đăng */}
      {publishedUrl && (
        <div
          style={{
            background: "rgba(52, 211, 153, 0.08)",
            border: "1px solid rgba(52, 211, 153, 0.2)",
            borderRadius: "6px",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "4px"
          }}
        >
          <div style={{ fontSize: "10.5px", fontWeight: 600, color: "#34d399" }}>
            Link bài đăng thực tế:
          </div>
          <a
            href={publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "10.5px",
              color: "#38bdf8",
              wordBreak: "break-all",
              textDecoration: "underline"
            }}
          >
            {publishedUrl}
          </a>
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          paddingTop: "10px",
          display: "flex",
          gap: "6px",
          flexWrap: "wrap"
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleOpenVideoDetail}
          style={{
            flex: 1,
            minWidth: "75px",
            fontSize: "11px",
            height: "30px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            color: "var(--accent-primary)",
            borderColor: "rgba(139, 92, 246, 0.35)",
            background: "rgba(139, 92, 246, 0.08)"
          }}
          title="Mở xem video và chi tiết đầy đủ trong modal"
        >
          <Icon name="play" size={12} color="var(--accent-primary)" />
          <span>Xem video</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onEdit(event)}
          style={{ flex: 1, minWidth: "68px", fontSize: "11px", height: "30px", borderRadius: "6px" }}
        >
          Chỉnh sửa
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onOpenExportModal && onOpenExportModal([video?.id || event?.video_id])}
          style={{
            flex: 1,
            minWidth: "88px",
            fontSize: "11px",
            height: "30px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            color: "#38bdf8",
            borderColor: "rgba(56, 189, 248, 0.35)",
            background: "rgba(56, 189, 248, 0.08)"
          }}
          title="Tải/lưu video này về thư mục máy tính"
        >
          <Icon name="download" size={12} color="#38bdf8" />
          <span>{(video?.local_export_count || 0) > 0 ? "Lưu lại" : "Tải về máy"}</span>
        </button>

        {onDelete && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onDelete(event.id)}
            style={{
              padding: "0 10px",
              fontSize: "11px",
              height: "30px",
              borderRadius: "6px",
              color: "#ef4444",
              borderColor: "rgba(239, 68, 68, 0.3)",
              background: "rgba(239, 68, 68, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
            title="Loại bỏ khỏi lịch đăng"
          >
            <Icon name="trash" size={12} color="#ef4444" />
            <span>Loại bỏ</span>
          </button>
        )}

        {isPublished ? (
          publishedUrl ? (
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{
                flex: 1.5,
                fontSize: "11px",
                height: "30px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none"
              }}
            >
              Xem bài đăng
            </a>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onConfirmPublished(event)}
              style={{ flex: 1.5, fontSize: "11px", height: "30px", borderRadius: "6px" }}
            >
              Cập nhật link
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirmPublished(event)}
            style={{
              flex: 1.5,
              fontSize: "11px",
              height: "30px",
              borderRadius: "6px",
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)"
            }}
          >
            Đánh dấu đã đăng
          </button>
        )}
      </div>
    </div>
  );
}
