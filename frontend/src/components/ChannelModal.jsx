import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import { fetchChannelInfoFromUrl } from "../api";

export default function ChannelModal({
  isOpen,
  onClose,
  channel = null,
  categories = [],
  onOpenCategoryModal,
  onSave
}) {
  const [formData, setFormData] = useState({
    platform: "tiktok",
    name: "",
    handle: "",
    url: "",
    avatar_url: "",
    email: "",
    orientation: "",
    status: "active",
    category_id: "default",
    followers_count: 0,
    following_count: 0,
    likes_count: 0,
    posts_count: 0,
    views_count: 0,
    bio: "",
    notes: ""
  });

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSuccess, setScanSuccess] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Phân cấp cây danh mục
  const { rootCategories, childrenMap } = useMemo(() => {
    const roots = [];
    const children = {};
    (categories || []).forEach((c) => {
      if (!c.parent_id) roots.push(c);
      else {
        if (!children[c.parent_id]) children[c.parent_id] = [];
        children[c.parent_id].push(c);
      }
    });
    return { rootCategories: roots, childrenMap: children };
  }, [categories]);

  useEffect(() => {
    if (channel) {
      setFormData({
        platform: channel.platform || "tiktok",
        name: channel.name || "",
        handle: channel.handle || "",
        url: channel.url || "",
        avatar_url: channel.avatar_url || "",
        email: channel.email || "",
        orientation: channel.orientation || "",
        status: channel.status || "active",
        category_id: channel.category_id || "default",
        followers_count: channel.followers_count || 0,
        following_count: channel.following_count || 0,
        likes_count: channel.likes_count || 0,
        posts_count: channel.posts_count || 0,
        views_count: channel.views_count || 0,
        bio: channel.bio || "",
        notes: channel.notes || ""
      });
      if (channel.avatar_url || channel.bio || channel.notes) {
        setShowMore(true);
      }
    } else {
      setFormData({
        platform: "tiktok",
        name: "",
        handle: "",
        url: "",
        avatar_url: "",
        email: "",
        orientation: "",
        status: "active",
        category_id: "default",
        followers_count: 0,
        following_count: 0,
        likes_count: 0,
        posts_count: 0,
        views_count: 0,
        bio: "",
        notes: ""
      });
      setShowMore(false);
    }
    setScanError("");
    setScanSuccess(false);
  }, [channel, isOpen]);

  if (!isOpen) return null;

  const detectPlatformFromUrl = (url) => {
    const u = (url || "").toLowerCase();
    if (u.includes("douyin.com") || u.includes("iesdouyin.com")) return "douyin";
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
    if (u.includes("tiktok.com")) return "tiktok";
    if (u.includes("instagram.com")) return "instagram";
    if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
    if (u.includes("twitter.com") || u.includes("x.com")) return "x";
    return null;
  };

  const handleUrlChange = (newUrl) => {
    const detected = detectPlatformFromUrl(newUrl);
    setFormData(prev => ({
      ...prev,
      url: newUrl,
      ...(detected ? { platform: detected } : {})
    }));
  };

  const handleAutoScan = async () => {
    if (!formData.url.trim()) {
      setScanError("Vui lòng nhập link kênh trước khi quét");
      return;
    }
    setIsScanning(true);
    setScanError("");
    setScanSuccess(false);

    try {
      const detected = detectPlatformFromUrl(formData.url.trim()) || formData.platform;
      const res = await fetchChannelInfoFromUrl(formData.url.trim(), detected);
      if (res && res.data) {
        const d = res.data;
        setFormData(prev => ({
          ...prev,
          platform: d.platform || detected || prev.platform,
          name: d.name || prev.name,
          handle: d.handle || prev.handle,
          url: d.url || prev.url,
          avatar_url: d.avatar_url || prev.avatar_url,
          followers_count: d.followers_count !== undefined ? d.followers_count : prev.followers_count,
          following_count: d.following_count !== undefined ? d.following_count : prev.following_count,
          likes_count: d.likes_count !== undefined ? d.likes_count : prev.likes_count,
          posts_count: d.posts_count !== undefined ? d.posts_count : prev.posts_count,
          views_count: d.views_count !== undefined ? d.views_count : prev.views_count,
          bio: d.bio || prev.bio
        }));
        setScanSuccess(true);
        if (d.avatar_url || d.bio) {
          setShowMore(true);
        }
      }
    } catch (err) {
      setScanError(err.message || "Không thể quét thông tin từ link này.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Vui lòng nhập tên kênh!");
      return;
    }
    onSave(formData);
  };

  const platformOptions = [
    { value: "tiktok", label: "TikTok" },
    { value: "youtube", label: "YouTube" },
    { value: "instagram", label: "Instagram" },
    { value: "facebook", label: "Facebook" },
    { value: "x", label: "X (Twitter)" },
    { value: "douyin", label: "Douyin" },
    { value: "other", label: "Khác" },
  ];

  return createPortal(
    <div 
      className="modal-overlay" 
      onClick={onClose} 
      style={{ 
        position: "fixed", 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        width: "100vw",
        height: "100vh",
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        zIndex: 99999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "16px",
        boxSizing: "border-box"
      }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: "580px", 
          width: "100%", 
          maxHeight: "90vh", 
          display: "flex", 
          flexDirection: "column",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(139, 92, 246, 0.25)",
          margin: "auto",
          background: "#121422",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          position: "relative"
        }}
      >
        {/* Modal Header */}
        <div 
          className="modal-header" 
          style={{ 
            padding: "16px 22px", 
            borderBottom: "1px solid var(--border-color)", 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center" 
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ 
              width: "36px", 
              height: "36px", 
              borderRadius: "10px", 
              background: "rgba(139, 92, 246, 0.15)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              color: "var(--accent-primary)" 
            }}>
              <Icon name="users" size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "var(--text-primary)" }}>
                {channel ? "Chỉnh Sửa Kênh" : "Thêm Kênh Mạng Xã Hội"}
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                Quản lý số liệu & định hướng nội dung
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ color: "var(--text-muted)", padding: "6px" }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form 
          onSubmit={handleSubmit} 
          style={{ 
            overflowY: "auto", 
            padding: "18px 22px", 
            flex: 1, 
            display: "flex", 
            flexDirection: "column", 
            gap: "14px" 
          }}
        >
          
          {/* Quick Auto Scan Box */}
          <div style={{ 
            background: "rgba(139, 92, 246, 0.08)", 
            border: "1px solid rgba(139, 92, 246, 0.25)", 
            borderRadius: "10px", 
            padding: "10px 14px" 
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="sparkles" size={14} />
                Tự động cào số liệu từ link kênh
              </span>
              {scanSuccess && (
                <span style={{ fontSize: "11.5px", color: "var(--accent-green)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Icon name="checkCircle" size={13} /> Đã quét xong!
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                className="input-field"
                placeholder="Dán link kênh (Douyin, TikTok, YouTube, Instagram...)"
                value={formData.url}
                onChange={(e) => handleUrlChange(e.target.value)}
                style={{ flex: 1, fontSize: "13px", height: "36px", padding: "6px 12px" }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAutoScan}
                disabled={isScanning}
                style={{ 
                  whiteSpace: "nowrap", 
                  padding: "6px 14px", 
                  fontSize: "12.5px", 
                  height: "36px",
                  gap: "6px", 
                  display: "flex", 
                  alignItems: "center" 
                }}
              >
                {isScanning ? (
                  <>
                    <span className="spinner" style={{ width: "13px", height: "13px", borderWidth: "2px" }} />
                    <span>Quét...</span>
                  </>
                ) : (
                  <>
                    <Icon name="search" size={14} />
                    <span>Quét</span>
                  </>
                )}
              </button>
            </div>
            {scanError && (
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#f87171" }}>
                {scanError}
              </p>
            )}
          </div>

          {/* Row 1: Platform & Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Nền tảng <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                className="input-field"
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                style={{ width: "100%", fontSize: "13px", height: "36px", padding: "6px 10px" }}
              >
                {platformOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Trạng thái định hướng <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                className="input-field"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={{ width: "100%", fontSize: "13px", height: "36px", padding: "6px 10px" }}
              >
                <option value="active">🟢 Đã có định hướng</option>
                <option value="need_orientation">🟡 Cần định hướng</option>
                <option value="planning">🔵 Cần lên kế hoạch</option>
                <option value="paused">⚪ Tạm dừng</option>
              </select>
            </div>
          </div>

          {/* Row 1.5: Channel Category (Phân cấp Loại danh mục cha -> Danh mục con) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)" }}>
                Danh mục kênh (Phân loại)
              </label>
              {onOpenCategoryModal && (
                <button
                  type="button"
                  onClick={onOpenCategoryModal}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-primary)",
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    padding: 0
                  }}
                  title="Mở bảng quản lý hoặc tạo mới danh mục phân cấp"
                >
                  <Icon name="plus" size={11} />
                  <span>Quản lý danh mục</span>
                </button>
              )}
            </div>

            <select
              className="input-field"
              value={formData.category_id || "default"}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              style={{ width: "100%", fontSize: "12.5px", height: "36px", padding: "6px 10px" }}
            >
              <option value="default">📁 Mặc định (Chưa phân loại)</option>
              {rootCategories.map((root) => {
                const subs = childrenMap[root.id] || [];
                return (
                  <React.Fragment key={root.id}>
                    <option value={root.id} style={{ fontWeight: "700" }}>
                      📁 {root.name} {subs.length > 0 ? `(${subs.length} mục con)` : ""}
                    </option>
                    {subs.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        &nbsp;&nbsp;&nbsp;&nbsp;↳ 📂 {sub.name}
                      </option>
                    ))}
                  </React.Fragment>
                );
              })}
            </select>
          </div>

          {/* Row 2: Name & Handle */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Tên kênh / Tác giả <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="VD: Tuyết Nhi, Котятница..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: "100%", fontSize: "13px", height: "36px", padding: "6px 10px" }}
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Handle (@...)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="@username"
                value={formData.handle}
                onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                style={{ width: "100%", fontSize: "13px", height: "36px", padding: "6px 10px" }}
              />
            </div>
          </div>

          {/* Row 3: Email & Orientation */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Email quản lý
              </label>
              <input
                type="email"
                className="input-field"
                placeholder="admin@gmail.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ width: "100%", fontSize: "13px", height: "36px", padding: "6px 10px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Định hướng nội dung
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="VD: Kênh Affiliate, Vlog đời sống..."
                value={formData.orientation}
                onChange={(e) => setFormData({ ...formData, orientation: e.target.value })}
                style={{ width: "100%", fontSize: "13px", height: "36px", padding: "6px 10px" }}
              />
            </div>
          </div>

          {/* Row 4: Metrics */}
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "6px" }}>
              Số liệu kênh (Metrics)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              <div style={{ background: "var(--bg-input)", padding: "7px 8px", borderRadius: "8px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", lineHeight: "1.1" }}>Followers</span>
                <input
                  type="number"
                  className="input-field"
                  value={formData.followers_count}
                  onChange={(e) => setFormData({ ...formData, followers_count: parseInt(e.target.value) || 0 })}
                  style={{ width: "100%", fontSize: "14px", fontWeight: "700", marginTop: "3px", padding: "3px 4px", height: "30px", textAlign: "center" }}
                />
              </div>

              <div style={{ background: "var(--bg-input)", padding: "7px 8px", borderRadius: "8px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", lineHeight: "1.1" }}>Following</span>
                <input
                  type="number"
                  className="input-field"
                  value={formData.following_count}
                  onChange={(e) => setFormData({ ...formData, following_count: parseInt(e.target.value) || 0 })}
                  style={{ width: "100%", fontSize: "14px", fontWeight: "700", marginTop: "3px", padding: "3px 4px", height: "30px", textAlign: "center" }}
                />
              </div>

              <div style={{ background: "var(--bg-input)", padding: "7px 8px", borderRadius: "8px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", lineHeight: "1.1" }}>Likes</span>
                <input
                  type="number"
                  className="input-field"
                  value={formData.likes_count}
                  onChange={(e) => setFormData({ ...formData, likes_count: parseInt(e.target.value) || 0 })}
                  style={{ width: "100%", fontSize: "14px", fontWeight: "700", marginTop: "3px", padding: "3px 4px", height: "30px", textAlign: "center" }}
                />
              </div>

              <div style={{ background: "var(--bg-input)", padding: "7px 8px", borderRadius: "8px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", lineHeight: "1.1" }}>Videos</span>
                <input
                  type="number"
                  className="input-field"
                  value={formData.posts_count}
                  onChange={(e) => setFormData({ ...formData, posts_count: parseInt(e.target.value) || 0 })}
                  style={{ width: "100%", fontSize: "14px", fontWeight: "700", marginTop: "3px", padding: "3px 4px", height: "30px", textAlign: "center" }}
                />
              </div>
            </div>
          </div>

          {/* Toggle More Options (Avatar URL, Bio, Notes) */}
          <div style={{ marginTop: "4px" }}>
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-primary)",
                fontSize: "12px",
                cursor: "pointer",
                padding: "3px 0",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
            >
              <Icon name={showMore ? "chevronDown" : "chevronRight"} size={14} />
              <span>{showMore ? "Thu gọn tùy chọn thêm" : "+ Thêm ảnh đại diện, tiểu sử & ghi chú"}</span>
            </button>

            {showMore && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px", animation: "fadeIn 0.15s ease" }}>
                {/* Avatar URL */}
                <div>
                  <label style={{ display: "block", fontSize: "11.5px", color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Link ảnh đại diện (Avatar)
                  </label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {formData.avatar_url && (
                      <img 
                        src={formData.avatar_url} 
                        alt="avatar" 
                        style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-color)" }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <input
                      type="text"
                      className="input-field"
                      placeholder="https://..."
                      value={formData.avatar_url}
                      onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                      style={{ flex: 1, fontSize: "12.5px", height: "32px", padding: "4px 8px" }}
                    />
                  </div>
                </div>

                {/* Bio & Notes */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", color: "var(--text-secondary)", marginBottom: "3px" }}>
                      Tiểu sử (Bio)
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Tiểu sử kênh..."
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      style={{ width: "100%", fontSize: "12.5px", height: "32px", padding: "4px 8px" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", color: "var(--text-secondary)", marginBottom: "3px" }}>
                      Ghi chú nội bộ
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ghi chú nhân sự..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      style={{ width: "100%", fontSize: "12.5px", height: "32px", padding: "4px 8px" }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

        </form>

        {/* Modal Footer */}
        <div 
          className="modal-footer" 
          style={{ 
            padding: "14px 22px", 
            borderTop: "1px solid var(--border-color)", 
            display: "flex", 
            justifyContent: "flex-end", 
            gap: "10px" 
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: "7px 16px", fontSize: "13px" }}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} style={{ padding: "7px 18px", fontSize: "13px", gap: "6px", display: "flex", alignItems: "center" }}>
            <Icon name="check" size={15} />
            <span>{channel ? "Lưu Thay Đổi" : "Tạo Kênh"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
