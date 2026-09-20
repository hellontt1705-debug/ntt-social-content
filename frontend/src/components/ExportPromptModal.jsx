import React, { useState, useEffect } from "react";
import { FolderDown, Folder, Check, X, Download, FileText } from "lucide-react";
import { browseLocalFolder, exportPromptsToFolder, openSpecificFolder } from "../api";
import { useLanguage } from "../i18n";

export default function ExportPromptModal({
  isOpen,
  onClose,
  promptIds = [],
  prompts = []
}) {
  const { t } = useLanguage();
  const [targetFolder, setTargetFolder] = useState(() => {
    return (
      localStorage.getItem("last_export_prompt_folder") ||
      localStorage.getItem("last_export_folder") ||
      "C:\\Users\\Tuantai\\Downloads"
    );
  });
  const [saveTextFile, setSaveTextFile] = useState(true);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setError(null);
      const saved =
        localStorage.getItem("last_export_prompt_folder") ||
        localStorage.getItem("last_export_folder");
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
        localStorage.setItem("last_export_prompt_folder", res.path);
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
      const res = await exportPromptsToFolder(promptIds, targetFolder.trim(), saveTextFile);
      setResult(res);
      localStorage.setItem("last_export_prompt_folder", targetFolder.trim());
    } catch (err) {
      setError(err.message || "Lỗi khi lưu prompt vào máy tính.");
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(5, 7, 15, 0.85)",
        backdropFilter: "blur(12px)",
        padding: "20px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          backgroundColor: "var(--bg-surface, #10121d)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <FolderDown size={20} color="#a78bfa" />
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#fff" }}>
                Lưu Prompt Vào Thư Mục Máy Tính
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)" }}>
                Hỏi vị trí lưu trên ổ đĩa máy tính (C:\, D:\, E:\...)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted, #94a3b8)",
              cursor: "pointer"
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {/* Selected count chip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.03)",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              marginBottom: "16px"
            }}
          >
            <span style={{ fontSize: "13px", color: "var(--text-secondary, #cbd5e1)" }}>
              Số lượng prompt xuất ra:
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "#a78bfa",
                background: "rgba(139, 92, 246, 0.15)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                padding: "3px 12px",
                borderRadius: "14px"
              }}
            >
              {promptIds.length} prompt
            </span>
          </div>

          {/* Target Folder Input & Browse Button */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "8px",
                color: "#fff"
              }}
            >
              Vị trí ổ đĩa / thư mục lưu:
            </label>

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                style={{
                  flex: 1,
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#fff",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  outline: "none"
                }}
                placeholder="Ví dụ: E:\Prompt_Images hoặc C:\Users\Tuantai\Downloads"
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                disabled={isSaving}
              />
              <button
                type="button"
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
                  color: "#06b6d4",
                  background: "rgba(6, 182, 212, 0.1)",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                <Folder size={15} color="#06b6d4" />
                <span>{isBrowsing ? "Đang chọn..." : "Duyệt Máy..."}</span>
              </button>
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted, #64748b)",
                marginTop: "5px",
                display: "block"
              }}
            >
              Bấm "Duyệt Máy..." để chọn trực tiếp bất kỳ ổ đĩa nào trên máy tính của bạn.
            </span>
          </div>

          {/* Quick presets */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginBottom: "6px" }}>
              Gợi ý vị trí nhanh:
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[
                "C:\\Users\\Tuantai\\Downloads",
                "E:\\Prompt_Images",
                "D:\\Prompts",
                "E:\\Agent-creator"
              ].map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setTargetFolder(path)}
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    color: "var(--text-secondary, #cbd5e1)",
                    cursor: "pointer"
                  }}
                >
                  {path}
                </button>
              ))}
            </div>
          </div>

          {/* Checkbox option: companion prompt txt file */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              padding: "10px 14px",
              borderRadius: "8px",
              marginBottom: "16px",
              cursor: "pointer"
            }}
            onClick={() => setSaveTextFile(!saveTextFile)}
          >
            <input
              type="checkbox"
              id="save_text_file_cb"
              checked={saveTextFile}
              onChange={(e) => setSaveTextFile(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "#8b5cf6" }}
            />
            <label
              htmlFor="save_text_file_cb"
              style={{
                fontSize: "12px",
                color: "var(--text-secondary, #cbd5e1)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <FileText size={14} color="#8b5cf6" />
              <span>Kèm file câu lệnh Prompt (.txt) lưu cùng thư mục với ảnh/video</span>
            </label>
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
                color: "#10b981",
                padding: "14px",
                borderRadius: "8px",
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
                <Check size={16} color="#10b981" />
                <span>{result.message || `Đã lưu thành công ${result.saved_count} file!`}</span>
              </div>
              <button
                type="button"
                onClick={handleOpenFolder}
                style={{
                  alignSelf: "flex-start",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(16, 185, 129, 0.18)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                <Folder size={14} color="#10b981" />
                <span>Mở Thư Mục Vừa Lưu Trên Máy</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            background: "rgba(0, 0, 0, 0.25)",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px"
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "13px",
              color: "var(--text-secondary, #cbd5e1)",
              cursor: "pointer"
            }}
          >
            {result ? "Đóng" : "Hủy"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !targetFolder.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              border: "none",
              borderRadius: "8px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#fff",
              cursor: isSaving || !targetFolder.trim() ? "not-allowed" : "pointer",
              opacity: isSaving || !targetFolder.trim() ? 0.6 : 1,
              boxShadow: "0 4px 15px rgba(139, 92, 246, 0.35)"
            }}
          >
            <Download size={15} color="#fff" />
            <span>{isSaving ? "Đang lưu vào máy..." : `Bắt Đầu Lưu ${promptIds.length} Prompt`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
