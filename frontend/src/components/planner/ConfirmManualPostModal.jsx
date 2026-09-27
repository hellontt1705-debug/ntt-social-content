import React, { useState, useEffect } from "react";
import { Icon } from "../Icons";
import { MEDIA_BASE } from "../../api";
import { PLATFORM_CONFIG } from "./PlannerConstants";

export default function ConfirmManualPostModal({
  isOpen,
  onClose,
  event,
  video,
  onConfirm
}) {
  const [actualDate, setActualDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [actualTime, setActualTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  });
  const [publishedUrl, setPublishedUrl] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && event) {
      const now = new Date();
      setActualDate(now.toISOString().split("T")[0]);
      setActualTime(`${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`);
      setPublishedUrl(event.published_url || "");
      setManualNote(event.manual_note || "");
    }
  }, [isOpen, event]);

  if (!isOpen || !event) return null;

  const platforms = Array.isArray(event.platforms) ? event.platforms : [event.platform || "tiktok"];
  const thumbSrc = event.drive_file_id
    ? `/api/drive/thumbnail/${event.drive_file_id}`
    : (event.local_thumbnail
        ? `${MEDIA_BASE}/thumbnails/${event.local_thumbnail.split(/[\\/]/).pop()}`
        : (event.thumbnail_url || "/placeholder.png"));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const publishedAtIso = new Date(`${actualDate}T${actualTime}:00`).toISOString();
      await onConfirm(event.id, {
        published_at: publishedAtIso,
        published_url: publishedUrl.trim(),
        manual_note: manualNote.trim()
      });
      onClose();
    } catch (err) {
      alert("Lỗi khi xác nhận đăng bài: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(5, 6, 12, 0.8)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box"
      }}
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "500px",
          maxWidth: "94vw",
          background: "#10141f",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.15)",
          display: "flex",
          flexDirection: "column"
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
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "rgba(52, 211, 153, 0.15)",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#34d399"
              }}
            >
              <Icon name="checkCircle" size={17} color="#34d399" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                Xác nhận đã đăng thủ công
              </h3>
              <p style={{ margin: "1px 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
                Ghi nhận kết quả đăng bài thực tế trên mạng xã hội
              </p>
            </div>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            style={{ width: "26px", height: "26px", borderRadius: "6px" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Video Preview Summary */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "8px",
              padding: "8px 10px"
            }}
          >
            <div
              style={{
                width: "44px",
                height: "34px",
                borderRadius: "5px",
                overflow: "hidden",
                background: "#000",
                flexShrink: 0
              }}
            >
              <img
                src={thumbSrc}
                alt={event.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "/placeholder.png";
                }}
              />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#fff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {event.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                  Lịch dự kiến: {event.scheduled_date} {event.scheduled_time || "19:00"}
                </span>
                <span style={{ color: "rgba(255, 255, 255, 0.2)" }}>•</span>
                <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  {platforms.map((p) => {
                    const cfg = PLATFORM_CONFIG[p] || { label: p, color: "#fff" };
                    return (
                      <span key={p} style={{ fontSize: "10px", color: cfg.color, fontWeight: 600 }}>
                        {cfg.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Actual Date & Time Inputs */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Thời gian thực tế đã đăng <span style={{ color: "#f87171" }}>*</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <input
                type="date"
                required
                value={actualDate}
                onChange={(e) => setActualDate(e.target.value)}
                style={{
                  background: "#080a10",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "6px",
                  padding: "7px 10px",
                  color: "#fff",
                  fontSize: "11.5px",
                  outline: "none",
                  colorScheme: "dark"
                }}
              />
              <input
                type="time"
                required
                value={actualTime}
                onChange={(e) => setActualTime(e.target.value)}
                style={{
                  background: "#080a10",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "6px",
                  padding: "7px 10px",
                  color: "#fff",
                  fontSize: "11.5px",
                  outline: "none",
                  colorScheme: "dark"
                }}
              />
            </div>
          </div>

          {/* Published URL Input */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Link bài đăng thực tế (URL)
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "#080a10",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "6px",
                padding: "6px 10px"
              }}
            >
              <Icon name="link" size={13} color="#38bdf8" />
              <input
                type="url"
                placeholder="https://www.tiktok.com/@user/video/... hoặc https://youtube.com/shorts/..."
                value={publishedUrl}
                onChange={(e) => setPublishedUrl(e.target.value)}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "#fff",
                  fontSize: "11.5px",
                  width: "100%"
                }}
              />
            </div>
          </div>

          {/* Manual Note */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Ghi chú kết quả đăng bài
            </label>
            <textarea
              rows={2}
              placeholder="Nhập ghi chú (ví dụ: đăng lúc cao điểm, bài đăng nhận nhiều tim...)"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#080a10",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "6px",
                padding: "8px 10px",
                color: "#fff",
                fontSize: "11.5px",
                outline: "none",
                resize: "none"
              }}
            />
          </div>

          {/* Footer Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "8px",
              marginTop: "6px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              paddingTop: "12px"
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: "6px 14px", fontSize: "11.5px", borderRadius: "6px" }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{
                padding: "6px 16px",
                fontSize: "11.5px",
                fontWeight: 600,
                borderRadius: "6px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              <Icon name="checkCircle" size={14} color="#fff" />
              <span>{isSubmitting ? "Đang lưu..." : "✓ Xác nhận đã đăng"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
