import React, { useState } from "react";
import { Icon } from "../Icons";
import { MEDIA_BASE } from "../../api";
import { STATUS_CONFIG, PLATFORM_CONFIG, normalizeStatus } from "./PlannerConstants";

export default function ListView({
  events,
  videos,
  onSelectEvent,
  onEditEvent,
  onConfirmPublished,
  onRescheduleEvent,
  onDeleteEvent
}) {
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const filteredEvents = events.filter((ev) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = (ev.title || "").toLowerCase().includes(q);
      const matchNote = (ev.notes || "").toLowerCase().includes(q);
      const matchCaption = (ev.caption || "").toLowerCase().includes(q);
      if (!matchTitle && !matchNote && !matchCaption) return false;
    }
    if (selectedStatus !== "all") {
      const st = normalizeStatus(ev).id;
      if (st !== selectedStatus) return false;
    }
    return true;
  }).sort((a, b) => {
    const dComp = (b.scheduled_date || "").localeCompare(a.scheduled_date || "");
    if (dComp !== 0) return dComp;
    return (b.scheduled_time || "").localeCompare(a.scheduled_time || "");
  });

  return (
    <div
      style={{
        background: "#0c101b",
        border: "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)"
      }}
    >
      {/* Top Search & Filter bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, maxWidth: "360px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "8px",
              padding: "6px 10px",
              width: "100%"
            }}
          >
            <Icon name="search" size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Tìm video, caption, hashtag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                color: "#fff",
                fontSize: "11.5px",
                width: "100%"
              }}
            />
            {search && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSearch("")}
                style={{ width: "16px", height: "16px" }}
              >
                <Icon name="x" size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Status Filter buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setSelectedStatus("all")}
            style={{
              border: "none",
              outline: "none",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: selectedStatus === "all" ? 700 : 500,
              cursor: "pointer",
              background: selectedStatus === "all" ? "#8b5cf6" : "rgba(255, 255, 255, 0.04)",
              color: selectedStatus === "all" ? "#fff" : "var(--text-secondary)"
            }}
          >
            Tất cả ({events.length})
          </button>

          {Object.values(STATUS_CONFIG).map((cfg) => {
            const isAct = selectedStatus === cfg.id;
            return (
              <button
                key={cfg.id}
                type="button"
                onClick={() => setSelectedStatus(cfg.id)}
                style={{
                  border: isAct ? `1px solid ${cfg.border}` : "1px solid transparent",
                  outline: "none",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: isAct ? 700 : 500,
                  cursor: "pointer",
                  background: isAct ? cfg.bg : "rgba(255, 255, 255, 0.04)",
                  color: isAct ? cfg.color : "var(--text-secondary)"
                }}
              >
                {cfg.badge} {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "11.5px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-muted)" }}>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Ngày</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Giờ</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Video</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Nền tảng</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Trạng thái</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Thời gian thực tế</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Link bài đăng</th>
              <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                  Không tìm thấy lịch đăng nào phù hợp
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => {
                const statusObj = normalizeStatus(ev);
                const platforms = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
                const thumbSrc = ev.drive_file_id
                  ? `/api/drive/thumbnail/${ev.drive_file_id}`
                  : (ev.local_thumbnail
                      ? `${MEDIA_BASE}/thumbnails/${ev.local_thumbnail.split(/[\\/]/).pop()}`
                      : (ev.thumbnail_url || "/placeholder.png"));

                return (
                  <tr
                    key={ev.id}
                    onClick={() => onSelectEvent(ev.id)}
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                      cursor: "pointer",
                      transition: "background 0.15s ease"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Ngày */}
                    <td style={{ padding: "10px", color: "#fff", fontWeight: 600 }}>
                      {ev.scheduled_date}
                    </td>

                    {/* Giờ */}
                    <td style={{ padding: "10px", color: "#c084fc", fontWeight: 700 }}>
                      {ev.scheduled_time || "19:00"}
                    </td>

                    {/* Video */}
                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", maxWidth: "260px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "28px",
                            borderRadius: "4px",
                            overflow: "hidden",
                            background: "#000",
                            flexShrink: 0
                          }}
                        >
                          <img
                            src={thumbSrc}
                            alt={ev.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = "/placeholder.png";
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontWeight: 600,
                            color: "#fff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                          title={ev.title}
                        >
                          {ev.title}
                        </span>
                      </div>
                    </td>

                    {/* Nền tảng */}
                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {platforms.map((p) => {
                          const cfg = PLATFORM_CONFIG[p] || { label: p, color: "#fff", icon: "globe" };
                          return (
                            <span
                              key={p}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                background: "rgba(255, 255, 255, 0.04)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                fontSize: "10px",
                                color: cfg.color
                              }}
                            >
                              <Icon name={cfg.icon} size={11} color={cfg.color} />
                              <span>{cfg.label}</span>
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: statusObj.bg,
                          border: `1px solid ${statusObj.border}`,
                          color: statusObj.color,
                          borderRadius: "4px",
                          padding: "2px 6px",
                          fontSize: "10px",
                          fontWeight: 700
                        }}
                      >
                        {statusObj.badge} {statusObj.label}
                      </span>
                    </td>

                    {/* Thời gian thực tế */}
                    <td style={{ padding: "10px", color: ev.published_at ? "#34d399" : "var(--text-muted)" }}>
                      {ev.published_at ? new Date(ev.published_at).toLocaleString("vi-VN") : "-"}
                    </td>

                    {/* Link bài đăng */}
                    <td style={{ padding: "10px" }}>
                      {ev.published_url ? (
                        <a
                          href={ev.published_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            color: "#38bdf8",
                            textDecoration: "underline",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            maxWidth: "140px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          <Icon name="externalLink" size={11} />
                          <span>Mở bài đăng</span>
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td style={{ padding: "10px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                        {statusObj.id !== "PUBLISHED_MANUALLY" && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => onConfirmPublished(ev)}
                            style={{ padding: "3px 8px", fontSize: "10.5px", height: "24px", borderRadius: "5px" }}
                          >
                            Đánh dấu đã đăng
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => onEditEvent(ev)}
                          style={{ width: "24px", height: "24px", borderRadius: "5px" }}
                          title="Chỉnh sửa"
                        >
                          <Icon name="edit" size={11} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => onDeleteEvent(ev.id)}
                          style={{ width: "24px", height: "24px", borderRadius: "5px", color: "#f87171" }}
                          title="Xóa lịch"
                        >
                          <Icon name="trash" size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
