import React, { useState, useRef } from "react";
import { Icon } from "./Icons";
import { updateDriveConfig, testDriveConnection, syncAllToDrive } from "../api";

export default function DriveSettingsModal({
  isOpen,
  onClose,
  driveStatus,
  onDriveStatusUpdated
}) {
  if (!isOpen) return null;

  const [mode, setMode] = useState(driveStatus?.mode || "desktop");
  const [desktopFolder, setDesktopFolder] = useState(driveStatus?.desktop_folder || "G:\\My Drive\\SocialContentVault");
  const [apiCredsJson, setApiCredsJson] = useState("");
  const [targetFolderId, setTargetFolderId] = useState(driveStatus?.target_folder_id || "");
  const [gasUrl, setGasUrl] = useState(driveStatus?.gas_url || "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    setSyncAllResult(null);
    try {
      const res = await syncAllToDrive();
      setSyncAllResult(res);
      if (onDriveStatusUpdated) {
        onDriveStatusUpdated({ ...driveStatus, lastSync: new Date().toISOString() });
      }
    } catch (err) {
      setSyncAllResult({
        success: false,
        message: "Lỗi: " + err.message,
        errors: [err.message]
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testDriveConnection({
        mode,
        desktop_folder: desktopFolder,
        api_creds_json: apiCredsJson || undefined,
        target_folder_id: targetFolderId || undefined,
        gas_url: gasUrl || undefined
      });
      setTestResult(res);
      if (res.success && res.details?.folder_id) {
        setTargetFolderId(res.details.folder_id);
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err.message || "Không thể kết nối đến máy chủ để quét kết nối."
      });
    } finally {
      setIsTesting(false);
    }
  };

  const processJsonFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setMessage({ type: "error", text: "Vui lòng chọn file có định dạng .json" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = JSON.parse(text);
        setApiCredsJson(text);
        setUploadedFile({
          name: file.name,
          size: (file.size / 1024).toFixed(1) + " KB",
          email: parsed.client_email || "N/A",
          project: parsed.project_id || "N/A"
        });
        setMessage({
          type: "success",
          text: `Đã nạp file "${file.name}" thành công! Email bot: ${parsed.client_email || ""}`
        });
      } catch (err) {
        setMessage({ type: "error", text: "File không phải JSON hợp lệ: " + err.message });
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const updated = await updateDriveConfig({
        mode,
        desktop_folder: desktopFolder,
        api_creds_json: apiCredsJson || undefined,
        target_folder_id: targetFolderId || undefined,
        gas_url: gasUrl || undefined
      });
      onDriveStatusUpdated(updated);
      setMessage({ type: "success", text: "Đã cập nhật cấu hình Google Drive thành công!" });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Lỗi khi lưu cấu hình" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="cloud" size={20} color="var(--accent-cyan)" />
            <h3 style={{ fontSize: "17px", fontWeight: 700 }}>Cấu Hình Lưu Trữ Google Drive</h3>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body">
            {message && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                background: message.type === "success" ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)",
                color: message.type === "success" ? "var(--accent-green)" : "#f43f5e",
                border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`
              }}>
                {message.text}
              </div>
            )}

            {/* Mode selection */}
            <div className="form-group">
              <label className="form-label">Chọn phương thức đồng bộ</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div
                  onClick={() => setMode("desktop")}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${mode === "desktop" ? "var(--accent-primary)" : "var(--border-color)"}`,
                    background: mode === "desktop" ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="folder" size={15} color="var(--accent-primary)" />
                    <span>Drive Desktop</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Đồng bộ qua ổ đĩa máy tính (Cực nhanh)
                  </span>
                </div>

                <div
                  onClick={() => setMode("gas")}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${mode === "gas" ? "var(--accent-green)" : "var(--border-color)"}`,
                    background: mode === "gas" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="sparkles" size={15} color="var(--accent-green)" />
                    <span>Apps Script</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    ⚡ Đẩy thẳng Cloud 5TB (Không cần cài app máy)
                  </span>
                </div>

                <div
                  onClick={() => setMode("api")}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${mode === "api" ? "var(--accent-cyan)" : "var(--border-color)"}`,
                    background: mode === "api" ? "rgba(6,182,212,0.12)" : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="cloud" size={15} color="var(--accent-cyan)" />
                    <span>Google Cloud API</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Service Account (Dành cho Shared Drive)
                  </span>
                </div>
              </div>
            </div>

            {/* GAS Mode Setting */}
            {mode === "gas" && (
              <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label className="form-label">URL Ứng Dụng Web (Google Apps Script Web App URL)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={gasUrl}
                  onChange={(e) => setGasUrl(e.target.value)}
                  required
                />
                <div style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.25)",
                  fontSize: "11.5px",
                  color: "var(--text-secondary)",
                  lineHeight: "1.5"
                }}>
                  <strong style={{ color: "var(--accent-green)" }}>⚡ Cách lấy URL trong 1 phút:</strong>
                  <ol style={{ paddingLeft: "16px", margin: "4px 0 0 0" }}>
                    <li>Mở tab Google Apps Script vừa mở trên trình duyệt.</li>
                    <li>Dán đoạn mã kết nối ➔ Bấm <strong>Lưu (Ctrl + S)</strong>.</li>
                    <li>Bấm nút <strong>Triển khai (Deploy)</strong> ở góc trên ➔ <strong>Triển khai mới (New deployment)</strong>.</li>
                    <li>Bấm biểu tượng bánh răng ⚙️ ➔ Chọn <strong>Ứng dụng web (Web app)</strong>.</li>
                    <li>Mục <em>Người có quyền truy cập</em>: Chọn <strong>Bất kỳ ai (Anyone)</strong> ➔ Bấm <strong>Triển khai</strong>.</li>
                    <li>Copy link Web App dán vào ô trên!</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Desktop Mode Setting */}
            {mode === "desktop" && (
              <div className="form-group">
                <label className="form-label">Đường dẫn thư mục Google Drive trên máy tính</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: G:\My Drive\SocialContentVault hoặc D:\GoogleDrive\Videos"
                  value={desktopFolder}
                  onChange={(e) => setDesktopFolder(e.target.value)}
                  required
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  💡 Mẹo: Cài đặt ứng dụng "Google Drive for Desktop" từ Google. Sau đó mở My Computer và copy đường dẫn thư mục Google Drive của bạn dán vào đây. App sẽ tự động đồng bộ video lên đám mây tức thì!
                </span>
              </div>
            )}

            {/* API Mode Setting */}
            {mode === "api" && (
              <>
                <div className="form-group">
                  <label className="form-label">File Khóa JSON (Service Account Credentials)</label>

                  {/* Hidden file input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={(e) => processJsonFile(e.target.files?.[0])}
                  />

                  {/* Modern Dropzone & File Picker */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      processJsonFile(e.dataTransfer.files?.[0]);
                    }}
                    style={{
                      border: "2px dashed var(--accent-cyan)",
                      borderRadius: "var(--radius-md)",
                      padding: "20px 16px",
                      textAlign: "center",
                      background: "rgba(6, 182, 212, 0.05)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      background: "rgba(6, 182, 212, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <Icon name="download" size={18} color="var(--accent-cyan)" />
                    </div>
                    <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#fff" }}>
                      Bấm để chọn file JSON hoặc kéo thả file vào đây
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Chọn file <strong style={{ color: "var(--accent-cyan)" }}>.json</strong> tải về từ Google Cloud Console
                    </div>
                  </div>

                  {/* File Info Badge when loaded */}
                  {uploadedFile && (
                    <div style={{
                      marginTop: "10px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      fontSize: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "var(--accent-green)" }}>
                        <span>📄 {uploadedFile.name} ({uploadedFile.size})</span>
                        <span>✅ Đã nạp thành công</span>
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                        Bot Email: <code style={{ color: "var(--accent-cyan)", wordBreak: "break-all" }}>{uploadedFile.email}</code>
                      </div>
                    </div>
                  )}

                  {!uploadedFile && driveStatus?.has_api_creds && (
                    <div style={{
                      marginTop: "8px",
                      fontSize: "11.5px",
                      color: "var(--accent-green)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}>
                      <span>✅ Hệ thống đã lưu sẵn file Service Account JSON (chỉ cần tải file mới nếu bạn muốn thay đổi).</span>
                    </div>
                  )}

                  {/* Optional Toggle raw JSON */}
                  <div style={{ marginTop: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setShowRawJson(!showRawJson)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        fontSize: "11.5px",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0
                      }}
                    >
                      {showRawJson ? "▼ Thu gọn nội dung JSON thủ công" : "► Dán hoặc xem nội dung JSON thủ công"}
                    </button>

                    {showRawJson && (
                      <textarea
                        className="form-textarea"
                        style={{ minHeight: "85px", marginTop: "8px", fontFamily: "var(--font-mono)", fontSize: "11px" }}
                        placeholder='Dán nội dung JSON trực tiếp tại đây nếu muốn...'
                        value={apiCredsJson}
                        onChange={(e) => {
                          setApiCredsJson(e.target.value);
                          try {
                            const parsed = JSON.parse(e.target.value);
                            setUploadedFile({
                              name: "manual_paste.json",
                              size: "custom",
                              email: parsed.client_email || "N/A",
                              project: parsed.project_id || "N/A"
                            });
                          } catch (err) {}
                        }}
                      />
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Google Drive Folder ID (Tùy chọn)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ID thư mục đích trên Google Drive (chuỗi ký tự trên thanh URL Drive)"
                    value={targetFolderId}
                    onChange={(e) => setTargetFolderId(e.target.value)}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                    💡 Mẹo: Mở thư mục trên Google Drive web và copy chuỗi ký tự phía sau <code>folders/</code> trên thanh địa chỉ.
                  </span>
                </div>
              </>
            )}

            {/* Quét & Kiểm Tra Kết Nối Trực Tiếp */}
            <div style={{
              marginTop: "16px",
              padding: "14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="sparkles" size={15} color="var(--accent-cyan)" />
                    <span>Quét & Kiểm Tra Kết Nối Google Drive</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Xác thực bot và kiểm tra xem có quyền lưu video vào thư mục Drive hay không
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  style={{
                    background: isTesting ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(59,130,246,0.2) 100%)",
                    color: "var(--accent-cyan)",
                    border: "1px solid rgba(6, 182, 212, 0.4)",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    padding: "7px 15px",
                    borderRadius: "8px",
                    cursor: isTesting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.2s ease"
                  }}
                >
                  <Icon name="search" size={14} color="var(--accent-cyan)" />
                  <span>{isTesting ? "Đang quét kết nối..." : "🔍 Quét Kết Nối Ngay"}</span>
                </button>
              </div>

              {/* Hộp hiển thị kết quả kiểm tra */}
              {testResult && (
                <div style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  background: testResult.success ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                  border: `1px solid ${testResult.success ? "rgba(16, 185, 129, 0.35)" : "rgba(244, 63, 94, 0.35)"}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: testResult.success ? "var(--accent-green)" : "#f43f5e" }}>
                    <span>{testResult.success ? "✅ KẾT NỐI GOOGLE DRIVE THÀNH CÔNG RỰC RỠ!" : "❌ KẾT NỐI CHƯA THÀNH CÔNG"}</span>
                  </div>

                  <div style={{ color: testResult.success ? "var(--text-primary)" : "#fca5a5", fontSize: "12px", lineHeight: "1.4" }}>
                    {testResult.message || testResult.error}
                  </div>

                  {testResult.details && (
                    <div style={{
                      marginTop: "6px",
                      paddingTop: "6px",
                      borderTop: "1px dashed rgba(255,255,255,0.1)",
                      fontSize: "11.5px",
                      color: "var(--text-secondary)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}>
                      {testResult.details.folder_name && (
                        <div>📁 Thư mục đích: <strong style={{ color: "#fff" }}>{testResult.details.folder_name}</strong></div>
                      )}
                      {testResult.details.can_write !== undefined && (
                        <div>📝 Quyền ghi file: <strong style={{ color: testResult.details.can_write ? "var(--accent-green)" : "#f43f5e" }}>{testResult.details.can_write ? "Đầy đủ quyền Editor (Sẵn sàng tải lên)" : "Chưa có quyền Editor"}</strong></div>
                      )}
                      {testResult.details.bot_email && (
                        <div>🤖 Tài khoản Bot: <code style={{ color: "var(--accent-cyan)" }}>{testResult.details.bot_email}</code></div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section: Đồng bộ tất cả dữ liệu & Sao lưu DB */}
          <div style={{
            margin: "0 24px 16px 24px",
            padding: "14px 16px",
            borderRadius: "10px",
            background: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="cloud" size={15} color="var(--accent-cyan)" />
                  Đồng Bộ Toàn Bộ Dữ Liệu & Video Lên Drive
                </span>
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  Lưu trữ toàn bộ video và sao lưu file database (.db) lên Google Drive
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSyncAll}
                disabled={isSyncingAll}
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  whiteSpace: "nowrap",
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Icon name="cloud" size={14} color="#fff" />
                <span>{isSyncingAll ? "Đang đồng bộ..." : "Đồng Bộ Tất Cả Lên Drive"}</span>
              </button>
            </div>

            {syncAllResult && (
              <div style={{
                padding: "10px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                background: syncAllResult.success ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                border: `1px solid ${syncAllResult.success ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)"}`,
                color: syncAllResult.success ? "var(--accent-green)" : "#fca5a5",
                display: "flex",
                flexDirection: "column",
                gap: "4px"
              }}>
                <div style={{ fontWeight: 600 }}>{syncAllResult.message}</div>
                {syncAllResult.errors && syncAllResult.errors.length > 0 && (
                  <div style={{ fontSize: "11px", marginTop: "4px", color: "#f87171" }}>
                    {syncAllResult.errors.map((err, i) => (
                      <div key={i}>⚠️ {err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Đóng
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              <Icon name="check" size={15} color="#fff" />
              <span>{isSaving ? "Đang lưu..." : "Lưu Cài Đặt"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
