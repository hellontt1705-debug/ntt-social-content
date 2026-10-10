import React from "react";
import { Icon } from "../Icons";

export default function PlannerKPIs({ stats }) {
  const {
    totalWeek = 0,
    publishedCount = 0,
    pendingCount = 0,
    missedCount = 0,
    weeklyTarget = 14
  } = stats || {};

  const targetProgress = Math.min(100, Math.round((publishedCount / Math.max(1, weeklyTarget)) * 100));
  const remainingForTarget = Math.max(0, weeklyTarget - publishedCount);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "8px",
        marginBottom: "12px",
        width: "100%",
        boxSizing: "border-box"
      }}
    >
      {/* 1. TỔNG LỊCH TUẦN */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "10px",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: "rgba(168, 85, 247, 0.15)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#c084fc",
            flexShrink: 0
          }}
        >
          <Icon name="calendar" size={15} color="#c084fc" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            TỔNG LỊCH TUẦN
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginTop: "1px" }}>
            {totalWeek} <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)" }}>video</span>
          </div>
        </div>
      </div>

      {/* 2. ĐÃ ĐĂNG */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "10px",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: "rgba(52, 211, 153, 0.15)",
            border: "1px solid rgba(52, 211, 153, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#34d399",
            flexShrink: 0
          }}
        >
          <Icon name="checkCircle" size={15} color="#34d399" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            ĐÃ ĐĂNG
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#34d399", marginTop: "1px" }}>
            {publishedCount} <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)" }}>video</span>
          </div>
        </div>
      </div>

      {/* 3. CHỜ ĐĂNG */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "10px",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: "rgba(251, 191, 36, 0.15)",
            border: "1px solid rgba(251, 191, 36, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fbbf24",
            flexShrink: 0
          }}
        >
          <Icon name="clock" size={15} color="#fbbf24" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            CHỜ ĐĂNG
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fbbf24", marginTop: "1px" }}>
            {pendingCount} <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)" }}>video</span>
          </div>
        </div>
      </div>

      {/* 4. BỎ LỠ */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "10px",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: "rgba(248, 113, 113, 0.15)",
            border: "1px solid rgba(248, 113, 113, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f87171",
            flexShrink: 0
          }}
        >
          <Icon name="alertTriangle" size={15} color="#f87171" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            BỎ LỠ
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#f87171", marginTop: "1px" }}>
            {missedCount} <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)" }}>video</span>
          </div>
        </div>
      </div>

      {/* 5. MỤC TIÊU TUẦN */}
      <div
        style={{
          background: "#0c101b",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "10px",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "4px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "6px",
                background: "rgba(34, 211, 238, 0.15)",
                border: "1px solid rgba(34, 211, 238, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#22d3ee"
              }}
            >
              <Icon name="sparkles" size={12} color="#22d3ee" />
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                MỤC TIÊU TUẦN:
              </span>{" "}
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#22d3ee" }}>
                {weeklyTarget} video
              </span>
            </div>
          </div>

          <span style={{ fontSize: "11px", fontWeight: 700, color: "#c084fc" }}>
            {targetProgress}%
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: "100%",
            height: "5px",
            borderRadius: "3px",
            background: "rgba(255, 255, 255, 0.08)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: `${targetProgress}%`,
              height: "100%",
              borderRadius: "3px",
              background: "linear-gradient(90deg, #8b5cf6 0%, #06b6d4 100%)",
              transition: "width 0.4s ease"
            }}
          />
        </div>

        <div style={{ fontSize: "9.5px", color: "var(--text-muted)", textAlign: "right" }}>
          {remainingForTarget > 0 ? `Còn ${remainingForTarget} video` : "🎉 Đã đạt mục tiêu!"}
        </div>
      </div>
    </div>
  );
}
