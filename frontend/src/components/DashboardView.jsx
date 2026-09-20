import React from "react";
import { Icon } from "./Icons";
import { useLanguage } from "../i18n";

export default function DashboardView({
  videos = [],
  categories = [],
  calendarEvents = [],
  notes = [],
  driveStatus = null,
  trashCount = 0,
  onSelectVideoForDetail,
  onOpenDownloader,
  setCurrentView,
  setSelectedCategory,
  onOpenDriveModal,
}) {
  const { t } = useLanguage();

  // Platform counting
  const platformStats = React.useMemo(() => {
    const counts = {
      tiktok: 0,
      douyin: 0,
      youtube: 0,
      instagram: 0,
      x: 0,
      drive: 0,
      other: 0,
    };

    videos.forEach((v) => {
      const p = (v.platform || "").toLowerCase();
      if (p.includes("tiktok")) counts.tiktok++;
      else if (p.includes("douyin")) counts.douyin++;
      else if (p.includes("youtube")) counts.youtube++;
      else if (p.includes("instagram") || p.includes("reel")) counts.instagram++;
      else if (p.includes("twitter") || p === "x") counts.x++;
      else if (p.includes("drive")) counts.drive++;
      else counts.other++;
    });

    const total = videos.length || 1;
    return [
      { id: "tiktok", name: "TikTok", count: counts.tiktok, pct: Math.round((counts.tiktok / total) * 100), color: "#00f2fe", icon: "tiktok" },
      { id: "douyin", name: "Douyin", count: counts.douyin, pct: Math.round((counts.douyin / total) * 100), color: "#fe2c55", icon: "tiktok" },
      { id: "youtube", name: "YouTube", count: counts.youtube, pct: Math.round((counts.youtube / total) * 100), color: "#ff0000", icon: "youtube" },
      { id: "instagram", name: "Instagram", count: counts.instagram, pct: Math.round((counts.instagram / total) * 100), color: "#e1306c", icon: "instagram" },
      { id: "x", name: "X / Twitter", count: counts.x, pct: Math.round((counts.x / total) * 100), color: "#94a3b8", icon: "xTwitter" },
      { id: "drive", name: "Google Drive", count: counts.drive, pct: Math.round((counts.drive / total) * 100), color: "#22c55e", icon: "drive" },
    ].filter((item) => item.count > 0 || total > 0);
  }, [videos]);

  // Recent videos (latest 5)
  const recentVideos = React.useMemo(() => {
    return [...videos].slice(0, 6);
  }, [videos]);

  // Upcoming calendar events (sorted by date)
  const upcomingEvents = React.useMemo(() => {
    return [...calendarEvents]
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
      .slice(0, 4);
  }, [calendarEvents]);

  const realCategories = categories.filter((c) => c.id !== "all");

  return (
    <div className="dashboard-container">
      {/* 1. Welcome Hero Banner */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="dashboard-hero-badge">
            <Icon name="sparkles" size={13} color="var(--accent-primary)" />
            <span>SOCIALCONTENT STUDIO OS</span>
          </div>
          <h1 className="dashboard-hero-title">Bảng Điều Khiển Tổng Quan</h1>
          <p className="dashboard-hero-desc">
            Quản trị thông minh toàn bộ video đa nền tảng, studio âm thanh, lịch đăng bài và kho kịch bản số.
          </p>

          <div className="dashboard-hero-actions">
            <button
              className="btn btn-primary"
              style={{ padding: "8px 14px", fontSize: "12px", gap: "7px" }}
              onClick={() => onOpenDownloader("single")}
            >
              <Icon name="download" size={15} color="#fff" />
              <span>Tải Video Nhanh</span>
            </button>

            <button
              className="btn btn-secondary"
              style={{ padding: "8px 14px", fontSize: "12px", gap: "7px" }}
              onClick={() => {
                setSelectedCategory("all");
                setCurrentView("vault");
              }}
            >
              <Icon name="grid" size={15} />
              <span>Mở Kho Video</span>
            </button>

            <button
              className="btn btn-secondary"
              style={{ padding: "8px 14px", fontSize: "12px", gap: "7px" }}
              onClick={() => setCurrentView("calendar")}
            >
              <Icon name="calendar" size={15} />
              <span>Lịch Đăng Bài</span>
            </button>

            <button
              className="btn btn-secondary"
              style={{ padding: "8px 14px", fontSize: "12px", gap: "7px" }}
              onClick={() => setCurrentView("notes")}
            >
              <Icon name="fileText" size={15} />
              <span>Kịch Bản & Note</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Stats Row */}
      <div className="dashboard-stats-grid">
        {/* Stat 1: Total Videos */}
        <div
          className="dash-stat-card card-purple"
          onClick={() => {
            setSelectedCategory("all");
            setCurrentView("vault");
          }}
          title="Bấm để mở Kho Video"
        >
          <div className="dash-stat-header">
            <span className="dash-stat-label">Tổng Video Trong Kho</span>
            <div className="dash-stat-icon purple">
              <Icon name="play" size={16} color="#8b5cf6" />
            </div>
          </div>
          <div className="dash-stat-value">{videos.length}</div>
          <div className="dash-stat-footer">
            <span className="dash-stat-badge purple">+ Sẵn sàng sử dụng</span>
            <span className="dash-stat-sub">Bấm để xem kho →</span>
          </div>
        </div>

        {/* Stat 2: Categories */}
        <div
          className="dash-stat-card card-blue"
          onClick={() => {
            setSelectedCategory("all");
            setCurrentView("vault");
          }}
          title="Bấm để xem danh mục phân loại"
        >
          <div className="dash-stat-header">
            <span className="dash-stat-label">Danh Mục Phân Loại</span>
            <div className="dash-stat-icon blue">
              <Icon name="folder" size={16} color="#3b82f6" />
            </div>
          </div>
          <div className="dash-stat-value">{realCategories.length}</div>
          <div className="dash-stat-footer">
            <span className="dash-stat-badge blue">Chủ đề nội dung</span>
            <span className="dash-stat-sub">Quản lý thư mục →</span>
          </div>
        </div>

        {/* Stat 3: Calendar */}
        <div
          className="dash-stat-card card-green"
          onClick={() => setCurrentView("calendar")}
          title="Bấm để mở Lịch Đăng Bài"
        >
          <div className="dash-stat-header">
            <span className="dash-stat-label">Lịch Đăng Đã Lên</span>
            <div className="dash-stat-icon green">
              <Icon name="calendar" size={16} color="#10b981" />
            </div>
          </div>
          <div className="dash-stat-value">{calendarEvents.length}</div>
          <div className="dash-stat-footer">
            <span className="dash-stat-badge green">Kế hoạch đăng</span>
            <span className="dash-stat-sub">Mở lịch đăng bài →</span>
          </div>
        </div>

        {/* Stat 4: Notes */}
        <div
          className="dash-stat-card card-amber"
          onClick={() => setCurrentView("notes")}
          title="Bấm để mở Kịch Bản & Note"
        >
          <div className="dash-stat-header">
            <span className="dash-stat-label">Kịch Bản & Tài Liệu</span>
            <div className="dash-stat-icon amber">
              <Icon name="fileText" size={16} color="#f59e0b" />
            </div>
          </div>
          <div className="dash-stat-value">{notes.length}</div>
          <div className="dash-stat-footer">
            <span className="dash-stat-badge amber">Kịch bản Word</span>
            <span className="dash-stat-sub">Soạn kịch bản →</span>
          </div>
        </div>
      </div>

      {/* 3. Main Two-Column Layout */}
      <div className="dashboard-grid-layout">
        {/* Left Column (65%) */}
        <div className="dashboard-main-col">
          {/* Recent Videos Section */}
          <div className="dashboard-section-card">
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <Icon name="play" size={15} color="var(--accent-primary)" />
                <h3 className="dash-card-title">Video Mới Tải Về Gần Đây</h3>
              </div>
              <button
                className="dash-link-btn"
                onClick={() => {
                  setSelectedCategory("all");
                  setCurrentView("vault");
                }}
              >
                <span>Xem tất cả ({videos.length})</span>
                <Icon name="externalLink" size={12} />
              </button>
            </div>

            {recentVideos.length === 0 ? (
              <div className="dash-empty-box">
                <Icon name="download" size={32} color="var(--text-muted)" />
                <p>Chưa có video nào trong kho lưu trữ.</p>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onOpenDownloader("single")}
                >
                  Tải video đầu tiên ngay
                </button>
              </div>
            ) : (
              <div className="dash-recent-videos-grid">
                {recentVideos.map((video) => (
                  <div
                    key={video.id}
                    className="dash-video-item"
                    onClick={() => onSelectVideoForDetail && onSelectVideoForDetail(video)}
                  >
                    <div className="dash-video-thumb-wrap">
                      <img
                        src={video.thumbnail_url || "/placeholder-thumb.jpg"}
                        alt={video.title}
                        className="dash-video-thumb"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90' fill='%231e293b'%3E%3Crect width='100%25' height='100%25'/%3E%3C/svg%3E";
                        }}
                      />
                      {Boolean(video.is_used) && (
                        <span style={{
                          position: "absolute",
                          top: "4px",
                          left: "4px",
                          background: "linear-gradient(135deg, #10b981, #059669)",
                          color: "#fff",
                          fontSize: "8px",
                          fontWeight: 700,
                          padding: "1.5px 5px",
                          borderRadius: "3px",
                          zIndex: 2,
                          boxShadow: "0 2px 4px rgba(0,0,0,0.5)"
                        }}>
                          ✓ ĐÃ DÙNG
                        </span>
                      )}
                      {video.duration ? (
                        <span className="dash-video-duration">{video.duration}</span>
                      ) : null}
                    </div>

                    <div className="dash-video-info">
                      <div className="dash-video-platform-row">
                        <span className="dash-platform-pill">
                          {video.platform || "Video"}
                        </span>
                        {video.quality && (
                          <span className="dash-quality-pill">{video.quality}</span>
                        )}
                      </div>
                      <h4 className="dash-video-title" title={video.title}>
                        {video.title || "Video không tiêu đề"}
                      </h4>
                      <div className="dash-video-author">
                        {video.uploader ? `@${video.uploader}` : "SocialContent"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categories Quick Access */}
          <div className="dashboard-section-card">
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <Icon name="folder" size={15} color="#3b82f6" />
                <h3 className="dash-card-title">Phân Nhóm Danh Mục Nhanh</h3>
              </div>
              <button
                className="dash-link-btn"
                onClick={() => {
                  setSelectedCategory("all");
                  setCurrentView("vault");
                }}
              >
                <span>Mở trong Kho</span>
                <Icon name="externalLink" size={12} />
              </button>
            </div>

            <div className="dash-categories-grid">
              <div
                className="dash-category-chip active-all"
                onClick={() => {
                  setSelectedCategory("all");
                  setCurrentView("vault");
                }}
              >
                <Icon name="grid" size={14} color="#8b5cf6" />
                <span className="chip-name">Tất cả Video</span>
                <span className="chip-count">{videos.length}</span>
              </div>

              {realCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="dash-category-chip"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setCurrentView("vault");
                  }}
                  title={`Xem danh mục ${cat.name}`}
                >
                  <Icon name={cat.icon || "folder"} size={14} color="#94a3b8" />
                  <span className="chip-name">{cat.name}</span>
                  {cat.is_locked ? (
                    <Icon name="lock" size={11} color="#f43f5e" />
                  ) : null}
                  <span className="chip-count">{cat.count || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (35%) */}
        <div className="dashboard-side-col">
          {/* Platform Distribution Card */}
          <div className="dashboard-section-card">
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <Icon name="layers" size={15} color="var(--accent-cyan)" />
                <h3 className="dash-card-title">Phân Bổ Nền Tảng</h3>
              </div>
              <span className="dash-card-badge">{videos.length} video</span>
            </div>

            <div className="dash-platform-list">
              {platformStats.map((item) => (
                <div key={item.id} className="dash-platform-item">
                  <div className="dash-platform-row">
                    <div className="dash-platform-name-group">
                      <Icon name={item.icon} size={13} color={item.color} />
                      <span className="platform-name">{item.name}</span>
                    </div>
                    <div className="dash-platform-val">
                      <span className="platform-count">{item.count} video</span>
                      <span className="platform-pct">({item.pct}%)</span>
                    </div>
                  </div>
                  <div className="dash-progress-track">
                    <div
                      className="dash-progress-fill"
                      style={{
                        width: `${Math.max(item.pct, item.count > 0 ? 5 : 0)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Schedule Card */}
          <div className="dashboard-section-card">
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <Icon name="calendar" size={15} color="#10b981" />
                <h3 className="dash-card-title">Kế Hoạch Sắp Đăng</h3>
              </div>
              <button
                className="dash-link-btn"
                onClick={() => setCurrentView("calendar")}
              >
                <span>Xem lịch</span>
                <Icon name="externalLink" size={12} />
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="dash-empty-small">
                <p>Chưa có bài viết nào được lên lịch.</p>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrentView("calendar")}
                >
                  Lên lịch ngay
                </button>
              </div>
            ) : (
              <div className="dash-event-list">
                {upcomingEvents.map((evt, idx) => (
                  <div
                    key={evt.id || idx}
                    className="dash-event-item"
                    onClick={() => setCurrentView("calendar")}
                  >
                    <div className="dash-event-date">
                      <span className="event-day">
                        {evt.date ? new Date(evt.date).getDate() : "--"}
                      </span>
                      <span className="event-month">
                        {evt.date
                          ? `Th${new Date(evt.date).getMonth() + 1}`
                          : ""}
                      </span>
                    </div>
                    <div className="dash-event-info">
                      <h5 className="event-title">{evt.title || "Bài viết mới"}</h5>
                      <span className="event-platform">
                        {evt.platform || "Đa nền tảng"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cloud & System Status Card */}
          <div className="dashboard-section-card">
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <Icon name="cloud" size={15} color="var(--accent-cyan)" />
                <h3 className="dash-card-title">Đồng Bộ & Dọn Dẹp</h3>
              </div>
            </div>

            <div className="dash-system-status">
              {/* Drive status */}
              <div
                className="dash-status-row clickable"
                onClick={onOpenDriveModal}
                title="Bấm để cấu hình Google Drive"
              >
                <div className="status-label-group">
                  <Icon name="drive" size={16} />
                  <div>
                    <div className="status-main-label">Google Drive</div>
                    <div className="status-sub-label">
                      {driveStatus?.mode === "desktop"
                        ? "Desktop Sync Folder"
                        : driveStatus?.mode === "api"
                        ? "Cloud OAuth API"
                        : "Chỉ lưu máy cục bộ (Local)"}
                    </div>
                  </div>
                </div>
                <div
                  className={`status-indicator ${
                    driveStatus?.is_ready ? "online" : "offline"
                  }`}
                >
                  {driveStatus?.is_ready ? "Đã kết nối" : "Chưa kết nối"}
                </div>
              </div>

              {/* Trash status */}
              <div
                className="dash-status-row clickable"
                onClick={() => setCurrentView("trash")}
                title="Mở Thùng Rác"
              >
                <div className="status-label-group">
                  <Icon name="trash" size={16} color={trashCount > 0 ? "#f43f5e" : "#64748b"} />
                  <div>
                    <div className="status-main-label">Thùng Rác Tạm</div>
                    <div className="status-sub-label">
                      {trashCount > 0
                        ? `${trashCount} video đã chuyển vào thùng rác`
                        : "Thùng rác trống sạch sẽ"}
                    </div>
                  </div>
                </div>
                {trashCount > 0 && (
                  <span className="dash-trash-badge">{trashCount}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
