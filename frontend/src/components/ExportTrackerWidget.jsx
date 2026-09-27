import React, { useState } from "react";
import { Icon } from "./Icons";
import { openSpecificFolder } from "../api";

export default function ExportTrackerWidget({
  exportState,
  isOpen,
  onClose,
  onOpenModal,
  onCancel,
  hasDownloadTrackerOpen = false
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  if (!isOpen || !exportState) return null;

  const {
    total = 0,
    current = 0,
    percent = 0,
    target_folder = "",
    current_title = "",
    status = "",
    saved_count = 0,
    errors = [],
    is_completed = false,
    is_error = false,
    is_cancelled = false
  } = exportState;

  const handleOpenFolder = async (e) => {
    e.stopPropagation();
    if (!target_folder) return;
    setIsOpeningFolder(true);
    try {
      await openSpecificFolder(target_folder);
    } catch (err) {
      alert("Không thể mở thư mục: " + err.message);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    if (confirm("Bạn có chắc muốn dừng tiến trình lưu video vào máy tính?")) {
      if (onCancel) onCancel();
    }
  };

  // Vị trí: Đặt ở góc dưới bên phải. Nếu DownloadTrackerWidget đang mở, tự động đẩy lên phía trên để không bị chồng đè
  const bottomPosition = hasDownloadTrackerOpen ? "110px" : "20px";

  return (
    <div
      className="export-tracker-widget"
      style={{
        position: "fixed",
        bottom: bottomPosition,
        right: "24px",
        zIndex: 9998,
        width: isExpanded ? "440px" : "320px",
        maxWidth: "calc(100vw - 32px)",
        background: "rgba(13, 17, 28, 0.96)",
        backdropFilter: "blur(20px)",
        border: is_completed
          ? "1px solid rgba(16, 185, 129, 0.45)"
          : is_error
          ? "1px solid rgba(244, 63, 94, 0.45)"
          : "1px solid rgba(6, 182, 212, 0.45)",
        borderRadius: "14px",
        boxShadow: is_completed
          ? "0 14px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(16, 185, 129, 0.18)"
          : "0 14px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(6, 182, 212, 0.18)",
        color: "var(--text-primary)",
        overflow: "hidden",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
      }}
    >
      {/* 1. THU NHỎ / COMPACT BAR */}
      {!isExpanded ? (
        <div
          style={{
            padding: "10px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px"
          }}
          onClick={() => setIsExpanded(true)}
          title="Bấm để mở rộng chi tiết"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: is_completed
                  ? "rgba(16, 185, 129, 0.2)"
                  : "rgba(6, 182, 212, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Icon
                name={is_completed ? "check" : "download"}
                size={15}
                color={is_completed ? "var(--accent-green)" : "var(--accent-cyan)"}
              />
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "12.5px",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {is_completed
                  ? `Đã lưu: ${saved_count}/${total} video`
                  : `Đang lưu máy: ${current}/${total} (${percent}%)`}
              </div>
              <div
                style={{
                  fontSize: "10.5px",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {is_completed ? target_folder : status || current_title}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              className="icon-btn"
              title="Mở rộng chi tiết"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              style={{ padding: "4px" }}
            >
              <Icon name="chevronUp" size={15} />
            </button>
            <button
              className="icon-btn"
              title="Đóng thanh tiến trình"
              onClick={(e) => {
                e.stopPropagation();
                if (onClose) onClose();
              }}
              style={{ padding: "4px" }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
      ) : (
        /* 2. MỞ RỘNG / EXPANDED FULL CARD */
        <div>
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.02)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: is_completed
                    ? "rgba(16, 185, 129, 0.18)"
                    : is_error
                    ? "rgba(244, 63, 94, 0.18)"
                    : "rgba(6, 182, 212, 0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <Icon
                  name={is_completed ? "check" : "download"}
                  size={16}
                  color={
                    is_completed
                      ? "var(--accent-green)"
                      : is_error
                      ? "#f43f5e"
                      : "var(--accent-cyan)"
                  }
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <h4
                  style={{
                    margin: 0,
                    fontSize: "13.5px",
                    fontWeight: 700,
                    color: "var(--text-primary)"
                  }}
                >
                  Lưu Video Vào Thư Mục Máy Tính
                </h4>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    marginTop: "2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "280px"
                  }}
                  title={target_folder}
                >
                  <Icon name="folder" size={11} color="var(--accent-cyan)" />
                  <span style={{ fontFamily: "monospace" }}>{target_folder}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {onOpenModal && (
                <button
                  className="icon-btn"
                  title="Mở lại cửa sổ chi tiết"
                  onClick={onOpenModal}
                  style={{ padding: "4px", color: "var(--accent-cyan)" }}
                >
                  <Icon name="search" size={14} />
                </button>
              )}
              <button
                className="icon-btn"
                title="Thu nhỏ"
                onClick={() => setIsExpanded(false)}
                style={{ padding: "4px" }}
              >
                <Icon name="chevronDown" size={15} />
              </button>
              <button
                className="icon-btn"
                title="Đóng"
                onClick={() => {
                  if (onClose) onClose();
                }}
                style={{ padding: "4px" }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "14px 16px" }}>
            {/* Status counts & percentage */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px"
              }}
            >
              <span
                style={{
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: is_completed ? "var(--accent-green)" : "var(--text-primary)"
                }}
              >
                {is_completed
                  ? `Đã lưu thành công ${saved_count}/${total} video`
                  : is_cancelled
                  ? "Tiến trình đã dừng"
                  : `Đang xử lý: ${current}/${total} video`}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: is_completed ? "var(--accent-green)" : "var(--accent-cyan)",
                  background: is_completed
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(6, 182, 212, 0.15)",
                  padding: "1px 8px",
                  borderRadius: "10px"
                }}
              >
                {percent}%
              </span>
            </div>

            {/* Animated Progress Bar */}
            <div
              className="progress-track"
              style={{
                height: "6px",
                background: "rgba(255, 255, 255, 0.08)",
                borderRadius: "4px",
                overflow: "hidden",
                marginBottom: "10px"
              }}
            >
              <div
                className="progress-fill"
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  background: is_completed
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : is_error
                    ? "#f43f5e"
                    : "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                  transition: "width 0.3s ease",
                  borderRadius: "4px"
                }}
              />
            </div>

            {/* Realtime Status / Current Video info */}
            <div
              style={{
                fontSize: "11.5px",
                color: "var(--text-secondary)",
                lineHeight: "1.4",
                background: "rgba(255, 255, 255, 0.03)",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                marginBottom: "12px"
              }}
            >
              {is_completed ? (
                <div style={{ color: "var(--accent-green)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="check" size={13} color="var(--accent-green)" />
                  <span>Hoàn tất lưu video vào máy tính! Tất cả file đã sẵn sàng.</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: "var(--accent-cyan)",
                      boxShadow: "0 0 8px var(--accent-cyan)",
                      flexShrink: 0
                    }}
                  />
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: 1
                    }}
                  >
                    {status || `Đang lưu: "${current_title}"...`}
                  </span>
                </div>
              )}
            </div>

            {/* Errors if any */}
            {errors && errors.length > 0 && (
              <div
                style={{
                  fontSize: "11px",
                  color: "#f43f5e",
                  background: "rgba(244, 63, 94, 0.1)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  marginBottom: "10px"
                }}
              >
                ⚠️ Có {errors.length} video gặp lỗi khi lưu.
              </div>
            )}

            {/* Bottom Actions */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px"
              }}
            >
              {is_completed ? (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleOpenFolder}
                    disabled={isOpeningFolder}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      color: "var(--accent-green)",
                      borderColor: "rgba(16, 185, 129, 0.4)",
                      background: "rgba(16, 185, 129, 0.12)",
                      fontWeight: 600
                    }}
                  >
                    <Icon name="folder" size={13} color="var(--accent-green)" />
                    <span>{isOpeningFolder ? "Đang mở..." : "Mở Thư Mục Máy Tính"}</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (onClose) onClose();
                    }}
                    style={{ fontSize: "12px", padding: "4px 12px" }}
                  >
                    Đóng
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (onOpenModal) onOpenModal();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "11.5px",
                      color: "var(--accent-cyan)",
                      borderColor: "rgba(6, 182, 212, 0.3)"
                    }}
                  >
                    <Icon name="search" size={12} color="var(--accent-cyan)" />
                    <span>Xem chi tiết</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleCancel}
                    style={{
                      fontSize: "11.5px",
                      color: "var(--text-muted)",
                      padding: "4px 10px"
                    }}
                  >
                    Hủy lưu
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
