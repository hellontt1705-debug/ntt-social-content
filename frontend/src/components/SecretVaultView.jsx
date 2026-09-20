import React, { useState, useEffect } from "react";
import { Icon } from "./Icons";
import {
  fetchVaultStatus,
  setupVaultPassword,
  verifyVaultPassword,
  changeVaultPassword,
  fetchVideos,
  setVideoPrivacy,
  deleteVideo,
  MEDIA_BASE
} from "../api";
import { useLanguage } from "../i18n";

export default function SecretVaultView({
  onSelectVideo,
  onRefreshVaultCount,
  onRefreshPublicVideos
}) {
  const { t } = useLanguage();
  
  // Trạng thái mật khẩu & mở khóa
  const [vaultStatus, setVaultStatus] = useState({ has_password: false, hint: "", count: 0 });
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Form mở khóa
  const [inputPass, setInputPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [shake, setShake] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Form thiết lập lần đầu
  const [setupPass, setSetupPass] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupHint, setSetupHint] = useState("");
  const [setupShowPass, setSetupShowPass] = useState(false);

  // Modal đổi mật khẩu
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmNewPass, setConfirmNewPass] = useState("");
  const [changeHint, setChangeHint] = useState("");
  const [changeErr, setChangeErr] = useState("");

  // Dữ liệu video bảo mật
  const [secretVideos, setSecretVideos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");

  // 1. Tải trạng thái mật khẩu
  const loadStatus = async () => {
    try {
      setLoading(true);
      const st = await fetchVaultStatus();
      setVaultStatus(st);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 2. Tải danh sách video bảo mật (khi đã mở khóa)
  const loadSecretVideos = async () => {
    try {
      const data = await fetchVideos("all", searchQuery, "active", true);
      setSecretVideos(data);
      if (onRefreshVaultCount) onRefreshVaultCount();
    } catch (e) {
      console.error("Lỗi khi tải video bảo mật:", e);
    }
  };

  useEffect(() => {
    loadStatus();
    // Auto-lock guarantee: when component unmounts, isUnlocked is naturally reset
    return () => {
      setIsUnlocked(false);
    };
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      loadSecretVideos();
    }
  }, [isUnlocked, searchQuery]);

  // Xử lý mở khóa
  const handleUnlock = async (e) => {
    e?.preventDefault();
    if (!inputPass.trim()) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await verifyVaultPassword(inputPass.trim());
      setIsUnlocked(true);
      setInputPass("");
      setErrorMsg("");
    } catch (err) {
      setErrorMsg(err.message || "Mật khẩu không chính xác!");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  };

  // Xử lý thiết lập mật khẩu lần đầu
  const handleSetupPassword = async (e) => {
    e.preventDefault();
    if (!setupPass.trim()) {
      setErrorMsg("Vui lòng nhập mật khẩu mới.");
      return;
    }
    if (setupPass.length < 3) {
      setErrorMsg("Mật khẩu phải từ 3 ký tự trở lên.");
      return;
    }
    if (setupPass !== setupConfirm) {
      setErrorMsg("Mật khẩu xác nhận không khớp!");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    try {
      await setupVaultPassword(setupPass.trim(), setupHint.trim());
      setVaultStatus({ has_password: true, hint: setupHint.trim(), count: 0 });
      setIsUnlocked(true);
      setSetupPass("");
      setSetupConfirm("");
      setSetupHint("");
    } catch (err) {
      setErrorMsg(err.message || "Lỗi khi thiết lập mật khẩu.");
    } finally {
      setSubmitting(false);
    }
  };

  // Xử lý đổi mật khẩu
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangeErr("");
    if (!oldPass) {
      setChangeErr("Vui lòng nhập mật khẩu hiện tại.");
      return;
    }
    if (!newPass || newPass.length < 3) {
      setChangeErr("Mật khẩu mới phải từ 3 ký tự trở lên.");
      return;
    }
    if (newPass !== confirmNewPass) {
      setChangeErr("Mật khẩu mới nhập lại không khớp!");
      return;
    }

    try {
      await changeVaultPassword(oldPass, newPass, changeHint);
      alert("Đổi mật khẩu Kho Bảo Mật thành công!");
      setShowChangeModal(false);
      setOldPass("");
      setNewPass("");
      setConfirmNewPass("");
      setChangeHint("");
      loadStatus();
    } catch (err) {
      setChangeErr(err.message || "Không thể đổi mật khẩu.");
    }
  };

  // Khóa lại thủ công ngay tức thì
  const handleLockNow = () => {
    setIsUnlocked(false);
    setInputPass("");
    setErrorMsg("");
  };

  // Bỏ bảo mật, đưa video về lại kho công khai
  const handleRemoveFromVault = async (videoId, e) => {
    e?.stopPropagation();
    if (!window.confirm("Đưa video này trở lại Kho Video Công Khai (hiển thị ở trang Tất cả)?")) return;
    try {
      await setVideoPrivacy(videoId, false);
      await loadSecretVideos();
      if (onRefreshPublicVideos) onRefreshPublicVideos();
      if (onRefreshVaultCount) onRefreshVaultCount();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  // Xóa video khỏi kho bảo mật (chuyển thùng rác)
  const handleDeleteVideo = async (videoId, e) => {
    e?.stopPropagation();
    if (!window.confirm("Chuyển video này vào Thùng Rác?")) return;
    try {
      await deleteVideo(videoId);
      await loadSecretVideos();
      if (onRefreshVaultCount) onRefreshVaultCount();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  // Lọc video theo nền tảng
  const filteredVideos = secretVideos.filter((v) => {
    if (platformFilter === "all") return true;
    return v.platform === platformFilter;
  });

  if (loading) {
    return (
      <div className="vault-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Đang kết nối Kho Bảo Mật...</div>
      </div>
    );
  }

  // ==========================================
  // CASE 1: LẦN ĐẦU - CHƯA THIẾT LẬP MẬT KHẨU
  // ==========================================
  if (!vaultStatus.has_password) {
    return (
      <div className="vault-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "20px" }}>
        <div className="secret-lock-card">
          <div className="secret-lock-icon-wrap" style={{ background: "rgba(139, 92, 246, 0.15)", borderColor: "rgba(139, 92, 246, 0.4)" }}>
            <Icon name="shield" size={38} color="#a78bfa" />
          </div>
          
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
            Kích Hoạt Kho Video Bảo Mật
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 20px 0", textAlign: "center", lineHeight: "1.5" }}>
            Tạo mật khẩu để bảo vệ các video riêng tư của bạn.<br />
            Mọi video trong kho này sẽ bị <strong style={{ color: "#a78bfa" }}>ẩn hoàn toàn khỏi trang Tất cả</strong> và tự động khóa lại khi bạn chuyển trang.
          </p>

          <form onSubmit={handleSetupPassword} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Mật khẩu mới</label>
              <div style={{ position: "relative" }}>
                <input
                  type={setupShowPass ? "text" : "password"}
                  className="form-input"
                  placeholder="Nhập mật khẩu (tối thiểu 3 ký tự)..."
                  value={setupPass}
                  onChange={(e) => setSetupPass(e.target.value)}
                  autoFocus
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setSetupShowPass(!setupShowPass)}
                  style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)" }}
                >
                  <Icon name={setupShowPass ? "eyeOff" : "eye"} size={16} color="var(--text-muted)" />
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Xác nhận lại mật khẩu</label>
              <input
                type={setupShowPass ? "text" : "password"}
                className="form-input"
                placeholder="Nhập lại mật khẩu..."
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Gợi ý mật khẩu (tùy chọn)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ví dụ: Ngày sinh nhật, biệt danh..."
                value={setupHint}
                onChange={(e) => setSetupHint(e.target.value)}
              />
            </div>

            {errorMsg && (
              <div style={{ color: "#f43f5e", fontSize: "12.5px", background: "rgba(244, 63, 94, 0.1)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(244, 63, 94, 0.25)" }}>
                {errorMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ marginTop: "6px", padding: "11px" }} disabled={submitting}>
              <Icon name="lock" size={16} color="#fff" />
              <span>{submitting ? "Đang xử lý..." : "Thiết Lập Mật Khẩu & Mở Kho"}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // CASE 2: MÀN HÌNH KHÓA (YÊU CẦU MẬT KHẨU)
  // ==========================================
  if (!isUnlocked) {
    return (
      <div className="vault-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "20px" }}>
        <div className={`secret-lock-card ${shake ? "shake-animation" : ""}`}>
          <div className="secret-lock-icon-wrap">
            <Icon name="lock" size={38} color="#a78bfa" />
          </div>

          <h2 style={{ fontSize: "21px", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
            Kho Video Bảo Mật Đang Khóa
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 22px 0", textAlign: "center" }}>
            Vui lòng nhập mật khẩu để truy cập và xem các video riêng tư.
          </p>

          <form onSubmit={handleUnlock} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                className="form-input"
                placeholder="Nhập mật khẩu mở khóa..."
                value={inputPass}
                onChange={(e) => setInputPass(e.target.value)}
                autoFocus
                style={{ paddingRight: "42px", height: "44px", fontSize: "14px" }}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPass(!showPass)}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)" }}
              >
                <Icon name={showPass ? "eyeOff" : "eye"} size={17} color="var(--text-muted)" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ color: "#f43f5e", fontSize: "12.5px", background: "rgba(244, 63, 94, 0.1)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(244, 63, 94, 0.25)", textAlign: "center" }}>
                {errorMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ padding: "12px", fontSize: "14px", fontWeight: 600 }} disabled={submitting}>
              <Icon name="unlock" size={16} color="#fff" />
              <span>{submitting ? "Đang xác thực..." : "Mở Khóa Két Sắt"}</span>
            </button>

            {vaultStatus.hint && (
              <div style={{ textAlign: "center", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setShowHint(!showHint)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
                >
                  {showHint ? `Gợi ý: ${vaultStatus.hint}` : "💡 Xem gợi ý mật khẩu"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // CASE 3: ĐÃ MỞ KHÓA - HIỂN THỊ KHO BẢO MẬT
  // ==========================================
  return (
    <div className="vault-content" style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {/* Top Banner & Security Header */}
      <div style={{
        padding: "18px 24px",
        background: "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(16, 185, 129, 0.05) 100%)",
        borderBottom: "1px solid rgba(139, 92, 246, 0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "14px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: "rgba(139, 92, 246, 0.2)",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Icon name="unlock" size={22} color="#a78bfa" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Kho Video Bảo Mật (Két Sắt)
              </h2>
              <span style={{
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "12px",
                border: "1px solid rgba(16, 185, 129, 0.3)"
              }}>
                Đã Mở Khóa
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {secretVideos.length} video riêng tư • Ẩn hoàn toàn khỏi trang Tất cả • Tự động khóa lại khi chuyển tab
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowChangeModal(true)}>
            <Icon name="key" size={14} />
            <span>Đổi Mật Khẩu</span>
          </button>
          
          <button className="btn btn-primary btn-sm" style={{ background: "rgba(244, 63, 94, 0.2)", borderColor: "rgba(244, 63, 94, 0.4)", color: "#fb7185" }} onClick={handleLockNow}>
            <Icon name="lock" size={14} color="#fb7185" />
            <span>Khóa Ngay</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        {/* Platform tabs */}
        <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
          {[
            { id: "all", label: "Tất cả nền tảng" },
            { id: "tiktok", label: "TikTok" },
            { id: "youtube", label: "YouTube" },
            { id: "instagram", label: "Instagram" },
            { id: "x", label: "X / Twitter" },
            { id: "douyin", label: "Douyin" },
            { id: "drive", label: "Google Drive" }
          ].map((p) => (
            <button
              key={p.id}
              className={`filter-pill ${platformFilter === p.id ? "active" : ""}`}
              onClick={() => setPlatformFilter(p.id)}
              style={{ fontSize: "12px", padding: "5px 12px" }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div style={{ position: "relative", minWidth: "220px" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Tìm kiếm trong kho bảo mật..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: "32px", fontSize: "12px", height: "34px" }}
          />
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
            <Icon name="search" size={14} />
          </span>
        </div>
      </div>

      {/* Video Grid */}
      <div style={{ flex: 1, padding: "0 24px 24px 24px" }}>
        {filteredVideos.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 20px",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "16px",
            border: "1px dashed rgba(255, 255, 255, 0.1)",
            textAlign: "center"
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px"
            }}>
              <Icon name="shield" size={26} color="#a78bfa" />
            </div>
            <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
              Chưa có video nào trong Kho Bảo Mật
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "420px", margin: "0 0 16px 0", lineHeight: "1.5" }}>
              Để bảo vệ video: Hãy kéo & thả bất kỳ video nào từ Kho chính vào mục <strong>"🔒 Kho Bảo Mật"</strong> bên Sidebar, hoặc bấm vào menu trên từng thẻ video chọn <strong>"Chuyển vào Kho Bảo Mật"</strong>.
            </p>
          </div>
        ) : (
          <div className="videos-grid">
            {filteredVideos.map((video) => {
              const thumbSrc = video.local_thumbnail
                ? `${MEDIA_BASE}/${video.local_thumbnail}`
                : video.thumbnail_url || "";

              return (
                <div
                  key={video.id}
                  className="video-card"
                  onClick={() => onSelectVideo(video)}
                  style={{ position: "relative" }}
                >
                  {/* Thumbnail Container */}
                  <div className="card-thumbnail">
                    {thumbSrc ? (
                      <img src={thumbSrc} alt={video.title} loading="lazy" />
                    ) : (
                      <div className="no-thumb">
                        <Icon name="play" size={28} />
                      </div>
                    )}

                    {/* Platform Badge */}
                    <div className="platform-tag">
                      <Icon name={video.platform || "folder"} size={13} />
                      <span>{video.platform}</span>
                    </div>

                    {/* Lock Indicator */}
                    <div style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      background: "rgba(15, 23, 42, 0.75)",
                      backdropFilter: "blur(4px)",
                      border: "1px solid rgba(139, 92, 246, 0.5)",
                      borderRadius: "6px",
                      padding: "3px 6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      color: "#a78bfa",
                      fontSize: "11px",
                      fontWeight: 600
                    }}>
                      <Icon name="lock" size={11} color="#a78bfa" />
                      <span>Riêng tư</span>
                    </div>

                    {/* Duration badge */}
                    {video.duration > 0 && (
                      <div className="duration-tag">
                        {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="card-body">
                    <h4 className="video-title" title={video.title}>
                      {video.title}
                    </h4>
                    <span className="author-name">@{video.uploader || "user"}</span>

                    {/* Card Actions */}
                    <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, padding: "5px 8px", fontSize: "11.5px" }}
                        onClick={() => onSelectVideo(video)}
                      >
                        <Icon name="play" size={13} />
                        <span>Xem</span>
                      </button>

                      <button
                        className="icon-btn"
                        title="Đưa về Kho Video công khai (bỏ bảo mật)"
                        onClick={(e) => handleRemoveFromVault(video.id, e)}
                        style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}
                      >
                        <Icon name="unlock" size={14} color="#10b981" />
                      </button>

                      <button
                        className="icon-btn"
                        title="Xóa vào thùng rác"
                        onClick={(e) => handleDeleteVideo(video.id, e)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Đổi Mật Khẩu */}
      {showChangeModal && (
        <div className="modal-overlay" onClick={() => setShowChangeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Icon name="key" size={20} color="#a78bfa" />
                <h3 style={{ margin: 0, fontSize: "16px" }}>Đổi Mật Khẩu Kho Bảo Mật</h3>
              </div>
              <button className="icon-btn" onClick={() => setShowChangeModal(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleChangePassword} style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Mật khẩu hiện tại</label>
                <input
                  type="password"
                  className="form-input"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  placeholder="Nhập mật khẩu cũ..."
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Mật khẩu mới</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Tối thiểu 3 ký tự..."
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Nhập lại mật khẩu mới</label>
                <input
                  type="password"
                  className="form-input"
                  value={confirmNewPass}
                  onChange={(e) => setConfirmNewPass(e.target.value)}
                  placeholder="Xác nhận mật khẩu mới..."
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Gợi ý mật khẩu (tùy chọn)</label>
                <input
                  type="text"
                  className="form-input"
                  value={changeHint}
                  onChange={(e) => setChangeHint(e.target.value)}
                  placeholder="Gợi ý gợi nhớ mật khẩu..."
                />
              </div>

              {changeErr && (
                <div style={{ color: "#f43f5e", fontSize: "12px", background: "rgba(244, 63, 94, 0.1)", padding: "8px 12px", borderRadius: "6px" }}>
                  {changeErr}
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowChangeModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Lưu Mật Khẩu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
