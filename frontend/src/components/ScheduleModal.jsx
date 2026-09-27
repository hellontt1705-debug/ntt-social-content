import React, { useState, useEffect, useRef } from "react";
import { Icon } from "./Icons";
import { MEDIA_BASE } from "../api";
import { useLanguage } from "../i18n";

export default function ScheduleModal({
  isOpen,
  onClose,
  video,
  onSave
}) {
  const { t } = useLanguage();
  const videoRef = useRef(null);

  // Selected platforms (default: tiktok & youtube_shorts)
  const [selectedPlatforms, setSelectedPlatforms] = useState(["tiktok", "youtube_shorts"]);
  
  // Content mode: "per_platform" | "shared"
  const [contentMode, setContentMode] = useState("per_platform");
  
  // Active platform tab when in "per_platform" mode
  const [activePlatformTab, setActivePlatformTab] = useState("tiktok");

  // Date, Time, Timezone
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [scheduledTime, setScheduledTime] = useState("20:30");
  const [timezone, setTimezone] = useState("(UTC+7) Asia/Ho_Chi_Minh");

  // Captions & Hashtags (per platform or shared)
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  // Advanced options
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(true);
  const [repeatMode, setRepeatMode] = useState("none");
  const [autoWatermark, setAutoWatermark] = useState(true);
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(true);

  // Video playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDriveIframe, setShowDriveIframe] = useState(false);

  // Initialize or reset form when modal opens or video changes
  useEffect(() => {
    if (isOpen && video) {
      const initTitle = video.title || "";
      const tags = (video.hashtags || []).map(tag => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
      setCaption(initTitle ? `${initTitle}\n${tags}`.trim() : "");
      setHashtags(tags || "#fyp #trending #viral");
      setSelectedPlatforms(["tiktok", "youtube_shorts"]);
      setActivePlatformTab("tiktok");
      const d = new Date();
      setScheduledDate(d.toISOString().split("T")[0]);
      setScheduledTime("20:30");
      setIsPlaying(false);
      setShowDriveIframe(false);
    }
  }, [isOpen, video]);

  if (!isOpen || !video) return null;

  // Platform definitions
  const platformList = [
    { id: "tiktok", label: "TikTok", icon: "tiktok", color: "#00f2fe" },
    { id: "youtube_shorts", label: "YouTube Shorts", icon: "youtube", color: "#ff0000" },
    { id: "instagram_reels", label: "Instagram Reels", icon: "instagram", color: "#e1306c" },
    { id: "x", label: "X / Twitter", icon: "xTwitter", color: "#ffffff" },
    { id: "douyin", label: "Douyin (抖音)", icon: "tiktok", color: "#fe2c55" }
  ];

  const togglePlatform = (pId) => {
    if (selectedPlatforms.includes(pId)) {
      if (selectedPlatforms.length === 1) {
        alert("Vui lòng chọn ít nhất một nền tảng để đăng tải.");
        return;
      }
      const updated = selectedPlatforms.filter(p => p !== pId);
      setSelectedPlatforms(updated);
      if (activePlatformTab === pId && updated.length > 0) {
        setActivePlatformTab(updated[0]);
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, pId]);
      setActivePlatformTab(pId);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return "00:11";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "12.4 MB";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // Video / Image stream URL resolution
  const filename = video.file_path ? video.file_path.split(/[\\/]/).pop() : "";
  const videoStreamUrl = filename ? `${MEDIA_BASE}/${filename}` : (video.video_url || video.url || "");
  const isImage = video.media_type === "image" || (video.file_path && /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(video.file_path));
  const imageDisplayUrl = videoStreamUrl || (video.local_thumbnail ? `${MEDIA_BASE}/thumbnails/${video.local_thumbnail.split(/[\\/]/).pop()}` : "") || (video.thumbnail_url && !video.thumbnail_url.includes("googleusercontent.com/d/") ? video.thumbnail_url : "") || (video.drive_file_id ? `/api/drive/thumbnail/${video.drive_file_id}` : "") || video.thumbnail_url || "";

  const getThumbnailSrc = () => {
    if (video.local_thumbnail) {
      const thumbFile = video.local_thumbnail.split(/[\\/]/).pop();
      return `${MEDIA_BASE}/thumbnails/${thumbFile}`;
    }
    if (video.thumbnail_url && !video.thumbnail_url.includes("googleusercontent.com/d/")) return video.thumbnail_url;
    if (video.drive_file_id) return `/api/drive/thumbnail/${video.drive_file_id}`;
    return "/placeholder.png";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedPlatforms.length === 0) {
      alert("Vui lòng chọn ít nhất một nền tảng đăng.");
      return;
    }

    const eventData = {
      id: "cal_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7),
      video_id: video.id,
      title: video.title || caption.split("\n")[0] || "Lịch đăng video",
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      platforms: selectedPlatforms,
      status: publishImmediately ? "published" : "scheduled",
      notes: JSON.stringify({
        caption,
        hashtags,
        timezone,
        repeatMode,
        autoWatermark,
        publishImmediately,
        notifyOnSuccess,
        contentMode,
        platform: activePlatformTab
      })
    };

    if (onSave) {
      onSave(eventData);
    }
    onClose();
  };

  const hashtagList = hashtags.trim() ? hashtags.trim().split(/\s+/).filter(Boolean) : [];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        background: "rgba(5, 6, 12, 0.8)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        padding: "16px",
        boxSizing: "border-box"
      }}
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "760px",
          maxWidth: "94vw",
          maxHeight: "88vh",
          margin: "auto",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
          background: "#10141f",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.75), 0 0 30px rgba(139, 92, 246, 0.12)",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(255, 255, 255, 0.01)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(236, 72, 153, 0.2) 100%)",
                border: "1px solid rgba(139, 92, 246, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#c084fc",
                boxShadow: "0 3px 10px rgba(139, 92, 246, 0.2)"
              }}
            >
              <Icon name="calendar" size={18} color="#c084fc" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 700, color: "#fff" }}>
                Lên lịch đăng bài
              </h3>
              <p style={{ margin: "1px 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
                Thiết lập thời gian và nội dung để đăng video lên các nền tảng mạng xã hội
              </p>
            </div>
          </div>

          <button
            className="icon-btn"
            onClick={onClose}
            style={{ width: "28px", height: "28px", borderRadius: "6px" }}
            title="Đóng"
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "230px 1fr",
            gap: "16px",
            padding: "14px 18px",
            overflowY: "auto",
            flex: 1
          }}
        >
          {/* Left Column: Video Information Card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "12px",
              padding: "10px",
              height: "fit-content"
            }}
          >
            {/* Video Player / Preview */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "175px",
                borderRadius: "10px",
                overflow: "hidden",
                background: "#000",
                boxShadow: "0 3px 10px rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {isImage ? (
                <img
                  src={imageDisplayUrl}
                  alt={video.title}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "/placeholder.png";
                  }}
                />
              ) : videoStreamUrl ? (
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

                  {/* Center Play Button when paused */}
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
                        cursor: "pointer",
                        transition: "background 0.2s ease"
                      }}
                    >
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                          boxShadow: "0 0 25px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          border: "2px solid rgba(255, 255, 255, 0.9)",
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.12)";
                          e.currentTarget.style.boxShadow = "0 0 30px rgba(139, 92, 246, 0.9), 0 6px 16px rgba(0, 0, 0, 0.6)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = "0 0 25px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)";
                        }}
                        title="Phát video"
                      >
                        <Icon name="play" size={22} color="#fff" style={{ marginLeft: "3px" }} />
                      </div>
                    </div>
                  )}

                  {/* Top-right Maximize button */}
                  <button
                    type="button"
                    onClick={() => {
                      const vEl = videoRef.current;
                      if (vEl) {
                        if (vEl.requestFullscreen) vEl.requestFullscreen();
                        else if (vEl.webkitRequestFullscreen) vEl.webkitRequestFullscreen();
                      }
                    }}
                    style={{
                      position: "absolute",
                      top: "6px",
                      right: "6px",
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "rgba(0, 0, 0, 0.7)",
                      backdropFilter: "blur(4px)",
                      border: "1px solid rgba(255, 255, 255, 0.25)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      zIndex: 10
                    }}
                    title="Xem toàn màn hình"
                  >
                    <Icon name="maximize" size={12} color="#fff" />
                  </button>
                </div>
              ) : video.drive_file_id ? (
                <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
                  {showDriveIframe ? (
                    <>
                      <iframe
                        src={`https://drive.google.com/file/d/${video.drive_file_id}/preview?autoplay=1`}
                        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                        allow="autoplay"
                        title={video.title || "Video Google Drive"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowDriveIframe(false)}
                        style={{
                          position: "absolute",
                          top: "6px",
                          left: "6px",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: "rgba(0, 0, 0, 0.8)",
                          backdropFilter: "blur(4px)",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                          color: "#fff",
                          fontSize: "10px",
                          fontWeight: 600,
                          cursor: "pointer",
                          zIndex: 10
                        }}
                        title="Đóng trình phát"
                      >
                        ✕ Đóng
                      </button>
                    </>
                  ) : (
                    <div
                      style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer" }}
                      onClick={() => setShowDriveIframe(true)}
                    >
                      <img
                        src={getThumbnailSrc()}
                        alt={video.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "/placeholder.png";
                        }}
                      />
                      {/* Dark overlay with Center Play Button */}
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
                            width: "48px",
                            height: "48px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                            boxShadow: "0 0 25px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            border: "2px solid rgba(255, 255, 255, 0.9)",
                            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "scale(1.12)";
                            e.currentTarget.style.boxShadow = "0 0 30px rgba(139, 92, 246, 0.9), 0 6px 16px rgba(0, 0, 0, 0.6)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "scale(1)";
                            e.currentTarget.style.boxShadow = "0 0 25px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)";
                          }}
                          title="Phát video"
                        >
                          <Icon name="play" size={22} color="#fff" style={{ marginLeft: "3px" }} />
                        </div>
                      </div>

                      {/* Duration badge */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: "6px",
                          right: "6px",
                          background: "rgba(0, 0, 0, 0.75)",
                          backdropFilter: "blur(4px)",
                          color: "#fff",
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: "3px",
                          letterSpacing: "0.03em"
                        }}
                      >
                        {formatDuration(video.duration)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <img
                    src={getThumbnailSrc()}
                    alt={video.title}
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
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                        boxShadow: "0 0 25px rgba(139, 92, 246, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        border: "2px solid rgba(255, 255, 255, 0.9)"
                      }}
                    >
                      <Icon name="play" size={22} color="#fff" style={{ marginLeft: "3px" }} />
                    </div>
                  </div>

                  <div
                    style={{
                      position: "absolute",
                      bottom: "6px",
                      right: "6px",
                      background: "rgba(0, 0, 0, 0.75)",
                      backdropFilter: "blur(4px)",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: "3px",
                      letterSpacing: "0.03em"
                    }}
                  >
                    {formatDuration(video.duration)}
                  </div>
                </div>
              )}
            </div>

            {/* Title & Uploader */}
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "12px",
                  color: "#fff",
                  lineHeight: "1.3",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical"
                }}
                title={video.title}
              >
                {video.title || "Chưa có tiêu đề video"}
              </div>
              <div
                style={{
                  fontSize: "10.5px",
                  color: "var(--text-muted)",
                  marginTop: "2px"
                }}
              >
                @{video.uploader || "creator"}
              </div>
            </div>

            {/* Metadata Rows */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                paddingTop: "8px"
              }}
            >
              {/* Độ phân giải */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="monitor" size={13} color="#38bdf8" />
                  <span>Độ phân giải</span>
                </span>
                <span style={{ color: "#fff", fontWeight: 700 }}>
                  {video.quality || "720p"}
                </span>
              </div>

              {/* Dung lượng */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="hardDrive" size={13} color="#a78bfa" />
                  <span>Dung lượng</span>
                </span>
                <span style={{ color: "#fff", fontWeight: 700 }}>
                  {formatFileSize(video.file_size)}
                </span>
              </div>

              {/* Thời lượng */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="clock" size={13} color="#34d399" />
                  <span>Thời lượng</span>
                </span>
                <span style={{ color: "#fff", fontWeight: 700 }}>
                  {formatDuration(video.duration)}
                </span>
              </div>

              {/* Định dạng */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="fileVideo" size={13} color="#f472b6" />
                  <span>Định dạng</span>
                </span>
                <span style={{ color: "#fff", fontWeight: 700 }}>
                  {video.media_type === "image" ? "JPG / PNG" : "MP4"}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Scheduling & Content Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Header: Chọn nền tảng đăng & Kết nối tài khoản */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                Chọn nền tảng đăng
              </span>
              <button
                type="button"
                onClick={() => alert("Chức năng Kết nối tài khoản mạng xã hội (OAuth 2.0) đang được tích hợp tự động qua Webhook / Token.")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  borderRadius: "16px",
                  background: "rgba(139, 92, 246, 0.12)",
                  border: "1px solid rgba(139, 92, 246, 0.4)",
                  color: "#c084fc",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <Icon name="link" size={11} color="#c084fc" />
                <span>Kết nối tài khoản</span>
              </button>
            </div>

            {/* Platform Selection Cards Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "8px"
              }}
            >
              {platformList.map((p) => {
                const isChecked = selectedPlatforms.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      background: isChecked ? "rgba(139, 92, 246, 0.12)" : "rgba(255, 255, 255, 0.03)",
                      border: `1px solid ${isChecked ? "rgba(139, 92, 246, 0.5)" : "rgba(255, 255, 255, 0.08)"}`,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      userSelect: "none"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <Icon name={p.icon} size={15} color={p.color} />
                      <span style={{ fontSize: "11px", fontWeight: isChecked ? 700 : 500, color: isChecked ? "#fff" : "#cbd5e1" }}>
                        {p.label}
                      </span>
                    </div>

                    {/* Custom Checkbox Box */}
                    <div
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "3px",
                        border: isChecked ? "none" : "1.5px solid rgba(255, 255, 255, 0.3)",
                        background: isChecked ? "#8b5cf6" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s"
                      }}
                    >
                      {isChecked && <Icon name="check" size={10} color="#fff" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Content Mode Switcher: "Cấu hình từng nền tảng" vs "Dùng chung nội dung" */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  display: "inline-flex",
                  background: "rgba(255, 255, 255, 0.04)",
                  padding: "2px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.08)"
                }}
              >
                <button
                  type="button"
                  onClick={() => setContentMode("per_platform")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: contentMode === "per_platform" ? 700 : 500,
                    border: "none",
                    background: contentMode === "per_platform" ? "linear-gradient(135deg, rgba(139, 92, 246, 0.35) 0%, rgba(139, 92, 246, 0.2) 100%)" : "transparent",
                    color: contentMode === "per_platform" ? "#fff" : "var(--text-muted)",
                    boxShadow: contentMode === "per_platform" ? "0 2px 6px rgba(139, 92, 246, 0.25)" : "none",
                    cursor: "pointer"
                  }}
                >
                  Cấu hình từng nền tảng
                </button>

                <button
                  type="button"
                  onClick={() => setContentMode("shared")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: contentMode === "shared" ? 700 : 500,
                    border: "none",
                    background: contentMode === "shared" ? "linear-gradient(135deg, rgba(139, 92, 246, 0.35) 0%, rgba(139, 92, 246, 0.2) 100%)" : "transparent",
                    color: contentMode === "shared" ? "#fff" : "var(--text-muted)",
                    boxShadow: contentMode === "shared" ? "0 2px 6px rgba(139, 92, 246, 0.25)" : "none",
                    cursor: "pointer"
                  }}
                >
                  Dùng chung nội dung
                </button>
              </div>
            </div>

            {/* Platform Sub-Tabs (If "Cấu hình từng nền tảng" is selected) */}
            {contentMode === "per_platform" && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                {selectedPlatforms.map((pId) => {
                  const p = platformList.find(item => item.id === pId);
                  if (!p) return null;
                  const isActive = activePlatformTab === pId;
                  return (
                    <button
                      key={pId}
                      type="button"
                      onClick={() => setActivePlatformTab(pId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: isActive ? 700 : 500,
                        border: `1px solid ${isActive ? "rgba(139, 92, 246, 0.6)" : "rgba(255, 255, 255, 0.08)"}`,
                        background: isActive ? "rgba(139, 92, 246, 0.18)" : "rgba(255, 255, 255, 0.03)",
                        color: isActive ? "#fff" : "var(--text-secondary)",
                        cursor: "pointer"
                      }}
                    >
                      <Icon name={p.icon} size={12} color={p.color} />
                      <span>{p.label}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    const unselected = platformList.filter(p => !selectedPlatforms.includes(p.id));
                    if (unselected.length > 0) {
                      togglePlatform(unselected[0].id);
                    } else {
                      alert("Bạn đã chọn tất cả các nền tảng hỗ trợ.");
                    }
                  }}
                  style={{
                    padding: "3px 7px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    border: "1px dashed rgba(255, 255, 255, 0.15)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer"
                  }}
                  title="Thêm nền tảng"
                >
                  +
                </button>
              </div>
            )}

            {/* Date, Time & Timezone Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.25fr", gap: "8px" }}>
              {/* Ngày đăng */}
              <div>
                <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Ngày đăng
                </label>
                <div
                  style={{ position: "relative", cursor: "pointer" }}
                  onClick={(e) => {
                    const inp = e.currentTarget.querySelector('input[type="date"]');
                    if (inp && inp.showPicker) {
                      try { inp.showPicker(); } catch (_) {}
                    }
                  }}
                >
                  <input
                    type="date"
                    className="form-input"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    style={{
                      padding: "6px 8px 6px 28px",
                      fontSize: "11.5px",
                      colorScheme: "dark",
                      color: "#fff",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      cursor: "pointer",
                      width: "100%",
                      borderRadius: "6px"
                    }}
                    required
                  />
                  <div style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                    <Icon name="calendar" size={13} color="#c084fc" />
                  </div>
                </div>
              </div>

              {/* Giờ đăng */}
              <div>
                <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Giờ đăng
                </label>
                <div
                  style={{ position: "relative", cursor: "pointer" }}
                  onClick={(e) => {
                    const inp = e.currentTarget.querySelector('input[type="time"]');
                    if (inp && inp.showPicker) {
                      try { inp.showPicker(); } catch (_) {}
                    }
                  }}
                >
                  <input
                    type="time"
                    className="form-input"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    style={{
                      padding: "6px 8px 6px 28px",
                      fontSize: "11.5px",
                      colorScheme: "dark",
                      color: "#fff",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      cursor: "pointer",
                      width: "100%",
                      borderRadius: "6px"
                    }}
                    required
                  />
                  <div style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                    <Icon name="clock" size={13} color="#c084fc" />
                  </div>
                </div>
              </div>

              {/* Múi giờ */}
              <div>
                <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Múi giờ
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    className="form-select"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      padding: "6px 8px 6px 28px",
                      fontSize: "11px",
                      textOverflow: "ellipsis",
                      colorScheme: "dark",
                      color: "#fff",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      cursor: "pointer",
                      width: "100%",
                      borderRadius: "6px"
                    }}
                  >
                    <option value="(UTC+7) Asia/Ho_Chi_Minh">(UTC+7) Asia/Ho_Chi_Minh</option>
                    <option value="(UTC+8) Asia/Singapore">(UTC+8) Asia/Singapore</option>
                    <option value="(UTC+9) Asia/Tokyo">(UTC+9) Asia/Tokyo</option>
                    <option value="(UTC+0) Europe/London">(UTC+0) Europe/London</option>
                    <option value="(UTC-5) America/New_York">(UTC-5) America/New_York</option>
                  </select>
                  <div style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                    <Icon name="globe" size={13} color="#c084fc" />
                  </div>
                </div>
              </div>
            </div>

            {/* Two Sub-Columns: Content & Advanced Settings */}
            <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1.15fr", gap: "10px" }}>
              {/* Left Sub-column: Caption & Hashtags */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* Caption Textarea */}
                <div>
                  <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Nội dung bài đăng (Caption)
                  </label>
                  <div style={{ position: "relative" }}>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Nhập tiêu đề hoặc mô tả bài đăng..."
                      style={{
                        fontSize: "11.5px",
                        lineHeight: "1.35",
                        padding: "6px 8px 18px",
                        resize: "vertical",
                        minHeight: "68px",
                        borderRadius: "6px"
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        bottom: "4px",
                        right: "6px",
                        fontSize: "9.5px",
                        color: "var(--text-muted)"
                      }}
                    >
                      {caption.length}/2200
                    </span>
                  </div>
                </div>

                {/* Hashtags Input */}
                <div>
                  <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Hashtag (cách nhau bằng dấu cách)
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="form-input"
                      value={hashtags}
                      onChange={(e) => setHashtags(e.target.value)}
                      placeholder="#cat #cute #fyp #meow"
                      style={{ fontSize: "11px", padding: "6px 40px 6px 8px", borderRadius: "6px" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "9.5px",
                        color: "var(--text-muted)"
                      }}
                    >
                      {hashtagList.length}/30
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Sub-column: Advanced Options */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "10px",
                  padding: "9px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                <div
                  onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Icon name={isAdvancedOpen ? "chevronDown" : "chevronUp"} size={12} color="#c084fc" />
                    <span>Tùy chọn nâng cao</span>
                  </span>
                </div>

                {isAdvancedOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                    {/* Lặp lại đăng */}
                    <div>
                      <label style={{ display: "block", fontSize: "10px", color: "var(--text-muted)", marginBottom: "2px" }}>
                        Lặp lại đăng
                      </label>
                      <select
                        className="form-select"
                        value={repeatMode}
                        onChange={(e) => setRepeatMode(e.target.value)}
                        style={{
                          fontSize: "10.5px",
                          padding: "4px 6px",
                          colorScheme: "dark",
                          color: "#fff",
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          cursor: "pointer",
                          width: "100%",
                          borderRadius: "5px"
                        }}
                      >
                        <option value="none">Không lặp lại</option>
                        <option value="daily">Hàng ngày (Daily)</option>
                        <option value="weekly">Hàng tuần (Weekly)</option>
                        <option value="monthly">Hàng tháng (Monthly)</option>
                      </select>
                    </div>

                    {/* Toggle: Tự động thêm watermark */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "10.5px", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "5px" }}>
                        <Icon name="sparkles" size={13} color="#c084fc" />
                        <span>Tự động thêm watermark</span>
                      </span>
                      <div
                        onClick={() => setAutoWatermark(!autoWatermark)}
                        style={{
                          width: "28px",
                          height: "15px",
                          borderRadius: "8px",
                          background: autoWatermark ? "#8b5cf6" : "rgba(255, 255, 255, 0.15)",
                          position: "relative",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        <div
                          style={{
                            width: "11px",
                            height: "11px",
                            borderRadius: "50%",
                            background: "#fff",
                            position: "absolute",
                            top: "2px",
                            left: autoWatermark ? "15px" : "2px",
                            transition: "all 0.2s"
                          }}
                        />
                      </div>
                    </div>

                    {/* Toggle: Đăng ngay nếu có thể */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "10.5px", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "5px" }}>
                        <Icon name="play" size={13} color="#38bdf8" />
                        <span>Đăng ngay nếu có thể</span>
                      </span>
                      <div
                        onClick={() => setPublishImmediately(!publishImmediately)}
                        style={{
                          width: "28px",
                          height: "15px",
                          borderRadius: "8px",
                          background: publishImmediately ? "#8b5cf6" : "rgba(255, 255, 255, 0.15)",
                          position: "relative",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        <div
                          style={{
                            width: "11px",
                            height: "11px",
                            borderRadius: "50%",
                            background: "#fff",
                            position: "absolute",
                            top: "2px",
                            left: publishImmediately ? "15px" : "2px",
                            transition: "all 0.2s"
                          }}
                        />
                      </div>
                    </div>

                    {/* Toggle: Thông báo khi đăng thành công */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "10.5px", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "5px" }}>
                        <Icon name="checkCircle" size={13} color="#10b981" />
                        <span>Thông báo khi đăng thành công</span>
                      </span>
                      <div
                        onClick={() => setNotifyOnSuccess(!notifyOnSuccess)}
                        style={{
                          width: "28px",
                          height: "15px",
                          borderRadius: "8px",
                          background: notifyOnSuccess ? "#8b5cf6" : "rgba(255, 255, 255, 0.15)",
                          position: "relative",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        <div
                          style={{
                            width: "11px",
                            height: "11px",
                            borderRadius: "50%",
                            background: "#fff",
                            position: "absolute",
                            top: "2px",
                            left: notifyOnSuccess ? "15px" : "2px",
                            transition: "all 0.2s"
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.25)"
          }}
        >
          {/* Tip Box */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "8px",
              background: "rgba(139, 92, 246, 0.08)",
              border: "1px solid rgba(139, 92, 246, 0.25)",
              color: "#c084fc",
              fontSize: "11px",
              maxWidth: "460px"
            }}
          >
            <Icon name="lightbulb" size={13} color="#fbbf24" />
            <span>Mẹo: Bạn có thể cấu hình riêng nội dung, thời gian cho từng nền tảng để đạt hiệu quả tốt nhất.</span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: "6px 14px", fontSize: "11.5px", height: "32px" }}
            >
              Hủy
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              className="btn btn-primary"
              style={{
                padding: "6px 16px",
                fontSize: "11.5px",
                fontWeight: 700,
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                border: "none",
                boxShadow: "0 3px 12px rgba(139, 92, 246, 0.4)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                height: "32px"
              }}
            >
              <Icon name="calendar" size={13} color="#fff" />
              <span>Lên lịch đăng</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
