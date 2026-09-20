import React, { useState } from "react";
import { Icon } from "./Icons";

export default function CategoryLockScreen({
  category,
  onUnlock,
  onBack
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    setLoading(true);
    try {
      await onUnlock(password.trim(), rememberPassword);
    } catch (err) {
      setError(err.message || "Mật khẩu không chính xác!");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "65vh",
        padding: "20px"
      }}
    >
      <div className={`secret-lock-card ${shake ? "shake-animation" : ""}`} style={{ maxWidth: "440px" }}>
        {/* Glowing Icon */}
        <div className="secret-lock-icon-wrap">
          <Icon name="lock" size={36} color="#a78bfa" />
        </div>

        {/* Category Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(139, 92, 246, 0.15)",
            border: "1px solid rgba(139, 92, 246, 0.35)",
            padding: "4px 12px",
            borderRadius: "20px",
            marginBottom: "12px",
            color: "#a78bfa",
            fontSize: "12px",
            fontWeight: 600
          }}
        >
          <Icon name={category.icon || "folder"} size={13} color="#a78bfa" />
          <span>{category.name}</span>
        </div>

        <h2 style={{ fontSize: "19px", fontWeight: 700, margin: "0 0 8px 0", color: "#fff", textAlign: "center" }}>
          Danh Mục Đã Được Khóa
        </h2>

        <p
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            textAlign: "center",
            margin: "0 0 20px 0",
            lineHeight: "1.5"
          }}
        >
          Nội dung video trong danh mục này được bảo mật và ẩn hoàn toàn khỏi trang <strong>Tất cả Video</strong>. Nhập mật khẩu để mở xem:
        </p>

        {error && (
          <div
            style={{
              width: "100%",
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.35)",
              color: "#f43f5e",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <Icon name="alertCircle" size={15} color="#f43f5e" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: "100%" }}>
          <div className="form-group" style={{ marginBottom: "12px" }}>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                className="form-input"
                placeholder="Nhập mật khẩu mở khóa..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                style={{
                  paddingRight: "40px",
                  fontSize: "14px",
                  padding: "10px 14px",
                  textAlign: "center",
                  letterSpacing: showPassword ? "normal" : "3px"
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
          </div>

          {/* Options: Ghi nhớ mật khẩu & Xem gợi ý */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "14px",
              flexWrap: "wrap",
              padding: "0 2px"
            }}
          >
            {/* Nút tích Ghi nhớ mật khẩu */}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "12.5px",
                color: rememberPassword ? "#a78bfa" : "var(--text-secondary)",
                cursor: "pointer",
                userSelect: "none",
                fontWeight: rememberPassword ? 600 : 400
              }}
              title="Tích ON: Không cần nhập lại mật khẩu khi vào lại danh mục này. Tắt OFF: Phải nhập lại mỗi lần vào."
            >
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(e) => setRememberPassword(e.target.checked)}
                style={{
                  cursor: "pointer",
                  accentColor: "#8b5cf6",
                  width: "15px",
                  height: "15px"
                }}
              />
              <span>Ghi nhớ mật khẩu</span>
            </label>

            {/* Nút tích Xem gợi ý (nếu có gợi ý) */}
            {category.hint && (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: showHint ? "#a78bfa" : "var(--text-muted)",
                  cursor: "pointer",
                  userSelect: "none"
                }}
              >
                <input
                  type="checkbox"
                  checked={showHint}
                  onChange={(e) => setShowHint(e.target.checked)}
                  style={{
                    cursor: "pointer",
                    accentColor: "#8b5cf6",
                    width: "13px",
                    height: "13px"
                  }}
                />
                <span>Xem gợi ý</span>
              </label>
            )}
          </div>

          {/* Khối hiển thị gợi ý khi được tích chọn */}
          {category.hint && showHint && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                background: "rgba(139, 92, 246, 0.12)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                padding: "6px 14px",
                borderRadius: "8px",
                textAlign: "center",
                marginBottom: "16px",
                animation: "fadeIn 0.2s ease-out"
              }}
            >
              💡 Gợi ý: <span style={{ color: "#a78bfa", fontWeight: 600 }}>{category.hint}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !password.trim()}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "14px",
              fontWeight: 600,
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              boxShadow: "0 4px 16px rgba(139, 92, 246, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <Icon name="key" size={16} color="#fff" />
            <span>{loading ? "Đang xác thực..." : "Mở Khóa Danh Mục"}</span>
          </button>
        </form>

        {onBack && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack}
            style={{
              width: "100%",
              marginTop: "10px",
              padding: "10px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            <Icon name="arrowLeft" size={14} />
            <span>Quay Lại Tất Cả Video</span>
          </button>
        )}

        <div
          style={{
            marginTop: "18px",
            fontSize: "11.5px",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            textAlign: "center"
          }}
        >
          <Icon name="shield" size={13} color="var(--text-muted)" />
          <span>
            {rememberPassword
              ? "Đang bật ghi nhớ: Bạn sẽ không cần nhập lại mật khẩu các lần sau"
              : "Tự động khóa lại khi bạn thoát hoặc chuyển sang danh mục khác"}
          </span>
        </div>
      </div>
    </div>
  );
}
