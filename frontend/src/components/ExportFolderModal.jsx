import React, { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { browseLocalFolder, exportVideosToFolder, openSpecificFolder, cancelExport } from "../api";
import { useLanguage } from "../i18n";

export default function ExportFolderModal({
  isOpen,
  onClose,
  videoIds = [],
  videos = [],
  exportState = null,
  onStartExport = null,
  onResetExport = null
}) {
  const { t } = useLanguage();
  const [targetFolder, setTargetFolder] = useState(() => localStorage.getItem("last_export_folder") || "");
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [sessionExportStarted, setSessionExportStarted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
      setSessionExportStarted(false);
      const saved = localStorage.getItem("last_export_folder");
      if (saved) setTargetFolder(saved);
    }
  }, [isOpen, videoIds]);

  if (!isOpen) return null;

  // Xác định xem có tiến trình export đang chạy cho tác vụ này không
  const isExporting = Boolean(exportState && !exportState.is_completed && !exportState.is_error && !exportState.is_cancelled);
  // Chỉ hiển thị màn hình hoàn thành nếu tiến trình được bắt đầu trong phiên này HOẶC mở từ widget bên ngoài (không có videoIds mới được chọn)
  const isCompleted = Boolean(exportState && exportState.is_completed && (sessionExportStarted || videoIds.length === 0));
  const hasError = Boolean(localError || (exportState && exportState.is_error && (sessionExportStarted || videoIds.length === 0)));

  const handleBrowse = async () => {
    setIsBrowsing(true);
    setLocalError(null);
    try {
      const res = await browseLocalFolder();
      if (res && res.path) {
        setTargetFolder(res.path);
        localStorage.setItem("last_export_folder", res.path);
      }
    } catch (err) {
      setLocalError("Không thể mở hộp thoại chọn thư mục: " + err.message);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleSave = async () => {
    if (!targetFolder.trim()) {
      setLocalError("Vui lòng chọn hoặc nhập đường dẫn thư mục trên máy tính.");
      return;
    }
    setIsStarting(true);
    setLocalError(null);
    try {
      localStorage.setItem("last_export_folder", targetFolder.trim());
      setSessionExportStarted(true);
      if (onStartExport) {
        await onStartExport(videoIds, targetFolder.trim());
      } else {
        await exportVideosToFolder(videoIds, targetFolder.trim());
      }
    } catch (err) {
      setLocalError(err.message || "Lỗi khi bắt đầu lưu video vào máy.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenFolder = async () => {
    const folderToOpen = exportState?.target_folder || targetFolder.trim();
    try {
      await openSpecificFolder(folderToOpen);
    } catch (err) {
      alert("Không thể mở thư mục: " + err.message);
    }
  };

  const handleCancelExport = async () => {
    if (exportState?.id) {
      if (confirm("Bạn có chắc muốn dừng tiến trình lưu video vào máy tính?")) {
        try {
          await cancelExport(exportState.id);
        } catch (e) {}
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "580px", padding: "0", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: isCompleted
                  ? "rgba(16, 185, 129, 0.15)"
                  : "rgba(139, 92, 246, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Icon
                name={isCompleted ? "check" : "download"}
                size={18}
                color={isCompleted ? "var(--accent-green)" : "var(--accent-primary)"}
              />
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                Lưu Video Vào Thư Mục Máy Tính
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Hỏi vị trí lưu trên ổ đĩa máy tính (C:\, D:\, E:\...)
              </span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Đóng / Thu nhỏ ra ngoài">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {/* Selected items chip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.03)",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              marginBottom: "16px"
            }}
          >
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Số lượng video xuất ra:
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "var(--accent-cyan)",
                background: "rgba(6, 182, 212, 0.12)",
                padding: "2px 10px",
                borderRadius: "12px"
              }}
            >
              {exportState?.total || videoIds.length} video
            </span>
          </div>

          {/* Folder input & Native picker button */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "8px",
                color: "var(--text-primary)"
              }}
            >
              Vị trí ổ đĩa / thư mục lưu:
            </label>

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                className="form-input"
                style={{ flex: 1, fontFamily: "monospace", fontSize: "12px" }}
                placeholder="Ví dụ: E:\videos hoặc D:\TikTok_Vault"
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                disabled={isExporting}
              />
              <button
                className="btn btn-secondary"
                onClick={handleBrowse}
                disabled={isBrowsing || isExporting}
                title="Mở cửa sổ duyệt thư mục của máy tính"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                  padding: "0 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--accent-cyan)",
                  borderColor: "rgba(6, 182, 212, 0.3)"
                }}
              >
                <Icon name="folder" size={15} color="var(--accent-cyan)" />
                <span>{isBrowsing ? "Đang chọn..." : "Duyệt Máy..."}</span>
              </button>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
              Bấm "Duyệt Máy..." để chọn trực tiếp bất kỳ ổ đĩa nào trên máy tính của bạn.
            </span>
          </div>

          {/* Quick presets (only shown when not exporting) */}
          {!isExporting && !isCompleted && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
                Gợi ý vị trí nhanh:
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {["E:\\videos", "E:\\Video mẫu để thực hành", "D:\\Videos", "C:\\Users\\Tuantai\\Downloads"].map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setTargetFolder(path)}
                    style={{
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      cursor: "pointer"
                    }}
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* REALTIME RUNNING PROGRESS SECTION */}
          {isExporting && exportState && (
            <div
              style={{
                background: "rgba(6, 182, 212, 0.08)",
                border: "1px solid rgba(6, 182, 212, 0.3)",
                borderRadius: "10px",
                padding: "16px",
                marginBottom: "16px"
              }}
            >
              {/* Progress title & percent */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--accent-cyan)",
                      boxShadow: "0 0 10px var(--accent-cyan)"
                    }}
                  />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent-cyan)" }}>
                    Đang lưu: {exportState.current} / {exportState.total} video
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--accent-cyan)",
                    background: "rgba(6, 182, 212, 0.18)",
                    padding: "2px 8px",
                    borderRadius: "10px"
                  }}
                >
                  {exportState.percent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div
                className="progress-track"
                style={{
                  height: "8px",
                  background: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginBottom: "10px"
                }}
              >
                <div
                  className="progress-fill"
                  style={{
                    width: `${exportState.percent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                    transition: "width 0.3s ease",
                    borderRadius: "4px"
                  }}
                />
              </div>

              {/* Current status text */}
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  background: "rgba(0, 0, 0, 0.2)",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  marginBottom: "12px"
                }}
              >
                {exportState.status || `Đang lưu: "${exportState.current_title}"...`}
              </div>

              {/* Helpful note about exiting outside */}
              <div
                style={{
                  fontSize: "11.5px",
                  color: "var(--accent-secondary)",
                  background: "rgba(139, 92, 246, 0.1)",
                  border: "1px dashed rgba(139, 92, 246, 0.3)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px"
                }}
              >
                <span>
                  💡 <b>Quan sát bên ngoài:</b> Bạn có thể đóng cửa sổ này để làm việc khác. Thanh tiến trình đang hiển thị ở góc màn hình bên ngoài để bạn tiện theo dõi.
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onClose}
                  style={{
                    whiteSpace: "nowrap",
                    fontSize: "11.5px",
                    padding: "4px 10px",
                    color: "var(--accent-cyan)",
                    borderColor: "rgba(6, 182, 212, 0.4)"
                  }}
                >
                  Thu Nhỏ Ra Ngoài
                </button>
              </div>
            </div>
          )}

          {/* Error display */}
          {hasError && (
            <div
              style={{
                background: "rgba(244, 63, 94, 0.1)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                color: "#f43f5e",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                marginBottom: "16px"
              }}
            >
              {localError || exportState?.status || "Lỗi khi lưu video vào máy."}
            </div>
          )}

          {/* Success result */}
          {isCompleted && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "var(--accent-green)",
                padding: "14px",
                borderRadius: "8px",
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
                <Icon name="check" size={16} color="var(--accent-green)" />
                <span>{exportState?.message || `Đã lưu thành công ${exportState?.saved_count || videoIds.length} video!`}</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleOpenFolder}
                style={{
                  alignSelf: "flex-start",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(16, 185, 129, 0.15)",
                  borderColor: "rgba(16, 185, 129, 0.4)",
                  color: "#fff",
                  fontWeight: 600
                }}
              >
                <Icon name="folder" size={14} color="var(--accent-green)" />
                <span>Mở Thư Mục Vừa Lưu Trên Máy</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            background: "rgba(0, 0, 0, 0.2)",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px"
          }}
        >
          {isExporting ? (
            <>
              <button className="btn btn-secondary" onClick={handleCancelExport} style={{ color: "#f43f5e" }}>
                Hủy Lưu
              </button>
              <button className="btn btn-primary" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="check" size={15} color="#fff" />
                <span>Thu Nhỏ Ra Ngoài Quan Sát</span>
              </button>
            </>
          ) : isCompleted ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", justifyContent: "space-between" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSessionExportStarted(false);
                  if (onResetExport) onResetExport();
                }}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Icon name="plus" size={14} />
                <span>Lưu Thêm Video Khác</span>
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Đóng
              </button>
            </div>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose} disabled={isStarting}>
                Hủy
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isStarting || !targetFolder.trim()}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Icon name="download" size={15} color="#fff" />
                <span>{isStarting ? "Đang khởi chạy..." : `Bắt Đầu Lưu ${videoIds.length} Video`}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

