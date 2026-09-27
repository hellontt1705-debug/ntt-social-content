import React, { useState, useRef } from "react";
import { Icon } from "../Icons";
import { MEDIA_BASE } from "../../api";
import {
  STATUS_CONFIG,
  PLATFORM_CONFIG,
  normalizeStatus,
  formatDuration,
  toLocalDateString
} from "./PlannerConstants";
import ConfirmModal from "../ConfirmModal";

export default function WeekView({
  selectedDate,
  onSelectDate,
  events = [],
  videos = [],
  categories = [],
  selectedEventId,
  onSelectEvent,
  onEditEvent,
  onCreateEvent,
  onConfirmPublished,
  onDeleteEvent,
  onRescheduleEvent,
  selectedPlatforms = ["tiktok", "youtube_shorts", "instagram_reels", "x", "douyin"],
  onTogglePlatformFilter,
  filterStatuses = [],
  setFilterStatuses,
  filterCategoryId = "all",
  setFilterCategoryId,
  searchQuery = "",
  setSearchQuery,
  onOpenExportModal
}) {
  // Local state for time filter pills in sidebar ("day" | "month" | "custom")
  const [filterPeriod, setFilterPeriod] = useState("month");
  const [filterMonth, setFilterMonth] = useState(() => selectedDate.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(() => selectedDate.getFullYear());
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const videoRef = useRef(null);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: "danger",
    title: "",
    message: "",
    confirmText: "Hủy lịch",
    cancelText: "Không",
    onConfirm: null
  });

  // Time slots for vertical axis (08:00 to 20:00 like in mockup)
  const timeSlots = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];

  // Calculate Monday of current week
  const curr = new Date(selectedDate);
  const dayOfWeek = curr.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(curr);
  monday.setDate(curr.getDate() + distanceToMonday);

  // Generate 7 days (Mon -> Sun)
  const weekDays = [];
  const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = toLocalDateString(d);
    const isToday = iso === toLocalDateString(new Date());
    const isSelected = iso === toLocalDateString(selectedDate);
    weekDays.push({
      name: dayNames[i],
      dateNum: d.getDate(),
      monthNum: d.getMonth() + 1,
      iso,
      isToday,
      isSelected,
      dateObj: d
    });
  }

  // Filter events according to active filters
  const filteredEvents = events.filter((ev) => {
    // 1. Platform filter
    if (selectedPlatforms && selectedPlatforms.length > 0) {
      const pArr = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
      if (!pArr.some((p) => selectedPlatforms.includes(p))) return false;
    }
    // 2. Status filter
    if (filterStatuses && filterStatuses.length > 0) {
      const st = normalizeStatus(ev).id;
      if (!filterStatuses.includes(st)) return false;
    }
    // 3. Category filter
    if (filterCategoryId && filterCategoryId !== "all") {
      const vid = videos.find((v) => v.id === ev.video_id);
      if (vid && vid.category_id !== filterCategoryId) return false;
    }
    // 4. Search query
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (ev.title || "").toLowerCase().includes(q);
      const capMatch = (ev.caption || "").toLowerCase().includes(q);
      const hashMatch = (ev.hashtags || "").toLowerCase().includes(q);
      if (!titleMatch && !capMatch && !hashMatch) return false;
    }
    return true;
  });

  // Group events by date and hour slot
  const eventsByDayAndSlot = {};
  weekDays.forEach((d) => {
    eventsByDayAndSlot[d.iso] = {};
    timeSlots.forEach((slot) => {
      eventsByDayAndSlot[d.iso][slot] = [];
    });
  });

  filteredEvents.forEach((ev) => {
    if (eventsByDayAndSlot[ev.scheduled_date]) {
      const time = ev.scheduled_time || "10:00";
      const hour = parseInt(time.split(":")[0], 10);

      // Find nearest slot
      let matchedSlot = "10:00";
      if (hour < 9) matchedSlot = "08:00";
      else if (hour < 11) matchedSlot = "10:00";
      else if (hour < 13) matchedSlot = "12:00";
      else if (hour < 15) matchedSlot = "14:00";
      else if (hour < 17) matchedSlot = "16:00";
      else if (hour < 19) matchedSlot = "18:00";
      else matchedSlot = "20:00";

      if (eventsByDayAndSlot[ev.scheduled_date][matchedSlot]) {
        eventsByDayAndSlot[ev.scheduled_date][matchedSlot].push(ev);
      }
    }
  });

  // Active selected event for detail panel
  const activeEvent = events.find((e) => e.id === selectedEventId) || null;
  const activeVideo = activeEvent ? videos.find((v) => v.id === activeEvent.video_id) : null;

  // Resolve thumbnail and media url for active event
  const getThumbnailSrc = (ev, vid) => {
    const driveId = vid?.drive_file_id || ev?.drive_file_id;
    if (driveId) return `/api/drive/thumbnail/${driveId}`;
    if (ev?.local_thumbnail) {
      const filename = ev.local_thumbnail.split(/[\\/]/).pop();
      return `${MEDIA_BASE}/thumbnails/${filename}`;
    }
    if (vid?.local_thumbnail) {
      const filename = vid.local_thumbnail.split(/[\\/]/).pop();
      return `${MEDIA_BASE}/thumbnails/${filename}`;
    }
    if (ev?.thumbnail_url && !ev.thumbnail_url.includes("googleusercontent.com/d/")) return ev.thumbnail_url;
    if (vid?.thumbnail_url && !vid.thumbnail_url.includes("googleusercontent.com/d/")) return vid.thumbnail_url;
    return "/placeholder.png";
  };

  const videoFilename = (activeVideo?.file_path || activeEvent?.file_path)
    ? (activeVideo?.file_path || activeEvent?.file_path).split(/[\\/]/).pop()
    : "";
  const videoStreamUrl = videoFilename ? `${MEDIA_BASE}/${videoFilename}` : (activeVideo?.video_url || activeEvent?.video_url || "");

  // Caption & hashtags
  let parsedNotes = {};
  if (typeof activeEvent?.notes === "string" && activeEvent.notes.startsWith("{")) {
    try {
      parsedNotes = JSON.parse(activeEvent.notes);
    } catch (e) {}
  }
  const caption = activeEvent?.caption || parsedNotes.caption || activeEvent?.title || "";
  const hashtags = activeEvent?.hashtags || parsedNotes.hashtags || "";

  // Reset filters
  const handleResetFilters = () => {
    if (onTogglePlatformFilter) {
      ["tiktok", "youtube_shorts", "instagram_reels", "x", "douyin"].forEach((p) => {
        if (!selectedPlatforms.includes(p)) onTogglePlatformFilter(p);
      });
    }
    if (setFilterStatuses) setFilterStatuses([]);
    if (setFilterCategoryId) setFilterCategoryId("all");
    if (setSearchQuery) setSearchQuery("");
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: "14px",
        height: "calc(100vh - 200px)",
        minHeight: "620px"
      }}
    >
      {/* ========================================================================= */}
      {/* 1. LEFT AREA: 7-DAY WEEK CALENDAR GRID                                     */}
      {/* ========================================================================= */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "12px",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
          overflowY: "auto",
          minWidth: 0
        }}
      >
        {/* Table Container */}
        <div style={{ width: "100%", minWidth: "750px" }}>
          {/* Day Header Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "55px repeat(7, minmax(0, 1fr))",
              gap: "6px",
              marginBottom: "8px",
              textAlign: "center"
            }}
          >
            {/* Empty top-left cell */}
            <div />

            {weekDays.map((d) => (
              <div
                key={d.iso}
                onClick={() => onSelectDate && onSelectDate(d.dateObj)}
                style={{
                  minWidth: 0,
                  cursor: "pointer",
                  background: d.isSelected
                    ? "rgba(139, 92, 246, 0.2)"
                    : "rgba(255, 255, 255, 0.02)",
                  border: d.isSelected
                    ? "1.5px solid #8b5cf6"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "8px",
                  padding: "8px 4px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "2px",
                  transition: "all 0.15s ease"
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: d.isSelected ? "#c084fc" : "#fff",
                    whiteSpace: "nowrap"
                  }}
                >
                  {d.name}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: d.isSelected ? "#c084fc" : d.isToday ? "#38bdf8" : "var(--text-muted)",
                    fontWeight: d.isSelected || d.isToday ? 700 : 400,
                    whiteSpace: "nowrap"
                  }}
                >
                  {d.dateNum}/{d.monthNum}
                </span>
              </div>
            ))}
          </div>

          {/* Time Grid Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {timeSlots.map((slot) => (
              <div
                key={slot}
                style={{
                  display: "grid",
                  gridTemplateColumns: "55px repeat(7, minmax(0, 1fr))",
                  gap: "6px",
                  minHeight: "76px"
                }}
              >
                {/* Time Label on left */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    paddingTop: "6px"
                  }}
                >
                  {slot}
                </div>

                {/* 7 Columns for this slot */}
                {weekDays.map((d) => {
                  const cellEvents = eventsByDayAndSlot[d.iso]?.[slot] || [];
                  return (
                    <div
                      key={`${d.iso}_${slot}`}
                      style={{
                        minWidth: 0,
                        background: d.isSelected
                          ? "rgba(139, 92, 246, 0.06)"
                          : "rgba(255, 255, 255, 0.01)",
                        border: d.isSelected
                          ? "1.5px solid rgba(139, 92, 246, 0.4)"
                          : "1px solid rgba(255, 255, 255, 0.04)",
                        borderRadius: "8px",
                        padding: "4px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        minHeight: "72px",
                        boxSizing: "border-box",
                        position: "relative"
                      }}
                    >
                      {cellEvents.map((ev) => {
                        const statusObj = normalizeStatus(ev);
                        const isSelected = ev.id === selectedEventId;
                        const platforms = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
                        const firstPlatform = platforms[0] || "tiktok";
                        const platCfg = PLATFORM_CONFIG[firstPlatform] || { icon: "globe", color: "#fff" };

                        const vid = videos.find((v) => v.id === ev.video_id);
                        const thumbSrc = getThumbnailSrc(ev, vid);

                        return (
                          <div
                            key={ev.id}
                            onClick={() => {
                              onSelectEvent(ev.id);
                              if (onSelectDate) onSelectDate(d.dateObj);
                            }}
                            style={{
                              width: "100%",
                              maxWidth: "100%",
                              boxSizing: "border-box",
                              minWidth: 0,
                              background: isSelected
                                ? "rgba(139, 92, 246, 0.25)"
                                : "rgba(18, 22, 38, 0.95)",
                              border: isSelected
                                ? "1.5px solid #8b5cf6"
                                : "1px solid rgba(255, 255, 255, 0.08)",
                              borderRadius: "8px",
                              padding: "5px",
                              cursor: "pointer",
                              display: "flex",
                              gap: "6px",
                              boxShadow: isSelected
                                ? "0 0 10px rgba(139, 92, 246, 0.4)"
                                : "0 2px 6px rgba(0,0,0,0.3)",
                              transition: "all 0.15s ease"
                            }}
                            title={`${ev.scheduled_time || slot} - ${ev.title} (${statusObj.label})`}
                          >
                            {/* Thumbnail on left */}
                            <div
                              style={{
                                width: "34px",
                                height: "34px",
                                borderRadius: "5px",
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

                            {/* Info */}
                            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                              {/* Header: Time + Platform icon + dots */}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2px" }}>
                                <span style={{ fontSize: "9px", fontWeight: 700, color: "#fff" }}>
                                  {ev.scheduled_time || slot}
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                  <Icon name={platCfg.icon} size={10} color={platCfg.color} />
                                </div>
                              </div>

                              {/* Title */}
                              <div
                                style={{
                                  fontSize: "9.5px",
                                  fontWeight: 600,
                                  color: "#fff",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {ev.title}
                              </div>

                              {/* Status Pill */}
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  background: statusObj.bg,
                                  border: `1px solid ${statusObj.border}`,
                                  borderRadius: "4px",
                                  padding: "1px 4px",
                                  width: "fit-content",
                                  fontSize: "8.5px",
                                  fontWeight: 600,
                                  color: statusObj.color
                                }}
                              >
                                <span>{statusObj.badge}</span>
                                <span>{statusObj.label}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Empty slot: Click to add schedule */}
                      {cellEvents.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectDate) onSelectDate(d.dateObj);
                            if (onCreateEvent) onCreateEvent(d.dateObj, slot);
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            minHeight: "40px",
                            border: "1px dashed rgba(255, 255, 255, 0.1)",
                            background: "transparent",
                            borderRadius: "6px",
                            color: "var(--text-muted)",
                            fontSize: "9px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            opacity: 0.6,
                            transition: "all 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "1";
                            e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.4)";
                            e.currentTarget.style.color = "#c084fc";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "0.6";
                            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                            e.currentTarget.style.color = "var(--text-muted)";
                          }}
                          title={`+ Thêm lịch đăng lúc ${slot} (${d.name})`}
                        >
                          <Icon name="plus" size={10} />
                          <span>Thêm</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer Legend matching mockup */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            paddingTop: "10px",
            marginTop: "auto",
            flexWrap: "wrap",
            gap: "8px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
              <span style={{ color: "#c084fc" }}>●</span>
              <span>Đã lên lịch</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
              <span style={{ color: "#fbbf24" }}>●</span>
              <span>Đang đăng</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
              <span style={{ color: "#34d399" }}>●</span>
              <span>Đã đăng</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
              <span style={{ color: "#f87171" }}>●</span>
              <span>Đăng thất bại</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
              <span style={{ color: "#9ca3af" }}>●</span>
              <span>Đã hủy</span>
            </div>
          </div>

          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Tổng cộng: <strong style={{ color: "#fff" }}>{events.length}</strong> lịch đăng
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. RIGHT AREA: FILTER BOX (TOP) + SCHEDULE DETAIL (BOTTOM)                 */}
      {/* ========================================================================= */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          height: "100%",
          overflowY: "auto"
        }}
      >
        {/* ----------------------------------------------------------------------- */}
        {/* TOP PANEL: "Bộ lọc" (Filter Panel)                                      */}
        {/* ----------------------------------------------------------------------- */}
        <div
          style={{
            background: "#0c101b",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="sparkles" size={13} color="#c084fc" />
              <strong style={{ fontSize: "12.5px", color: "#fff" }}>Bộ lọc</strong>
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                background: "none",
                border: "none",
                color: "#8b5cf6",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0
              }}
            >
              Đặt lại
            </button>
          </div>

          {/* Khoảng thời gian */}
          <div>
            <label style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Khoảng thời gian
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "4px",
                background: "rgba(255, 255, 255, 0.03)",
                padding: "2px",
                borderRadius: "6px",
                marginBottom: "6px"
              }}
            >
              {["day", "month", "custom"].map((p) => {
                const labelMap = { day: "Ngày", month: "Tháng", custom: "Tùy chỉnh" };
                const isActive = filterPeriod === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFilterPeriod(p)}
                    style={{
                      border: "none",
                      outline: "none",
                      padding: "4px",
                      fontSize: "10.5px",
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: "5px",
                      cursor: "pointer",
                      color: isActive ? "#fff" : "var(--text-secondary)",
                      background: isActive ? "#8b5cf6" : "transparent",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {labelMap[p]}
                  </button>
                );
              })}
            </div>

            {/* Month & Year Selects */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <select
                className="form-select"
                value={filterMonth}
                onChange={(e) => {
                  const m = parseInt(e.target.value, 10);
                  setFilterMonth(m);
                  const next = new Date(selectedDate);
                  next.setMonth(m - 1);
                  if (onSelectDate) onSelectDate(next);
                }}
                style={{
                  fontSize: "11px",
                  padding: "4px 8px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "6px",
                  color: "#fff"
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m} style={{ background: "#0c101b" }}>
                    Tháng {m}
                  </option>
                ))}
              </select>

              <select
                className="form-select"
                value={filterYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setFilterYear(y);
                  const next = new Date(selectedDate);
                  next.setFullYear(y);
                  if (onSelectDate) onSelectDate(next);
                }}
                style={{
                  fontSize: "11px",
                  padding: "4px 8px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "6px",
                  color: "#fff"
                }}
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y} style={{ background: "#0c101b" }}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nền tảng */}
          <div>
            <label style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Nền tảng
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {Object.entries(PLATFORM_CONFIG).map(([pId, pCfg]) => {
                const isChecked = selectedPlatforms.includes(pId);
                return (
                  <button
                    key={pId}
                    type="button"
                    onClick={() => onTogglePlatformFilter && onTogglePlatformFilter(pId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 8px",
                      borderRadius: "6px",
                      border: isChecked
                        ? "1px solid rgba(139, 92, 246, 0.5)"
                        : "1px solid rgba(255, 255, 255, 0.07)",
                      background: isChecked
                        ? "rgba(139, 92, 246, 0.15)"
                        : "rgba(255, 255, 255, 0.02)",
                      color: isChecked ? "#fff" : "var(--text-secondary)",
                      fontSize: "10.5px",
                      fontWeight: isChecked ? 600 : 400,
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    <Icon name={pCfg.icon} size={12} color={pCfg.color} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pCfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trạng thái */}
          <div>
            <label style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "3px" }}>
              Trạng thái
            </label>
            <select
              className="form-select"
              value={filterStatuses[0] || "all"}
              onChange={(e) => {
                const val = e.target.value;
                if (setFilterStatuses) {
                  setFilterStatuses(val === "all" ? [] : [val]);
                }
              }}
              style={{
                width: "100%",
                fontSize: "11px",
                padding: "4px 8px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "6px",
                color: "#fff"
              }}
            >
              <option value="all" style={{ background: "#0c101b" }}>Tất cả trạng thái</option>
              {Object.values(STATUS_CONFIG).map((cfg) => (
                <option key={cfg.id} value={cfg.id} style={{ background: "#0c101b" }}>
                  {cfg.badge} {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {/* Danh mục video */}
          <div>
            <label style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "3px" }}>
              Danh mục video
            </label>
            <select
              className="form-select"
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId && setFilterCategoryId(e.target.value)}
              style={{
                width: "100%",
                fontSize: "11px",
                padding: "4px 8px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "6px",
                color: "#fff"
              }}
            >
              <option value="all" style={{ background: "#0c101b" }}>Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} style={{ background: "#0c101b" }}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "6px",
                padding: "4px 8px"
              }}
            >
              <Icon name="search" size={11} color="var(--text-muted)" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên video, hashtag..."
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "11px",
                  color: "#fff",
                  width: "100%"
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "6px", marginTop: "2px" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "6px",
                background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)"
              }}
            >
              Áp dụng bộ lọc
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResetFilters}
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "6px"
              }}
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* BOTTOM PANEL: "Chi tiết lịch đăng" (Schedule Detail Panel)              */}
        {/* ----------------------------------------------------------------------- */}
        <div
          style={{
            background: "#0c101b",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            flex: 1
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ fontSize: "12.5px", color: "#fff" }}>Chi tiết lịch đăng</strong>
            {activeEvent && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => onSelectEvent(null)}
                style={{ width: "22px", height: "22px", borderRadius: "50%", padding: 0 }}
                title="Đóng chi tiết"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          {activeEvent ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Video Preview Thumbnail */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "135px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {isPlayingVideo && videoStreamUrl ? (
                  <video
                    ref={videoRef}
                    src={videoStreamUrl}
                    controls
                    autoPlay
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <>
                    <img
                      src={getThumbnailSrc(activeEvent, activeVideo)}
                      alt={activeEvent.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/placeholder.png";
                      }}
                    />
                    {/* Play button overlay */}
                    {videoStreamUrl && (
                      <button
                        type="button"
                        onClick={() => setIsPlayingVideo(true)}
                        style={{
                          position: "absolute",
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "rgba(139, 92, 246, 0.85)",
                          border: "none",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                          transition: "transform 0.15s ease"
                        }}
                      >
                        <Icon name="play" size={16} />
                      </button>
                    )}
                    {/* Duration badge */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "6px",
                        right: "6px",
                        background: "rgba(0,0,0,0.75)",
                        color: "#fff",
                        padding: "1px 5px",
                        borderRadius: "4px",
                        fontSize: "9.5px",
                        fontWeight: 600
                      }}
                    >
                      {formatDuration(activeVideo?.duration || 15)}
                    </div>
                  </>
                )}
              </div>

              {/* Title & Specs */}
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#fff", lineHeight: "1.3" }}>
                  {activeEvent.title}
                </div>
              </div>

              {/* Meta details */}
              {(() => {
                const statusObj = normalizeStatus(activeEvent);
                const platforms = Array.isArray(activeEvent.platforms) ? activeEvent.platforms : [activeEvent.platform || "tiktok"];
                const firstPlatform = platforms[0] || "tiktok";
                const platCfg = PLATFORM_CONFIG[firstPlatform] || { icon: "globe", color: "#fff", label: "Mạng xã hội" };

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "10.5px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Icon name={platCfg.icon} size={11} color={platCfg.color} />
                      <span style={{ color: "var(--text-secondary)" }}>{platCfg.label}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Icon name="calendar" size={11} color="var(--text-muted)" />
                      <span style={{ color: "#fff", fontWeight: 600 }}>
                        {activeEvent.scheduled_date} {activeEvent.scheduled_time || "10:00"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Icon name="globe" size={11} color="var(--text-muted)" />
                      <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                        {activeEvent.timezone || "(UTC+7) Asia/Ho_Chi_Minh"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "var(--text-muted)" }}>✦ Trạng thái:</span>
                      <span style={{ color: statusObj.color, fontWeight: 700 }}>
                        {statusObj.badge} {statusObj.label}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Icon name="user" size={11} color="var(--text-muted)" />
                      <span style={{ color: "var(--text-muted)" }}>Người tạo: <strong style={{ color: "#fff" }}>Cynex</strong></span>
                    </div>

                    {/* Caption & Hashtags */}
                    {(caption || hashtags) && (
                      <div
                        style={{
                          marginTop: "4px",
                          padding: "6px 8px",
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                          borderRadius: "6px",
                          fontSize: "10.5px",
                          color: "var(--text-secondary)",
                          lineHeight: "1.4"
                        }}
                      >
                        {caption && <div>{caption}</div>}
                        {hashtags && (
                          <div style={{ color: "#c084fc", fontWeight: 600, marginTop: "2px" }}>
                            {hashtags}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Saved to Computer note */}
                    {(Boolean(activeVideo?.is_saved_to_computer) || (activeVideo?.local_export_count || 0) > 0) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "10.5px",
                          fontWeight: 600,
                          color: "var(--accent-cyan)",
                          background: "rgba(6, 182, 212, 0.1)",
                          border: "1px solid rgba(6, 182, 212, 0.3)",
                          borderRadius: "6px",
                          padding: "4px 8px"
                        }}
                        title={activeVideo?.last_export_folder ? `Thư mục gần nhất: ${activeVideo.last_export_folder}` : undefined}
                      >
                        <Icon name="download" size={12} color="var(--accent-cyan)" />
                        <span>Đã lưu vào máy ({activeVideo?.local_export_count || 1} lượt tải)</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onEditEvent && onEditEvent(activeEvent)}
                        style={{
                          padding: "5px 10px",
                          fontSize: "11px",
                          fontWeight: 600,
                          borderRadius: "6px",
                          background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)"
                        }}
                      >
                        Chỉnh sửa
                      </button>

                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            type: "danger",
                            title: "Xác Nhận Hủy Lịch",
                            message: `Bạn có chắc chắn muốn hủy lịch đăng video "${activeEvent?.title || ""}"?`,
                            confirmText: "Hủy lịch",
                            cancelText: "Không",
                            onConfirm: () => {
                              if (onDeleteEvent) onDeleteEvent(activeEvent.id);
                            }
                          });
                        }}
                        style={{
                          padding: "5px 10px",
                          fontSize: "11px",
                          fontWeight: 600,
                          borderRadius: "6px"
                        }}
                      >
                        Hủy lịch
                      </button>
                    </div>

                    {/* Download to computer button */}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onOpenExportModal && onOpenExportModal([activeVideo?.id || activeEvent?.video_id])}
                      style={{
                        marginTop: "2px",
                        padding: "5px 10px",
                        fontSize: "11px",
                        fontWeight: 600,
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        color: "var(--accent-cyan)",
                        borderColor: "rgba(6, 182, 212, 0.4)",
                        background: "rgba(6, 182, 212, 0.08)"
                      }}
                      title="Lưu video này vào thư mục máy tính (chọn ổ đĩa/thư mục)"
                    >
                      <Icon name="download" size={12} color="var(--accent-cyan)" />
                      <span>{(activeVideo?.local_export_count || 0) > 0 ? "Lưu lại về máy" : "Tải về máy"}</span>
                    </button>

                    {/* Mark as published button if not published */}
                    {statusObj.id !== "PUBLISHED_MANUALLY" && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onConfirmPublished && onConfirmPublished(activeEvent)}
                        style={{
                          marginTop: "2px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          fontWeight: 600,
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "5px"
                        }}
                      >
                        <Icon name="checkCircle" size={12} color="#34d399" />
                        <span>Đánh dấu đã đăng</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                textAlign: "center",
                color: "var(--text-muted)",
                gap: "6px",
                padding: "20px 10px"
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.03)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "4px"
                }}
              >
                <Icon name="calendar" size={20} color="var(--text-muted)" />
              </div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Chưa chọn lịch đăng nào
              </div>
              <div style={{ fontSize: "10.5px", maxWidth: "200px", lineHeight: "1.3" }}>
                Nhấp vào một video trên lịch tuần để xem chi tiết hoặc bấm nút dưới để tạo mới
              </div>
              {onCreateEvent && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onCreateEvent(selectedDate)}
                  style={{
                    marginTop: "8px",
                    padding: "5px 14px",
                    fontSize: "11px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px"
                  }}
                >
                  <Icon name="plus" size={12} color="#fff" />
                  <span>+ Lên Lịch Video</span>
                </button>
              )}
            </div>
          )}
        </div>
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
