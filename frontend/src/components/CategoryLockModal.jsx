import React, { useState } from "react";
import { Icon } from "./Icons";
import { lockCategory, removeCategoryLock, changeCategoryPassword } from "../api";

export default function CategoryLockModal({
  isOpen,
  onClose,
  category,
  onLockSuccess
}) {
  if (!isOpen || !category) return null;

  const isLocked = Boolean(category.is_locked);
  const [activeTab, setActiveTab] = useState("change"); // "change" | "remove"
  
  // State for setting new lock
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hint, setHint] = useState(category.hint || "");
  const [showPassword, setShowPassword] = useState(false);

  // State for change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [newHint, setNewHint] = useState(category.hint || "");

  // State for remove lock
  const [removePass, setRemovePass] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSetLock = async (e) => {
    e.preventDefault();
    setError("");
    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp!");
      return;
    }
    setLoading(true);
    try {
      await lockCategory(category.id, password.trim(), hint.trim());
      if (onLockSuccess) onLockSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "Lỗi khi khóa danh mục.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    if (!currentPassword.trim()) {
      setError("Vui lòng nhập mật khẩu hiện tại.");
      return;
    }
    if (!newPassword.trim()) {
      setError("Vui lòng nhập mật khẩu mới.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Mật khẩu mới xác nhận không khớp!");
      return;
    }
    setLoading(true);
    try {
      await changeCategoryPassword(category.id, currentPassword.trim(), newPassword.trim(), newHint.trim());
      localStorage.removeItem(`remember_cat_${category.id}`);
      if (onLockSuccess) onLockSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "Lỗi khi đổi mật khẩu.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLock = async (e) => {
    e.preventDefault();
    setError("");
    if (!removePass.trim()) {
      setError("Vui lòng nhập mật khẩu hiện tại để gỡ khóa.");
      return;
    }
    setLoading(true);
    try {
      await removeCategoryLock(category.id, removePass.trim());
      localStorage.removeItem(`remember_cat_${category.id}`);
      if (onLockSuccess) onLockSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "Lỗi khi gỡ khóa danh mục.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "480px", padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(6, 182, 212, 0.08))"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(139, 92, 246, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(139, 92, 246, 0.4)"
              }}
            >
              <Icon name={isLocked ? "shield" : "lock"} size={18} color="#a78bfa" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                {isLocked ? "Quản Lý Khóa Bảo Mật" : "Đặt Mật Khẩu Khóa"}
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Danh mục: <strong style={{ color: "#fff" }}>{category.name}</strong>
              </span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} type="button">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "20px 22px" }}>
          {error && (
            <div
              style={{
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
              <Icon name="alertCircle" size={16} color="#f43f5e" />
              <span>{error}</span>
            </div>
          )}

          {!isLocked ? (
            /* Form Đặt Khóa Mới */
            <form onSubmit={handleSetLock}>
              <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                Khi đặt khóa bảo mật cho danh mục này, toàn bộ video bên trong sẽ <strong style={{ color: "#a78bfa" }}>bị ẩn hoàn toàn khỏi trang "Tất cả Video"</strong> và chỉ xem được khi bạn nhập đúng mật khẩu.
              </p>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontSize: "12.5px" }}>Mật khẩu bảo vệ</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    placeholder="Nhập mật khẩu khóa..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                    style={{ paddingRight: "40px" }}
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

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontSize: "12.5px" }}>Xác nhận mật khẩu</label>
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-input"
                  placeholder="Nhập lại mật khẩu..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label className="form-label" style={{ fontSize: "12.5px" }}>Gợi ý mật khẩu (tùy chọn)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Sinh nhật mẹ, 4 số cuối điện thoại..."
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !password.trim()}
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Icon name="lock" size={15} color="#fff" />
                  <span>{loading ? "Đang khóa..." : "Khóa Danh Mục"}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Quản Lý Khóa Đang Có (Đổi MK / Gỡ Bỏ Khóa) */
            <div>
              {/* Tab Navigation */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "18px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                <button
                  type="button"
                  onClick={() => { setActiveTab("change"); setError(""); }}
                  style={{
                    background: activeTab === "change" ? "rgba(139, 92, 246, 0.2)" : "transparent",
                    color: activeTab === "change" ? "#a78bfa" : "var(--text-muted)",
                    border: activeTab === "change" ? "1px solid rgba(139, 92, 246, 0.4)" : "1px solid transparent",
                    borderRadius: "8px",
                    padding: "6px 14px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Đổi Mật Khẩu
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("remove"); setError(""); }}
                  style={{
                    background: activeTab === "remove" ? "rgba(244, 63, 94, 0.15)" : "transparent",
                    color: activeTab === "remove" ? "#f43f5e" : "var(--text-muted)",
                    border: activeTab === "remove" ? "1px solid rgba(244, 63, 94, 0.35)" : "1px solid transparent",
                    borderRadius: "8px",
                    padding: "6px 14px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Gỡ Bỏ Khóa
                </button>
              </div>

              {activeTab === "change" ? (
                <form onSubmit={handleChangePassword}>
                  <div className="form-group" style={{ marginBottom: "14px" }}>
                    <label className="form-label" style={{ fontSize: "12.5px" }}>Mật khẩu hiện tại</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Nhập mật khẩu đang dùng..."
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: "14px" }}>
                    <label className="form-label" style={{ fontSize: "12.5px" }}>Mật khẩu mới</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Nhập mật khẩu mới..."
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: "14px" }}>
                    <label className="form-label" style={{ fontSize: "12.5px" }}>Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Nhập lại mật khẩu mới..."
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: "20px" }}>
                    <label className="form-label" style={{ fontSize: "12.5px" }}>Gợi ý mật khẩu mới (tùy chọn)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Gợi ý giúp nhớ lại mật khẩu..."
                      value={newHint}
                      onChange={(e) => setNewHint(e.target.value)}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading || !currentPassword.trim() || !newPassword.trim()}
                      style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)" }}
                    >
                      {loading ? "Đang cập nhật..." : "Lưu Mật Khẩu Mới"}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRemoveLock}>
                  <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                    Khi gỡ bỏ khóa, danh mục này sẽ trở thành <strong style={{ color: "#fff" }}>danh mục bình thường</strong>. Các video bên trong sẽ hiển thị công khai trở lại trên trang <strong style={{ color: "#a78bfa" }}>"Tất cả Video"</strong> mà không cần mật khẩu.
                  </p>

                  <div className="form-group" style={{ marginBottom: "20px" }}>
                    <label className="form-label" style={{ fontSize: "12.5px" }}>Nhập mật khẩu hiện tại để xác nhận</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Mật khẩu của danh mục..."
                      value={removePass}
                      onChange={(e) => setRemovePass(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading || !removePass.trim()}
                      style={{
                        background: "linear-gradient(135deg, #e11d48 0%, #be123c 100%)",
                        borderColor: "#be123c",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <Icon name="unlock" size={15} color="#fff" />
                      <span>{loading ? "Đang gỡ khóa..." : "Xác Nhận Gỡ Bỏ Khóa"}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
