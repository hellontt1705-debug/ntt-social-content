import React from "react";
import { Icon } from "../Icons";
import { STATUS_CONFIG, PLATFORM_CONFIG, normalizeStatus } from "./PlannerConstants";

export default function PlannerStatsModal({
  isOpen,
  onClose,
  events = []
}) {
  if (!isOpen) return null;

  const total = events.length;
  let published = 0;
  let missed = 0;
  let pending = 0;

  const platformCounts = {};
  Object.keys(PLATFORM_CONFIG).forEach((p) => {
    platformCounts[p] = 0;
  });

  events.forEach((ev) => {
    const st = normalizeStatus(ev).id;
    if (st === "PUBLISHED_MANUALLY") published++;
    else if (st === "MISSED") missed++;
    else pending++;

    const platforms = Array.isArray(ev.platforms) ? ev.platforms : [ev.platform || "tiktok"];
    platforms.forEach((p) => {
      if (platformCounts[p] !== undefined) platformCounts[p]++;
    });
  });

  const adherenceRate = total > 0 ? Math.round((published / total) * 100) : 0;

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
          width: "560px",
          maxWidth: "94vw",
          background: "#10141f",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.8), 0 0 30px rgba(139, 92, 246, 0.15)",
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
            padding: "14px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "rgba(139, 92, 246, 0.2)",
                border: "1px solid rgba(139, 92, 246, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#c084fc"
              }}
            >
              <Icon name="sparkles" size={17} color="#c084fc" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                Thống kê kế hoạch xây kênh
              </h3>
              <p style={{ margin: "1px 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
                Tổng quan nhịp độ và tỷ lệ hoàn thành đăng bài
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

        {/* Content */}
        <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Top 3 Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            <div
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "10px",
                padding: "12px",
                textAlign: "center"
              }}
            >
              <div style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                TỔNG LỊCH ĐĂNG
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>
                {total}
              </div>
            </div>

            <div
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "10px",
                padding: "12px",
                textAlign: "center"
              }}
            >
              <div style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                TỶ LỆ HOÀN THÀNH
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#34d399", marginTop: "4px" }}>
                {adherenceRate}%
              </div>
            </div>

            <div
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "10px",
                padding: "12px",
                textAlign: "center"
              }}
            >
              <div style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                BỎ LỠ
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#f87171", marginTop: "4px" }}>
                {missed}
              </div>
            </div>
          </div>

          {/* Platform Distribution */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>
              Phân bổ nội dung theo nền tảng
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(PLATFORM_CONFIG).map(([pId, cfg]) => {
                const count = platformCounts[pId] || 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={pId}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icon name={cfg.icon} size={13} color={cfg.color} />
                        <span style={{ color: "#fff", fontWeight: 600 }}>{cfg.label}</span>
                      </div>
                      <span style={{ color: "var(--text-muted)" }}>
                        {count} video ({pct}%)
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        background: "rgba(255, 255, 255, 0.06)",
                        borderRadius: "3px",
                        overflow: "hidden"
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: cfg.color,
                          borderRadius: "3px"
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "flex-end"
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: "11.5px", height: "30px", borderRadius: "6px", padding: "0 16px" }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
