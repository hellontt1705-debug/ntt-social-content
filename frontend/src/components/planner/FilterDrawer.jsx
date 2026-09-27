import React, { useState } from "react";
import { Icon } from "../Icons";
import { STATUS_CONFIG, PLATFORM_CONFIG } from "./PlannerConstants";

export default function FilterDrawer({
  isOpen,
  onClose,
  categories = [],
  filters,
  onApplyFilters,
  onResetFilters
}) {
  const [localFilters, setLocalFilters] = useState(filters);

  if (!isOpen) return null;

  const togglePlatform = (pId) => {
    const prev = localFilters.platforms || [];
    const next = prev.includes(pId) ? prev.filter((p) => p !== pId) : [...prev, pId];
    setLocalFilters({ ...localFilters, platforms: next });
  };

  const toggleStatus = (sId) => {
    const prev = localFilters.statuses || [];
    const next = prev.includes(sId) ? prev.filter((s) => s !== sId) : [...prev, sId];
    setLocalFilters({ ...localFilters, statuses: next });
  };

  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  const handleReset = () => {
    const reset = {
      platforms: [],
      statuses: [],
      categoryId: "all",
      searchQuery: ""
    };
    setLocalFilters(reset);
    onResetFilters();
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(5, 6, 12, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "flex-end"
      }}
    >
      <div
        className="filter-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "360px",
          maxWidth: "85vw",
          height: "100%",
          background: "#0c101b",
          borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "-10px 0 35px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box"
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="sparkles" size={16} color="#c084fc" />
            <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#fff" }}>
              Bộ lọc kế hoạch đăng bài
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            style={{ width: "26px", height: "26px" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Filter Content */}
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", flex: 1 }}>
          {/* 1. Nền tảng */}
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>
              Nền tảng
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {Object.entries(PLATFORM_CONFIG).map(([pId, cfg]) => {
                const checked = (localFilters.platforms || []).includes(pId);
                return (
                  <label
                    key={pId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: checked ? "#fff" : "var(--text-secondary)",
                      padding: "4px 6px",
                      borderRadius: "6px",
                      background: checked ? "rgba(255, 255, 255, 0.03)" : "transparent"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlatform(pId)}
                      style={{ cursor: "pointer", accentColor: "#8b5cf6" }}
                    />
                    <Icon name={cfg.icon} size={14} color={cfg.color} />
                    <span>{cfg.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 2. Trạng thái */}
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>
              Trạng thái
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {Object.values(STATUS_CONFIG).map((cfg) => {
                const checked = (localFilters.statuses || []).includes(cfg.id);
                return (
                  <label
                    key={cfg.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: checked ? "#fff" : "var(--text-secondary)",
                      padding: "4px 6px",
                      borderRadius: "6px",
                      background: checked ? "rgba(255, 255, 255, 0.03)" : "transparent"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStatus(cfg.id)}
                      style={{ cursor: "pointer", accentColor: "#8b5cf6" }}
                    />
                    <span>{cfg.badge}</span>
                    <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 3. Danh mục video */}
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>
              Danh mục video
            </div>
            <select
              value={localFilters.categoryId || "all"}
              onChange={(e) => setLocalFilters({ ...localFilters, categoryId: e.target.value })}
              style={{
                width: "100%",
                background: "#080a10",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "6px",
                padding: "8px 10px",
                color: "#fff",
                fontSize: "11.5px",
                outline: "none"
              }}
            >
              <option value="all">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer Buttons */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px"
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReset}
            style={{ fontSize: "11.5px", height: "30px", borderRadius: "6px" }}
          >
            Đặt lại
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApply}
            style={{
              fontSize: "11.5px",
              height: "30px",
              borderRadius: "6px",
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              padding: "0 16px"
            }}
          >
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}
