import React, { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { browseLocalFolder, exportVideosToFolder, openSpecificFolder } from "../api";
import { useLanguage } from "../i18n";

export default function ExportFolderModal({
  isOpen,
  onClose,
  videoIds = [],
  videos = []
}) {
  const { t } = useLanguage();
  const [targetFolder, setTargetFolder] = useState(() => localStorage.getItem("last_export_folder") || "");
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setError(null);
      const saved = localStorage.getItem("last_export_folder");
      if (saved) setTargetFolder(saved);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    setIsBrowsing(true);
    setError(null);
    try {
      const res = await browseLocalFolder();
      if (res && res.path) {
        setTargetFolder(res.path);
        localStorage.setItem("last_export_folder", res.path);
      }
    } catch (err) {
      setError("Không thể mở hộp thoại chọn thư mục: " + err.message);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleSave = async () => {
    if (!targetFolder.trim()) {
      setError("Vui lòng chọn hoặc nhập đường dẫn thư mục trên máy tính.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await exportVideosToFolder(videoIds, targetFolder.trim());
      setResult(res);
      localStorage.setItem("last_export_folder", targetFolder.trim());
    } catch (err) {
      setError(err.message || "Lỗi khi lưu video vào máy.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openSpecificFolder(targetFolder.trim());
    } catch (err) {
      alert("Không thể mở thư mục: " + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "560px", padding: "0", overflow: "hidden" }}
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
                background: "rgba(139, 92, 246, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Icon name="download" size={18} color="var(--accent-primary)" />
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
          <button className="icon-btn" onClick={onClose}>
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
              {videoIds.length} video
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
                disabled={isSaving}
              />
              <button
                className="btn btn-secondary"
                onClick={handleBrowse}
                disabled={isBrowsing || isSaving}
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

          {/* Quick presets */}
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

          {/* Error display */}
          {error && (
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
              {error}
            </div>
          )}

          {/* Success result */}
          {result && (
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
                <span>{result.message || `Đã lưu thành công ${result.saved_count} video!`}</span>
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
          <button className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
            {result ? "Đóng" : "Hủy"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving || !targetFolder.trim()}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Icon name="download" size={15} color="#fff" />
            <span>{isSaving ? "Đang lưu vào máy..." : `Bắt Đầu Lưu ${videoIds.length} Video`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
