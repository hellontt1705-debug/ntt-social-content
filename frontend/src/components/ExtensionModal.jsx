import React, { useState } from "react";
import { Icon } from "./Icons";

export default function ExtensionModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const extensionPath = "e:\\Agent-creator\\social-content-os\\extension";

  if (!isOpen) return null;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(extensionPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content glass-panel"
        style={{ maxWidth: "620px", width: "95%", padding: "26px 28px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 16px rgba(139, 92, 246, 0.5)",
              }}
            >
              <Icon name="sparkles" size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#fff" }}>
                Tiện Ích Cửa Sổ Nhỏ (Chrome Extension)
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)", margin: 0 }}>
                Tải video ngay khi đang lướt TikTok, X, Douyin... mà không cần chuyển tab!
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ borderRadius: "50%" }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Feature Highlights */}
        <div
          style={{
            background: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            borderRadius: "14px",
            padding: "14px 16px",
            marginBottom: "20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#e2e8f0" }}>
            <span style={{ color: "#a855f7", fontSize: "16px" }}>🟣</span>
            <span><b>Nút tròn tím nổi</b> cố định mép màn hình</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#e2e8f0" }}>
            <span style={{ color: "#38bdf8", fontSize: "16px" }}>⚡</span>
            <span><b>Tự động bóc link video</b> 1-chạm không cần copy</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#e2e8f0" }}>
            <span style={{ color: "#10b981", fontSize: "16px" }}>📊</span>
            <span><b>Thanh tiến độ kính mờ</b> chạy trực tiếp trên trang</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#e2e8f0" }}>
            <span style={{ color: "#ec4899", fontSize: "16px" }}>🗂️</span>
            <span><b>Thẻ Lịch sử (History)</b> xem ảnh thumbnail ngay</span>
          </div>
        </div>

        {/* Installation Path */}
        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-muted, #94a3b8)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
            ĐƯỜNG DẪN THƯ MỤC EXTENSION TRÊN MÁY BẠN:
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "10px",
              padding: "8px 12px",
              gap: "10px",
            }}
          >
            <code style={{ flex: 1, fontSize: "12px", color: "#a5b4fc", wordBreak: "break-all" }}>
              {extensionPath}
            </code>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleCopyPath}
              style={{ flexShrink: 0, padding: "5px 12px", fontSize: "12px" }}
            >
              <Icon name="copy" size={12} />
              <span>{copied ? "Đã chép!" : "Sao chép"}</span>
            </button>
          </div>
        </div>

        {/* 3 Step Guide */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "22px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "rgba(139, 92, 246, 0.3)",
                color: "#c084fc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "12px",
                flexShrink: 0,
              }}
            >
              1
            </div>
            <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.5 }}>
              Mở tab mới trên trình duyệt (Chrome / Cốc Cốc / Edge) và truy cập đường dẫn:{" "}
              <b style={{ color: "#38bdf8" }}>chrome://extensions</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "rgba(139, 92, 246, 0.3)",
                color: "#c084fc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "12px",
                flexShrink: 0,
              }}
            >
              2
            </div>
            <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.5 }}>
              Bật công tắc <b>"Chế độ dành cho nhà phát triển" (Developer mode)</b> ở góc trên bên phải màn hình.
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "rgba(139, 92, 246, 0.3)",
                color: "#c084fc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "12px",
                flexShrink: 0,
              }}
            >
              3
            </div>
            <div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.5 }}>
              Bấm nút <b>"Tải tiện ích đã giải nén" (Load unpacked)</b> ở góc trái $\rightarrow$ Dán hoặc chọn thư mục{" "}
              <b style={{ color: "#c084fc" }}>extension</b> vừa sao chép ở trên.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#10b981" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }}></span>
            <span>Backend API: <b>http://127.0.0.1:8000</b></span>
          </div>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "8px 20px" }}>
            Đã Hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
