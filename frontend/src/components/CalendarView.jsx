import React, { useState } from "react";
import { Icon } from "./Icons";
import { MEDIA_BASE } from "../api";
import { useLanguage } from "../i18n";

export default function CalendarView({
  calendarEvents,
  videos,
  onSaveCalendarEvent,
  onDeleteCalendarEvent,
  onSelectVideoForDetail
}) {
  const { t } = useLanguage();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [scheduledTime, setScheduledTime] = useState("19:00");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["tiktok", "youtube_shorts"]);
  const [status, setStatus] = useState("scheduled");
  const [notes, setNotes] = useState("");

  // Platform options
  const channelOptions = [
    { id: "tiktok", label: "TikTok", icon: "tiktok" },
    { id: "youtube_shorts", label: "YT Shorts", icon: "youtube" },
    { id: "instagram_reels", label: "IG Reels", icon: "instagram" },
    { id: "x", label: "X / Twitter", icon: "xTwitter" },
    { id: "douyin", label: "Douyin", icon: "tiktok" }
  ];

  const togglePlatform = (pId) => {
    if (selectedPlatforms.includes(pId)) {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== pId));
    } else {
      setSelectedPlatforms([...selectedPlatforms, pId]);
    }
  };

  // Generate 7 days for current week
  const getDaysOfWeek = () => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 is Sunday
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);

    const days = [];
    const dayNames = [t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat"), t("sun")];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      const isToday = iso === new Date().toISOString().split("T")[0];
      days.push({
        name: dayNames[i],
        dateStr: `${d.getDate()}/${d.getMonth() + 1}`,
        iso,
        isToday
      });
    }
    return days;
  };

  const weekDays = getDaysOfWeek();

  const handleVideoSelect = (vidId) => {
    setSelectedVideoId(vidId);
    const found = videos.find(v => v.id === vidId);
    if (found) {
      setTitle(found.title);
      if (found.notes) setNotes(found.notes);
    }
  };

  const handleSaveEvent = (e) => {
    e.preventDefault();
    if (!title.trim() || !scheduledDate) return;

    const newEvent = {
      id: "cal_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7),
      video_id: selectedVideoId || null,
      title: title.trim(),
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      platforms: selectedPlatforms,
      status: status,
      notes: notes
    };

    onSaveCalendarEvent(newEvent);
    setShowAddModal(false);
    // Reset form
    setTitle("");
    setSelectedVideoId("");
    setNotes("");
  };

  // Group events by date
  const eventsByDate = {};
  calendarEvents.forEach(ev => {
    if (!eventsByDate[ev.scheduled_date]) {
      eventsByDate[ev.scheduled_date] = [];
    }
    eventsByDate[ev.scheduled_date].push(ev);
  });

  return (
    <div className="view-content">
      {/* Top Banner with Stats & Add Button */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "20px",
        background: "var(--bg-card)",
        padding: "16px 20px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-color)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Tổng lịch đăng</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-primary)" }}>{calendarEvents.length} video</div>
          </div>
          <div style={{ height: "30px", width: "1px", background: "var(--border-color)" }} />
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Đã xuất bản</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-green)" }}>
              {calendarEvents.filter(e => e.status === "published").length} video
            </div>
          </div>
          <div style={{ height: "30px", width: "1px", background: "var(--border-color)" }} />
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Mục tiêu tuần</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-cyan)" }}>14 video (2 video/ngày)</div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Icon name="plus" size={16} color="#fff" />
          <span>Lên Lịch Video Mới</span>
        </button>
      </div>

      {/* 7-Day Calendar Columns */}
      <div className="calendar-grid">
        {weekDays.map((day) => {
          const dayEvents = eventsByDate[day.iso] || [];

          return (
            <div
              key={day.iso}
              className="calendar-day-col"
              style={day.isToday ? { borderColor: "var(--accent-primary)", background: "rgba(139,92,246,0.03)" } : {}}
            >
              {/* Day Header */}
              <div className="calendar-day-header" style={day.isToday ? { background: "rgba(139,92,246,0.15)" } : {}}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: day.isToday ? "var(--accent-primary)" : "var(--text-primary)" }}>
                  {day.name}
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {day.dateStr} {day.isToday && "(Hôm nay)"}
                </div>
              </div>

              {/* Day Events */}
              <div className="calendar-events-list">
                {dayEvents.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "11.5px", padding: "24px 0" }}>
                    Chưa có lịch
                  </div>
                ) : (
                  dayEvents.map((ev) => {
                    const linkedVideo = videos.find(v => v.id === ev.video_id);

                    return (
                      <div key={ev.id} className="schedule-card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                            ⏰ {ev.scheduled_time || "19:00"}
                          </span>
                          <span style={{
                            fontSize: "10px",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: ev.status === "published" ? "rgba(16,185,129,0.2)" : "rgba(139,92,246,0.2)",
                            color: ev.status === "published" ? "var(--accent-green)" : "var(--accent-primary)"
                          }}>
                            {ev.status === "published" ? "Đã đăng" : "Đã hẹn"}
                          </span>
                        </div>

                        {/* Title */}
                        <div
                          style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", cursor: linkedVideo ? "pointer" : "default" }}
                          onClick={() => linkedVideo && onSelectVideoForDetail(linkedVideo)}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>

                        {/* Platform target badges */}
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                          {(ev.platforms || []).map((p, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: "10px",
                                background: "rgba(255,255,255,0.06)",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                color: "var(--text-secondary)"
                              }}
                            >
                              {p.replace("_", " ")}
                            </span>
                          ))}
                        </div>

                        {/* Delete btn */}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                          <button
                            className="icon-btn danger"
                            style={{ padding: "3px" }}
                            title="Xóa khỏi lịch"
                            onClick={() => onDeleteCalendarEvent(ev.id)}
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Schedule Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Lên Lịch Đăng Video</h3>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEvent}>
              <div className="modal-body">
                {/* Pick from Vault */}
                <div className="form-group">
                  <label className="form-label">Chọn Video từ Kho (Hoặc nhập tự do)</label>
                  <select
                    className="form-select"
                    value={selectedVideoId}
                    onChange={(e) => handleVideoSelect(e.target.value)}
                  >
                    <option value="">-- Nhập tiêu đề độc lập --</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>
                        [{v.platform?.toUpperCase()}] {v.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Tiêu đề bài đăng / Nội dung</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VD: Highlight trận chung kết thế giới 2026"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Ngày đăng</label>
                    <input
                      type="date"
                      className="form-input"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Giờ đăng (Khung giờ vàng)</label>
                    <input
                      type="time"
                      className="form-input"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Platform Checkboxes */}
                <div className="form-group">
                  <label className="form-label">Các kênh phân phối</label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {channelOptions.map(ch => {
                      const isChecked = selectedPlatforms.includes(ch.id);
                      return (
                        <div
                          key={ch.id}
                          onClick={() => togglePlatform(ch.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: `1px solid ${isChecked ? "var(--accent-primary)" : "var(--border-color)"}`,
                            background: isChecked ? "rgba(139,92,246,0.15)" : "transparent",
                            cursor: "pointer",
                            fontSize: "12.5px"
                          }}
                        >
                          <Icon name={ch.icon} size={14} />
                          <span>{ch.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select
                    className="form-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="scheduled">Đã lên lịch (Scheduled)</option>
                    <option value="draft">Bản nháp (Draft)</option>
                    <option value="published">Đã đăng tải (Published)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ghi chú lưu ý khi đăng</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: "60px", fontSize: "12.5px" }}
                    placeholder="Nhớ gắn link bio, bật nhạc nền trending..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  <Icon name="check" size={15} color="#fff" />
                  <span>Lưu Lịch Đăng</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
