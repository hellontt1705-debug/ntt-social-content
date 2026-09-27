import React from "react";
import { Icon } from "../Icons";
import { MEDIA_BASE } from "../../api";
import { STATUS_CONFIG, PLATFORM_CONFIG, normalizeStatus, toLocalDateString } from "./PlannerConstants";

export default function MonthView({
  selectedDate,
  onSelectDate,
  events,
  onSwitchToDayView,
  onSelectEvent
}) {
  const currYear = selectedDate.getFullYear();
  const currMonth = selectedDate.getMonth(); // 0-indexed

  // 1st day of the month & total days
  const firstDayOfMonth = new Date(currYear, currMonth, 1);
  const lastDayOfMonth = new Date(currYear, currMonth + 1, 0);

  // Monday is 0, Sunday is 6
  const startDay = (firstDayOfMonth.getDay() + 6) % 7;
  const totalDays = lastDayOfMonth.getDate();

  // Days from previous month to fill the first row
  const prevMonthLastDay = new Date(currYear, currMonth, 0).getDate();
  const calendarCells = [];

  for (let i = startDay - 1; i >= 0; i--) {
    const dNum = prevMonthLastDay - i;
    const prevDate = new Date(currYear, currMonth - 1, dNum);
    calendarCells.push({
      dateNum: dNum,
      isCurrentMonth: false,
      iso: toLocalDateString(prevDate),
      dateObj: prevDate
    });
  }

  // Days in current month
  for (let d = 1; d <= totalDays; d++) {
    const curDate = new Date(currYear, currMonth, d);
    const iso = toLocalDateString(curDate);
    calendarCells.push({
      dateNum: d,
      isCurrentMonth: true,
      iso,
      dateObj: curDate
    });
  }

  // Fill remaining cells of last week row
  const remaining = 7 - (calendarCells.length % 7);
  if (remaining < 7) {
    for (let r = 1; r <= remaining; r++) {
      const nextDate = new Date(currYear, currMonth + 1, r);
      calendarCells.push({
        dateNum: r,
        isCurrentMonth: false,
        iso: toLocalDateString(nextDate),
        dateObj: nextDate
      });
    }
  }

  // Group events by ISO date and calculate status counts
  const eventsByDate = {};
  events.forEach((ev) => {
    if (!eventsByDate[ev.scheduled_date]) {
      eventsByDate[ev.scheduled_date] = [];
    }
    eventsByDate[ev.scheduled_date].push(ev);
  });

  const selectedIso = toLocalDateString(selectedDate);
  const selectedDayEvents = eventsByDate[selectedIso] || [];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gap: "14px",
        height: "calc(100vh - 270px)",
        minHeight: "560px"
      }}
    >
      {/* LEFT: 7-Column Month Grid */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
          overflowY: "auto"
        }}
      >
        {/* Day of Week Headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: "6px",
            textAlign: "center",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--text-secondary)",
            paddingBottom: "6px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)"
          }}
        >
          {["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"].map((dayName) => (
            <div key={dayName}>{dayName}</div>
          ))}
        </div>

        {/* Calendar Cells */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: "6px",
            flex: 1
          }}
        >
          {calendarCells.map((cell) => {
            const cellEvents = eventsByDate[cell.iso] || [];
            const isSelected = cell.iso === selectedIso;
            const isToday = cell.iso === toLocalDateString(new Date());

            // Count statuses
            let planned = 0;
            let published = 0;
            let missed = 0;
            let dueOrUpcoming = 0;

            cellEvents.forEach((ev) => {
              const st = normalizeStatus(ev).id;
              if (st === "PUBLISHED_MANUALLY") published++;
              else if (st === "MISSED") missed++;
              else if (st === "DUE" || st === "UPCOMING") dueOrUpcoming++;
              else planned++;
            });

            return (
              <div
                key={cell.iso}
                onClick={() => onSelectDate(cell.dateObj)}
                style={{
                  background: isSelected
                    ? "rgba(139, 92, 246, 0.15)"
                    : cell.isCurrentMonth
                    ? "rgba(255, 255, 255, 0.02)"
                    : "rgba(255, 255, 255, 0.005)",
                  border: isSelected
                    ? "1.5px solid rgba(139, 92, 246, 0.6)"
                    : isToday
                    ? "1px solid rgba(56, 189, 248, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "8px",
                  padding: "6px 8px",
                  minHeight: "60px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  opacity: cell.isCurrentMonth ? 1 : 0.45,
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? "0 0 15px rgba(139, 92, 246, 0.2)" : "none"
                }}
              >
                {/* Date number */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: isSelected || isToday ? 700 : 500,
                      color: isSelected ? "#c084fc" : isToday ? "#38bdf8" : "#fff"
                    }}
                  >
                    {cell.dateNum}
                  </span>
                </div>

                {/* Compact Indicators */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "3px" }}>
                  {planned > 0 && (
                    <div style={{ fontSize: "10px", color: "#c084fc", fontWeight: 700, display: "flex", alignItems: "center", gap: "2px" }}>
                      <span>🟣</span>
                      <span>{planned}</span>
                    </div>
                  )}
                  {published > 0 && (
                    <div style={{ fontSize: "10px", color: "#34d399", fontWeight: 700, display: "flex", alignItems: "center", gap: "2px" }}>
                      <span>🟢</span>
                      <span>{published}</span>
                    </div>
                  )}
                  {missed > 0 && (
                    <div style={{ fontSize: "10px", color: "#f87171", fontWeight: 700, display: "flex", alignItems: "center", gap: "2px" }}>
                      <span>🔴</span>
                      <span>{missed}</span>
                    </div>
                  )}
                  {dueOrUpcoming > 0 && (
                    <div style={{ fontSize: "10px", color: "#38bdf8", fontWeight: 700, display: "flex", alignItems: "center", gap: "2px" }}>
                      <span>🔵</span>
                      <span>{dueOrUpcoming}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            paddingTop: "10px",
            marginTop: "6px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {Object.values(STATUS_CONFIG).map((cfg) => (
              <div key={cfg.id} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
                <span>{cfg.badge}</span>
                <span>{cfg.label}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Tổng cộng: <strong style={{ color: "#fff" }}>{events.length}</strong> lịch đăng
          </div>
        </div>
      </div>

      {/* RIGHT: Selected Day Summary Panel */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
          overflowY: "auto"
        }}
      >
        {/* Day Header */}
        <div style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "10px" }}>
          <h4 style={{ margin: 0, fontSize: "13.5px", fontWeight: 700, color: "#fff" }}>
            {selectedDate.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
          </h4>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
            Tổng: <strong style={{ color: "#fff" }}>{selectedDayEvents.length}</strong> video
          </div>
        </div>

        {/* List of videos for this day */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflowY: "auto" }}>
          {selectedDayEvents.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "11.5px", marginTop: "20px" }}>
              Không có video nào lên lịch trong ngày này
            </div>
          ) : (
            selectedDayEvents.map((ev) => {
              const platforms = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
              const firstPlatform = platforms[0] || "tiktok";
              const platCfg = PLATFORM_CONFIG[firstPlatform] || { icon: "globe", color: "#fff", label: "Mạng xã hội" };

              const thumbSrc = ev.drive_file_id
                ? `/api/drive/thumbnail/${ev.drive_file_id}`
                : (ev.local_thumbnail
                    ? `${MEDIA_BASE}/thumbnails/${ev.local_thumbnail.split(/[\\/]/).pop()}`
                    : (ev.thumbnail_url || "/placeholder.png"));

              return (
                <div
                  key={ev.id}
                  onClick={() => onSelectEvent(ev.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "8px",
                    padding: "6px 8px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "30px",
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

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#c084fc" }}>
                      {ev.scheduled_time || "10:00"}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {ev.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                      <Icon name={platCfg.icon} size={10} color={platCfg.color} />
                      <span style={{ fontSize: "9.5px", color: "var(--text-muted)" }}>{platCfg.label}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Jump to Day View Button */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSwitchToDayView}
          style={{
            marginTop: "auto",
            width: "100%",
            height: "32px",
            fontSize: "11.5px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            flexShrink: 0
          }}
        >
          <span>Xem chi tiết ngày</span>
          <Icon name="arrowRight" size={13} />
        </button>
      </div>
    </div>
  );
}
