import React from "react";
import { Icon } from "../Icons";

export default function PlannerToolbar({
  viewMode,
  setViewMode,
  selectedDate,
  onNavigate,
  onToday,
  dateLabel,
  onToggleFilter,
  activeFilterCount = 0,
  onOpenStats,
  onOpenCreate
}) {
  const views = [
    { id: "day", label: "Ngày" },
    { id: "week", label: "Tuần" },
    { id: "month", label: "Tháng" },
    { id: "list", label: "Danh sách" }
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#0c101b",
        border: "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius: "10px",
        padding: "8px 12px",
        marginBottom: "12px",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
        flexWrap: "wrap",
        gap: "10px"
      }}
    >
      {/* Left: Navigation [←] [Hôm nay] [→] + Date Display */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onNavigate(-1)}
            style={{ width: "26px", height: "26px", borderRadius: "6px" }}
            title="Trước đó"
          >
            <Icon name="chevronDown" size={13} style={{ transform: "rotate(90deg)" }} />
          </button>
          
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onToday}
            style={{
              padding: "3px 9px",
              fontSize: "11px",
              fontWeight: 600,
              height: "26px",
              borderRadius: "6px"
            }}
          >
            Hôm nay
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={() => onNavigate(1)}
            style={{ width: "26px", height: "26px", borderRadius: "6px" }}
            title="Tiếp theo"
          >
            <Icon name="chevronDown" size={13} style={{ transform: "rotate(-90deg)" }} />
          </button>
        </div>

        {/* Date / Period Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "11.5px",
            fontWeight: 700,
            color: "#fff"
          }}
        >
          <Icon name="calendar" size={13} color="#c084fc" />
          <span>{dateLabel}</span>
        </div>
      </div>

      {/* Right: View Switcher + Filter + Stats + Create Action */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* View switcher buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "6px",
            padding: "2px"
          }}
        >
          {views.map((v) => {
            const isActive = viewMode === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                style={{
                  border: "none",
                  outline: "none",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: isActive ? 700 : 500,
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  background: isActive
                    ? "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)"
                    : "transparent",
                  boxShadow: isActive ? "0 2px 8px rgba(139, 92, 246, 0.35)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Filter button */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onToggleFilter}
          style={{
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: 600,
            height: "28px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "5px"
          }}
          title="Bộ lọc nâng cao"
        >
          <Icon name="sparkles" size={12} color="#c084fc" />
          <span>Bộ lọc</span>
          {activeFilterCount > 0 && (
            <span
              style={{
                width: "15px",
                height: "15px",
                borderRadius: "50%",
                background: "#8b5cf6",
                color: "#fff",
                fontSize: "9.5px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Stats button */}
        {onOpenStats && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenStats}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 600,
              height: "28px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              gap: "5px"
            }}
            title="Xem báo cáo thống kê kế hoạch"
          >
            <Icon name="chart" size={12} color="#38bdf8" />
            <span>Thống kê</span>
          </button>
        )}

        {/* Create Button */}
        {onOpenCreate && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenCreate}
            style={{
              padding: "4px 12px",
              fontSize: "11.5px",
              fontWeight: 600,
              height: "28px",
              borderRadius: "6px",
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              boxShadow: "0 2px 8px rgba(139, 92, 246, 0.35)",
              display: "flex",
              alignItems: "center",
              gap: "5px"
            }}
          >
            <Icon name="plus" size={13} color="#fff" />
            <span>+ Lên Lịch Video</span>
          </button>
        )}
      </div>
    </div>
  );
}
