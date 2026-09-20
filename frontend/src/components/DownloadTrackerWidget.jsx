import React, { useState, useEffect, useRef } from "react";
import { Icon } from "./Icons";

export default function DownloadTrackerWidget({
  tasks = [],
  logs = [],
  isOpen,
  onClose,
  onOpenModal,
  onClearCompleted,
  onClearLogs
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks"); // "tasks" | "logs"
  const [copiedLog, setCopiedLog] = useState(false);
  const logEndRef = useRef(null);

  // Auto-scroll log console to bottom when new logs arrive
  useEffect(() => {
    if (activeTab === "logs" && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activeTab]);

  if (!isOpen || tasks.length === 0) return null;

  const totalCount = tasks.length;
  const completedTasks = tasks.filter((t) => t.isCompleted || ((t.percent || 0) >= 100 && !t.isError));
  const errorTasks = tasks.filter((t) => t.isError);

  // Active / Downloading tasks:
  const downloadingTasks = tasks.filter((t) => {
    if (t.isCompleted || t.isError || (t.percent || 0) >= 100) return false;
    return (t.percent || 0) > 0 && !t.status?.toLowerCase().includes("chờ");
  });

  // Waiting tasks in queue:
  const waitingTasks = tasks.filter((t) => {
    if (t.isCompleted || t.isError || (t.percent || 0) >= 100) return false;
    return (t.percent || 0) === 0 || t.status?.toLowerCase().includes("chờ");
  });

  const completedCount = completedTasks.length;
  const errorCount = errorTasks.length;
  const downloadingCount = downloadingTasks.length;
  const waitingCount = waitingTasks.length;

  // Calculate overall progress percentage
  const totalPercent = totalCount > 0
    ? Math.round(tasks.reduce((sum, t) => sum + (t.percent || 0), 0) / totalCount)
    : 0;

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.time}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  return (
    <div
      className="download-tracker-widget"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "24px",
        zIndex: 9999,
        width: isExpanded ? "500px" : "380px",
        maxWidth: "calc(100vw - 32px)",
        background: "rgba(16, 18, 29, 0.96)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(139, 92, 246, 0.35)",
        borderRadius: "16px",
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.15)",
        color: "var(--text-primary)",
        overflow: "hidden",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
      }}
    >
      {/* 1. COMPACT / COLLAPSED BAR */}
      {!isExpanded ? (
        <div style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => setIsExpanded(true)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  background: downloadingCount > 0
                    ? "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)"
                    : completedCount === totalCount
                    ? "#10b981"
                    : "#f59e0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: downloadingCount > 0 ? "0 0 12px rgba(168, 85, 247, 0.4)" : "none"
                }}
              >
                <Icon name={downloadingCount > 0 ? "download" : "check"} size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
                  {completedCount === totalCount
                    ? `Hoàn tất: ${completedCount}/${totalCount} video (100%)`
                    : `Tiến độ tải: ${completedCount}/${totalCount} video (${totalPercent}%)`}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ color: "#38bdf8" }}>⚡ Đang tải: {downloadingCount}</span>
                  <span>•</span>
                  <span style={{ color: "#fbbf24" }}>⏳ Chờ: {waitingCount}</span>
                  <span>•</span>
                  <span style={{ color: "#34d399" }}>✅ Xong: {completedCount}/{totalCount}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                className="icon-btn"
                title="Mở rộng xem chi tiết & Log"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                style={{ padding: "4px", color: "var(--accent-cyan)" }}
              >
                <Icon name="chevronUp" size={16} />
              </button>
              <button
                className="icon-btn"
                title="Đóng thanh tiến trình"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                style={{ padding: "4px" }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>

          {/* Mini Overall Progress Bar */}
          <div className="progress-track" style={{ height: "5px", background: "rgba(255, 255, 255, 0.08)" }}>
            <div
              className="progress-fill"
              style={{
                width: `${completedCount === totalCount ? 100 : Math.max(totalPercent, Math.round((completedCount / totalCount) * 100))}%`,
                background: completedCount === totalCount
                  ? "#10b981"
                  : "linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #06b6d4 100%)"
              }}
            />
          </div>
        </div>
      ) : (
        /* 2. FULL EXPANDED DRAWER */
        <div style={{ display: "flex", flexDirection: "column", maxHeight: "560px" }}>
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.02)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Icon name="download" size={15} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>Tiến Trình Tải Xuống</span>
                  <span style={{
                    fontSize: "12px",
                    fontWeight: "800",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    background: completedCount === totalCount ? "rgba(16, 185, 129, 0.25)" : "rgba(6, 182, 212, 0.25)",
                    border: `1px solid ${completedCount === totalCount ? "rgba(16, 185, 129, 0.5)" : "rgba(6, 182, 212, 0.5)"}`,
                    color: completedCount === totalCount ? "#34d399" : "#38bdf8",
                    letterSpacing: "0.3px"
                  }}>
                    {completedCount}/{totalCount} Video Xong
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {onOpenModal && (
                <button
                  className="icon-btn"
                  title="Mở Modal Quản Lý Lớn"
                  onClick={() => onOpenModal("tasks")}
                  style={{ padding: "5px" }}
                >
                  <Icon name="maximize" size={14} />
                </button>
              )}
              <button
                className="icon-btn"
                title="Thu nhỏ xuống thanh góc"
                onClick={() => setIsExpanded(false)}
                style={{ padding: "5px" }}
              >
                <Icon name="chevronDown" size={16} />
              </button>
              <button
                className="icon-btn"
                title="Đóng tiến trình"
                onClick={onClose}
                style={{ padding: "5px" }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>

          {/* ALWAYS VISIBLE OVERALL PROGRESS BANNER (Single & Batch) */}
          <div style={{
            padding: "14px 18px",
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)",
            borderBottom: "1px solid rgba(139, 92, 246, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}>
            {/* Row 1: Clear text count & Percentage */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  fontSize: "13.5px",
                  fontWeight: "800",
                  letterSpacing: "0.2px",
                  color: completedCount === totalCount ? "#34d399" : "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}>
                  {completedCount === totalCount ? (
                    <>
                      <span style={{ fontSize: "15px" }}>🎉</span>
                      <span>Đã hoàn thành: <strong style={{ color: "#34d399", fontSize: "14px" }}>{completedCount}/{totalCount} video</strong> (100%)</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: "14px" }}>⚡</span>
                      <span>Tiến độ tải: <strong style={{ color: "#38bdf8", fontSize: "14px" }}>{completedCount}/{totalCount} video</strong></span>
                    </>
                  )}
                </span>
                {errorCount > 0 && (
                  <span style={{ fontSize: "11px", color: "#fb7185", fontWeight: "700", background: "rgba(244, 63, 94, 0.18)", border: "1px solid rgba(244, 63, 94, 0.3)", padding: "1px 6px", borderRadius: "6px" }}>
                    {errorCount} lỗi
                  </span>
                )}
              </div>

              {/* Percentage Badge */}
              <span style={{
                fontSize: "13px",
                fontWeight: "800",
                padding: "2px 10px",
                borderRadius: "10px",
                background: completedCount === totalCount ? "rgba(16, 185, 129, 0.25)" : "rgba(6, 182, 212, 0.2)",
                color: completedCount === totalCount ? "#34d399" : "#38bdf8",
                border: `1px solid ${completedCount === totalCount ? "rgba(16, 185, 129, 0.4)" : "rgba(6, 182, 212, 0.4)"}`
              }}>
                {completedCount === totalCount ? "100%" : `${totalPercent}%`}
              </span>
            </div>

            {/* Row 2: Animated Progress Bar */}
            <div className="progress-track" style={{ height: "7px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "4px", overflow: "hidden" }}>
              <div
                className="progress-fill"
                style={{
                  width: `${completedCount === totalCount ? 100 : Math.max(totalPercent, Math.round((completedCount / totalCount) * 100))}%`,
                  background: completedCount === totalCount
                    ? "#10b981"
                    : "linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #06b6d4 100%)",
                  transition: "width 0.3s ease"
                }}
              />
            </div>

            {/* Row 3: 4-BOX STATS BREAKDOWN GRID (TỔNG | ĐANG TẢI | ĐÃ XONG | ĐANG CHỜ) */}
            <div style={{
              display: "grid",
              gridTemplateColumns: errorCount > 0 ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
              gap: "6px",
              marginTop: "2px"
            }}>
              {/* 1. TỔNG SỐ */}
              <div style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.09)",
                borderRadius: "8px",
                padding: "6px 4px",
                textAlign: "center"
              }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  📦 Tổng số
                </div>
                <div style={{ fontSize: "14px", fontWeight: "800", color: "#ffffff", marginTop: "1px" }}>
                  {totalCount} <span style={{ fontSize: "10px", fontWeight: "500", color: "var(--text-secondary)" }}>vid</span>
                </div>
              </div>

              {/* 2. ĐANG TẢI */}
              <div style={{
                background: downloadingCount > 0 ? "rgba(6, 182, 212, 0.15)" : "rgba(255, 255, 255, 0.03)",
                border: `1px solid ${downloadingCount > 0 ? "rgba(6, 182, 212, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                borderRadius: "8px",
                padding: "6px 4px",
                textAlign: "center"
              }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: downloadingCount > 0 ? "#38bdf8" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  ⚡ Đang tải
                </div>
                <div style={{ fontSize: "14px", fontWeight: "800", color: downloadingCount > 0 ? "#38bdf8" : "var(--text-muted)", marginTop: "1px" }}>
                  {downloadingCount} <span style={{ fontSize: "10px", fontWeight: "500" }}>vid</span>
                </div>
              </div>

              {/* 3. ĐÃ HOÀN THÀNH */}
              <div style={{
                background: completedCount > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.03)",
                border: `1px solid ${completedCount > 0 ? "rgba(16, 185, 129, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                borderRadius: "8px",
                padding: "6px 4px",
                textAlign: "center"
              }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: completedCount > 0 ? "#34d399" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  ✅ Đã xong
                </div>
                <div style={{ fontSize: "14px", fontWeight: "800", color: completedCount > 0 ? "#34d399" : "var(--text-muted)", marginTop: "1px" }}>
                  {completedCount} <span style={{ fontSize: "10px", fontWeight: "500" }}>vid</span>
                </div>
              </div>

              {/* 4. ĐANG CHỜ */}
              <div style={{
                background: waitingCount > 0 ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.03)",
                border: `1px solid ${waitingCount > 0 ? "rgba(245, 158, 11, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                borderRadius: "8px",
                padding: "6px 4px",
                textAlign: "center"
              }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: waitingCount > 0 ? "#fbbf24" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  ⏳ Đang chờ
                </div>
                <div style={{ fontSize: "14px", fontWeight: "800", color: waitingCount > 0 ? "#fbbf24" : "var(--text-muted)", marginTop: "1px" }}>
                  {waitingCount} <span style={{ fontSize: "10px", fontWeight: "500" }}>vid</span>
                </div>
              </div>

              {/* 5. LỖI (Nếu có) */}
              {errorCount > 0 && (
                <div style={{
                  background: "rgba(244, 63, 94, 0.15)",
                  border: "1px solid rgba(244, 63, 94, 0.4)",
                  borderRadius: "8px",
                  padding: "6px 4px",
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#fb7185", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                    ❌ Lỗi
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: "#fb7185", marginTop: "1px" }}>
                    {errorCount} <span style={{ fontSize: "10px", fontWeight: "500" }}>vid</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subheader Navigation: Tasks List vs Realtime Logs */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            background: "rgba(0, 0, 0, 0.15)"
          }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === "tasks" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("tasks")}
                style={{ padding: "4px 12px", fontSize: "12px", border: "none" }}
              >
                <Icon name="download" size={13} />
                <span>Tiến trình tải ({completedCount}/{totalCount} video)</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === "logs" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("logs")}
                style={{ padding: "4px 12px", fontSize: "12px", border: "none" }}
              >
                <Icon name="terminal" size={13} />
                <span>Nhật ký Log ({logs.length})</span>
              </button>
            </div>

            {activeTab === "tasks" && (completedCount > 0 || errorCount > 0) && (
              <button
                type="button"
                onClick={onClearCompleted}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                onMouseEnter={(e) => (e.target.style.color = "var(--text-primary)")}
                onMouseLeave={(e) => (e.target.style.color = "var(--text-muted)")}
              >
                <span>Xóa đã xong ({completedCount + errorCount})</span>
              </button>
            )}

            {activeTab === "logs" && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  style={{
                    background: "none",
                    border: "none",
                    color: copiedLog ? "var(--accent-green)" : "var(--accent-cyan)",
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  {copiedLog ? "✓ Đã sao chép" : "Sao chép log"}
                </button>
                {onClearLogs && (
                  <button
                    type="button"
                    onClick={onClearLogs}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "11px",
                      cursor: "pointer"
                    }}
                  >
                    Xóa log
                  </button>
                )}
              </div>
            )}
          </div>

          {/* TAB 1: TASKS LIST */}
          {activeTab === "tasks" && (
            <div style={{ padding: "14px 18px", overflowY: "auto", maxHeight: "360px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {tasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                  Không có tiến trình tải nào.
                </div>
              ) : (
                tasks.map((t, index) => {
                  const isDone = t.isCompleted || (t.percent || 0) >= 100;
                  const isErr = Boolean(t.isError);
                  const isWaiting = !isDone && !isErr && ((t.percent || 0) === 0 || t.status?.toLowerCase().includes("chờ"));
                  const isDownloading = !isDone && !isErr && !isWaiting;
                  const percentVal = Math.min(100, Math.max(0, t.percent || 0));

                  return (
                    <div
                      key={t.task_id}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid",
                        borderColor: isErr
                          ? "rgba(244, 63, 94, 0.3)"
                          : isDone
                          ? "rgba(16, 185, 129, 0.3)"
                          : isDownloading
                          ? "rgba(6, 182, 212, 0.3)"
                          : "rgba(245, 158, 11, 0.25)",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        transition: "all 0.2s ease"
                      }}
                    >
                      {/* Title & Status Badge */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: "8px"
                          }}
                          title={t.title || t.url}
                        >
                          <span style={{
                            fontSize: "11px",
                            fontWeight: "800",
                            color: isDone
                              ? "#34d399"
                              : isDownloading
                              ? "#38bdf8"
                              : isWaiting
                              ? "#fbbf24"
                              : "#fb7185",
                            background: isDone
                              ? "rgba(16, 185, 129, 0.15)"
                              : isDownloading
                              ? "rgba(6, 182, 212, 0.15)"
                              : isWaiting
                              ? "rgba(245, 158, 11, 0.15)"
                              : "rgba(244, 63, 94, 0.15)",
                            border: `1px solid ${
                              isDone
                                ? "rgba(16, 185, 129, 0.3)"
                                : isDownloading
                                ? "rgba(6, 182, 212, 0.3)"
                                : isWaiting
                                ? "rgba(245, 158, 11, 0.3)"
                                : "rgba(244, 63, 94, 0.3)"
                            }`,
                            padding: "2px 7px",
                            borderRadius: "6px",
                            flexShrink: 0
                          }}>
                            Video {index + 1}/{totalCount}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.title || t.url}
                          </span>
                        </div>

                        {/* Status tag */}
                        <div style={{ flexShrink: 0 }}>
                          {isErr ? (
                            <span style={{ fontSize: "11px", fontWeight: "700", color: "#fb7185", background: "rgba(244, 63, 94, 0.15)", padding: "2px 8px", borderRadius: "6px" }}>
                              Lỗi
                            </span>
                          ) : isDone ? (
                            <span style={{ fontSize: "11px", fontWeight: "700", color: "#34d399", background: "rgba(16, 185, 129, 0.15)", padding: "2px 8px", borderRadius: "6px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                              ✓ Đã xong
                            </span>
                          ) : isDownloading ? (
                            <span style={{ fontSize: "11px", fontWeight: "700", color: "#06b6d4", background: "rgba(6, 182, 212, 0.15)", padding: "2px 8px", borderRadius: "6px" }}>
                              {percentVal}%
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", fontWeight: "700", color: "#fbbf24", background: "rgba(245, 158, 11, 0.15)", padding: "2px 8px", borderRadius: "6px" }}>
                              ⏳ Đang chờ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Item Progress Bar: Only show if batch (> 1 video) to avoid duplicate bar for single video */}
                      {totalCount > 1 && !isWaiting && (
                        <div className="progress-track" style={{ height: "5px", background: "rgba(255, 255, 255, 0.06)" }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${percentVal}%`,
                              background: isErr
                                ? "#f43f5e"
                                : isDone
                                ? "#10b981"
                                : "linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #06b6d4 100%)"
                            }}
                          />
                        </div>
                      )}

                      {/* Status Text & Speed / ETA */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: isErr ? "#fb7185" : "var(--text-muted)" }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "260px" }}>
                          {t.status || (isWaiting ? "Đang chờ trong hàng đợi..." : "Đang kết nối luồng tải siêu tốc...")}
                        </span>
                        {!isDone && !isErr && isDownloading && (
                          <span style={{ flexShrink: 0, fontWeight: "600", color: "var(--accent-cyan)" }}>
                            {t.speed && `${t.speed}`} {t.eta && `(còn ~${t.eta})`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: REALTIME LOG CONSOLE */}
          {activeTab === "logs" && (
            <div
              style={{
                padding: "12px 14px",
                background: "#0a0b12",
                fontFamily: "JetBrains Mono, Menlo, Consolas, monospace",
                fontSize: "11px",
                lineHeight: "1.6",
                color: "#e2e8f0",
                maxHeight: "360px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "4px"
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: "#64748b", textAlign: "center", padding: "30px 0" }}>
                  Chưa có nhật ký tải nào được ghi nhận.
                </div>
              ) : (
                logs.map((log) => {
                  let color = "#94a3b8";
                  if (log.type === "success") color = "#34d399";
                  else if (log.type === "error") color = "#fb7185";
                  else if (log.type === "progress") color = "#38bdf8";
                  else if (log.type === "info") color = "#c084fc";

                  return (
                    <div key={log.id} style={{ display: "flex", gap: "8px", wordBreak: "break-word" }}>
                      <span style={{ color: "#475569", flexShrink: 0, userSelect: "none" }}>[{log.time}]</span>
                      <span style={{ color: color }}>{log.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
