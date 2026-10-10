import React, { useState } from "react";
import { Icon } from "../Icons";
import { MEDIA_BASE } from "../../api";
import { STATUS_CONFIG, PLATFORM_CONFIG, normalizeStatus, formatTimeDiff, formatDuration, toLocalDateString } from "./PlannerConstants";
import ScheduleDetailPanel from "./ScheduleDetailPanel";
import ConfirmModal from "../ConfirmModal";

export default function DayView({
  selectedDate,
  onSelectDate,
  events,
  videos,
  selectedEventId,
  onSelectEvent,
  selectedPlatforms,
  onTogglePlatformFilter,
  onEditEvent,
  onCreateEvent,
  onConfirmPublished,
  onRescheduleEvent,
  onDeleteEvent,
  onOpenExportModal,
  onSelectVideoForDetail
}) {
  // 1. Mini Calendar generation for Left Column
  const currYear = selectedDate.getFullYear();
  const currMonth = selectedDate.getMonth(); // 0-indexed
  const firstDayOfMonth = new Date(currYear, currMonth, 1);
  const lastDayOfMonth = new Date(currYear, currMonth + 1, 0);
  
  // Day of week for 1st of month: 0 (Sun) to 6 (Sat)
  // Convert so Monday is 0, Sunday is 6
  const startDay = (firstDayOfMonth.getDay() + 6) % 7;
  const totalDays = lastDayOfMonth.getDate();

  const daysGrid = [];
  // Empty cells before first day
  for (let i = 0; i < startDay; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    daysGrid.push(d);
  }

  const handlePrevMonth = () => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() - 1);
    onSelectDate(next);
  };

  const handleNextMonth = () => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() + 1);
    onSelectDate(next);
  };

  const isSameDay = (dNum) => {
    if (!dNum) return false;
    return (
      selectedDate.getDate() === dNum &&
      selectedDate.getMonth() === currMonth &&
      selectedDate.getFullYear() === currYear
    );
  };

  const handlePickDay = (dNum) => {
    if (!dNum) return;
    const next = new Date(currYear, currMonth, dNum);
    onSelectDate(next);
  };

  // 2. Filter events for selected day & platform
  const selectedDateIso = toLocalDateString(selectedDate);
  const dayEvents = events.filter((ev) => ev.scheduled_date === selectedDateIso);

  // Platform counts for selected day
  const platformCounts = {};
  Object.keys(PLATFORM_CONFIG).forEach((p) => {
    platformCounts[p] = dayEvents.filter((ev) => {
      const pArr = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
      return pArr.includes(p);
    }).length;
  });

  // Filtered timeline items
  const filteredDayEvents = dayEvents
    .filter((ev) => {
      if (selectedPlatforms.length === 0) return true;
      const pArr = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
      return pArr.some((p) => selectedPlatforms.includes(p));
    })
    .sort((a, b) => (a.scheduled_time || "00:00").localeCompare(b.scheduled_time || "00:00"));

  // Dates with events in current month for dots
  const datesWithEvents = new Set();
  events.forEach((ev) => {
    if (ev.scheduled_date) {
      const parts = ev.scheduled_date.split("-").map(Number);
      if (parts[0] === currYear && parts[1] === currMonth + 1) {
        datesWithEvents.add(parts[2]);
      }
    }
  });

  // Selected event for detail panel (MUST be from the current day's events)
  const activeEvent = filteredDayEvents.find((e) => e.id === selectedEventId) || filteredDayEvents[0] || null;
  const activeVideo = activeEvent ? videos.find((v) => v.id === activeEvent.video_id) : null;

  // Multi-selection state for removing events
  const [selectedEventIds, setSelectedEventIds] = useState([]);

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: "danger",
    title: "",
    message: "",
    confirmText: "Xác nhận loại bỏ",
    cancelText: "Hủy bỏ",
    onConfirm: null
  });

  const handleToggleSelectEvent = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedEventIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllDayEvents = () => {
    if (selectedEventIds.length === filteredDayEvents.length && filteredDayEvents.length > 0) {
      setSelectedEventIds([]);
    } else {
      setSelectedEventIds(filteredDayEvents.map((ev) => ev.id));
    }
  };

  const handleBatchDelete = () => {
    if (selectedEventIds.length === 0) return;
    const count = selectedEventIds.length;
    setConfirmDialog({
      isOpen: true,
      type: "danger",
      title: "Xác Nhận Loại Bỏ",
      message: `Bạn có chắc chắn muốn loại bỏ ${count} bài đăng đã chọn khỏi lịch đăng bài?`,
      confirmText: `Loại bỏ (${count})`,
      onConfirm: () => {
        if (onDeleteEvent) {
          onDeleteEvent(selectedEventIds);
          setSelectedEventIds([]);
        }
      }
    });
  };

  const handleDeleteSingle = (id, e) => {
    if (e) e.stopPropagation();
    const ev = dayEvents.find((x) => x.id === id);
    const evTitle = ev?.title ? ` "${ev.title}"` : "";
    setConfirmDialog({
      isOpen: true,
      type: "danger",
      title: "Xác Nhận Loại Bỏ",
      message: `Bạn có chắc chắn muốn loại bỏ bài đăng${evTitle} khỏi lịch đăng bài?`,
      confirmText: "Loại bỏ",
      onConfirm: () => {
        if (onDeleteEvent) {
          onDeleteEvent(id);
          setSelectedEventIds((prev) => prev.filter((item) => item !== id));
        }
      }
    });
  };

  return (
    <div
      className="planner-day-layout"
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 320px",
        gap: "14px",
        height: "calc(100vh - 270px)",
        minHeight: "560px"
      }}
    >
      {/* LEFT COLUMN: Mini Calendar + Platform Filter */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          height: "100%",
          overflowY: "auto"
        }}
      >
        {/* Mini Calendar Card */}
        <div
          style={{
            background: "#0c101b",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)"
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px"
            }}
          >
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#fff" }}>
              Tháng {currMonth + 1}, {currYear}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <button
                type="button"
                className="icon-btn"
                onClick={handlePrevMonth}
                style={{ width: "22px", height: "22px" }}
              >
                <Icon name="chevronDown" size={12} style={{ transform: "rotate(90deg)" }} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={handleNextMonth}
                style={{ width: "22px", height: "22px" }}
              >
                <Icon name="chevronDown" size={12} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "2px",
              textAlign: "center",
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--text-muted)",
              marginBottom: "6px"
            }}
          >
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((dayName) => (
              <div key={dayName}>{dayName}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "3px",
              textAlign: "center"
            }}
          >
            {daysGrid.map((dNum, idx) => {
              if (!dNum) {
                return <div key={`empty_${idx}`} style={{ height: "26px" }} />;
              }
              const isSelected = isSameDay(dNum);
              return (
                <button
                  key={`day_${dNum}`}
                  type="button"
                  onClick={() => handlePickDay(dNum)}
                  style={{
                    height: "28px",
                    borderRadius: "6px",
                    border: "none",
                    outline: "none",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? "#fff" : "var(--text-secondary)",
                    background: isSelected
                      ? "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)"
                      : "transparent",
                    boxShadow: isSelected ? "0 2px 8px rgba(139, 92, 246, 0.4)" : "none",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative"
                  }}
                >
                  <span>{dNum}</span>
                  {datesWithEvents.has(dNum) && !isSelected && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: "2px",
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        background: "#c084fc"
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Platform Filter Card */}
        <div
          style={{
            background: "#0c101b",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)"
          }}
        >
          <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>
            Lọc theo nền tảng
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {Object.entries(PLATFORM_CONFIG).map(([pId, cfg]) => {
              const isChecked = selectedPlatforms.includes(pId);
              const count = platformCounts[pId] || 0;
              return (
                <div
                  key={pId}
                  onClick={() => onTogglePlatformFilter(pId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 6px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: isChecked ? "rgba(255, 255, 255, 0.03)" : "transparent",
                    transition: "background 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      style={{ cursor: "pointer", accentColor: "#8b5cf6" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Icon name={cfg.icon} size={14} color={cfg.color} />
                      <span style={{ fontSize: "11.5px", color: isChecked ? "#fff" : "var(--text-secondary)" }}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CENTER COLUMN: Day Timeline */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "12px",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          height: "100%",
          boxSizing: "border-box",
          overflowY: "auto",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)"
        }}
      >
        {/* Date header & Batch actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            paddingBottom: "12px",
            flexWrap: "wrap",
            gap: "10px"
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#fff" }}>
              {selectedDate.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h3>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {filteredDayEvents.length} video được lên lịch trong ngày này
            </span>
          </div>

          {filteredDayEvents.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {selectedEventIds.length > 0 && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleBatchDelete}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "rgba(239, 68, 68, 0.15)",
                    borderColor: "rgba(239, 68, 68, 0.4)",
                    color: "#f87171"
                  }}
                  title="Loại bỏ các video đã chọn khỏi lịch"
                >
                  <Icon name="trash" size={13} color="#f87171" />
                  <span>Loại bỏ khỏi lịch ({selectedEventIds.length})</span>
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSelectAllDayEvents}
                style={{
                  padding: "4px 10px",
                  fontSize: "11px",
                  height: "28px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "3px",
                    border:
                      selectedEventIds.length > 0 &&
                      selectedEventIds.length === filteredDayEvents.length
                        ? "1px solid #a855f7"
                        : "1px solid rgba(255, 255, 255, 0.3)",
                    background:
                      selectedEventIds.length > 0 &&
                      selectedEventIds.length === filteredDayEvents.length
                        ? "#a855f7"
                        : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {selectedEventIds.length > 0 &&
                    selectedEventIds.length === filteredDayEvents.length && (
                      <Icon name="check" size={10} color="#fff" />
                    )}
                </div>
                <span>
                  {selectedEventIds.length > 0 &&
                  selectedEventIds.length === filteredDayEvents.length
                    ? "Bỏ chọn tất cả"
                    : "Chọn tất cả"}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Timeline Items */}
        {filteredDayEvents.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "var(--text-muted)",
              textAlign: "center",
              gap: "8px"
            }}
          >
            <Icon name="calendar" size={32} color="var(--text-muted)" />
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
              Không có lịch đăng nào cho ngày này
            </div>
            <div style={{ fontSize: "11.5px" }}>
              Chưa có video nào được lên lịch cho ngày này
            </div>
            {onCreateEvent && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onCreateEvent(selectedDate)}
                style={{
                  marginTop: "6px",
                  padding: "6px 16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                  boxShadow: "0 2px 10px rgba(139, 92, 246, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Icon name="plus" size={14} color="#fff" />
                <span>+ Lên Lịch Video Cho Ngày Này</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredDayEvents.map((ev) => {
              const statusObj = normalizeStatus(ev);
              const isSelected = ev.id === activeEvent?.id;
              const platforms = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
              const timeDiffText = formatTimeDiff(ev);

              const thumbSrc = ev.drive_file_id
                ? `/api/drive/thumbnail/${ev.drive_file_id}`
                : (ev.local_thumbnail
                    ? `${MEDIA_BASE}/thumbnails/${ev.local_thumbnail.split(/[\\/]/).pop()}`
                    : (ev.thumbnail_url || "/placeholder.png"));

              let parsedNotes = {};
              if (typeof ev.notes === "string" && ev.notes.startsWith("{")) {
                try {
                  parsedNotes = JSON.parse(ev.notes);
                } catch (e) {}
              }
              const hashtags = ev.hashtags || parsedNotes.hashtags || "";

              const isChecked = selectedEventIds.includes(ev.id);

              return (
                <div
                  key={ev.id}
                  onClick={() => onSelectEvent(ev.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px 58px 46px 1fr auto auto auto",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    background: isChecked
                      ? "rgba(239, 68, 68, 0.08)"
                      : isSelected
                      ? "rgba(139, 92, 246, 0.1)"
                      : "rgba(255, 255, 255, 0.02)",
                    border: isChecked
                      ? "1px solid rgba(239, 68, 68, 0.35)"
                      : isSelected
                      ? "1px solid rgba(139, 92, 246, 0.4)"
                      : "1px solid rgba(255, 255, 255, 0.05)",
                    borderLeft: `4px solid ${isChecked ? "#ef4444" : statusObj.color}`,
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  {/* Checkbox */}
                  <div
                    onClick={(e) => handleToggleSelectEvent(ev.id, e)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                    title={isChecked ? "Bỏ chọn" : "Tích chọn để loại bỏ"}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "4px",
                        border: isChecked
                          ? "1.5px solid #ef4444"
                          : "1.5px solid rgba(255, 255, 255, 0.35)",
                        background: isChecked ? "#ef4444" : "rgba(255, 255, 255, 0.05)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {isChecked && <Icon name="check" size={11} color="#fff" />}
                    </div>
                  </div>
                  {/* Time */}
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                    {ev.scheduled_time || "19:00"}
                  </div>

                  {/* Thumbnail */}
                  <div
                    style={{
                      width: "44px",
                      height: "34px",
                      borderRadius: "6px",
                      overflow: "hidden",
                      background: "#000",
                      position: "relative",
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

                  {/* Video Title & Hashtag preview */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                    {hashtags && (
                      <div
                        style={{
                          fontSize: "10.5px",
                          color: "#38bdf8",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: "2px"
                        }}
                      >
                        {hashtags}
                      </div>
                    )}
                  </div>

                  {/* Platform Badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {platforms.map((p) => {
                      const cfg = PLATFORM_CONFIG[p] || { label: p, color: "#fff", icon: "globe" };
                      return (
                        <div
                          key={p}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "6px",
                            padding: "3px 8px",
                            fontSize: "10.5px",
                            color: cfg.color
                          }}
                        >
                          <Icon name={cfg.icon} size={12} color={cfg.color} />
                          <span>{cfg.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Status Badge */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        background: statusObj.bg,
                        border: `1px solid ${statusObj.border}`,
                        borderRadius: "6px",
                        padding: "3px 8px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        color: statusObj.color
                      }}
                    >
                      <span>{statusObj.badge}</span>
                      <span>{statusObj.label}</span>
                    </div>
                    {/* Time diff hint (e.g. Còn 2 giờ 15 phút, Trễ 1 giờ 30 phút) */}
                    {(statusObj.id === "UPCOMING" || statusObj.id === "MISSED") && timeDiffText && (
                      <span style={{ fontSize: "9.5px", color: statusObj.color }}>
                        {timeDiffText}
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {statusObj.id === "PUBLISHED_MANUALLY" ? (
                      ev.published_url ? (
                        <a
                          href={ev.published_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{
                            padding: "4px 10px",
                            fontSize: "10.5px",
                            height: "26px",
                            borderRadius: "6px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            textDecoration: "none"
                          }}
                        >
                          <Icon name="externalLink" size={11} />
                          <span>Xem bài đăng</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onConfirmPublished(ev)}
                          style={{ padding: "4px 10px", fontSize: "10.5px", height: "26px", borderRadius: "6px" }}
                        >
                          Gắn link
                        </button>
                      )
                    ) : statusObj.id === "DUE" ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onConfirmPublished(ev)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "10.5px",
                          height: "26px",
                          borderRadius: "6px",
                          background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)"
                        }}
                      >
                        Đánh dấu đã đăng
                      </button>
                    ) : statusObj.id === "MISSED" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onConfirmPublished(ev)}
                          style={{ padding: "4px 10px", fontSize: "10.5px", height: "26px", borderRadius: "6px" }}
                        >
                          Đánh dấu đã đăng
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onRescheduleEvent(ev)}
                          style={{ padding: "4px 8px", fontSize: "10.5px", height: "26px", borderRadius: "6px" }}
                        >
                          Đổi lịch
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onConfirmPublished(ev)}
                        style={{ padding: "4px 10px", fontSize: "10.5px", height: "26px", borderRadius: "6px" }}
                      >
                        Đánh dấu đã đăng
                      </button>
                    )}

                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onEditEvent(ev)}
                      style={{ width: "26px", height: "26px", borderRadius: "6px" }}
                      title="Chỉnh sửa lịch"
                    >
                      <Icon name="edit" size={12} />
                    </button>

                    <button
                      type="button"
                      className="icon-btn"
                      onClick={(e) => handleDeleteSingle(ev.id, e)}
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "6px",
                        color: "#ef4444",
                        borderColor: "rgba(239, 68, 68, 0.25)",
                        background: "rgba(239, 68, 68, 0.06)"
                      }}
                      title="Loại bỏ khỏi lịch đăng"
                    >
                      <Icon name="trash" size={12} color="#ef4444" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: ScheduleDetailPanel */}
      <div style={{ height: "100%" }}>
        <ScheduleDetailPanel
          event={activeEvent}
          video={activeVideo}
          onEdit={onEditEvent}
          onCreate={() => onCreateEvent && onCreateEvent(selectedDate)}
          onConfirmPublished={onConfirmPublished}
          onReschedule={onRescheduleEvent}
          onOpenExportModal={onOpenExportModal}
          onDelete={(id) => handleDeleteSingle(id)}
          onSelectVideoForDetail={onSelectVideoForDetail}
        />
      </div>

      {/* Custom Confirmation Dialog */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        type={confirmDialog.type}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
