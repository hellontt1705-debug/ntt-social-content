import React, { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { MEDIA_BASE, updateVideo, translateMetadata, toggleVideoUsed, openSpecificFolder, redownloadVideo } from "../api";
import { useLanguage } from "../i18n";
import { renderCategorySelectOptions } from "../utils/categoryHelper";

export default function VideoDetailModal({
  video,
  onClose,
  categories,
  onOpenScheduleModal,
  onDeleteVideo,
  onSyncDrive,
  onVideoUpdated,
  onOpenAudioStudio,
  onResetVideoSaved
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(video?.title || "");
  const [categoryId, setCategoryId] = useState(video?.category_id || "all");
  const [notes, setNotes] = useState(video?.notes || "");
  const [description, setDescription] = useState(video?.description || "");
  const [hashtags, setHashtags] = useState(video?.hashtags || []);
  const [isUsed, setIsUsed] = useState(Boolean(video?.is_used));
  
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRedownloading, setIsRedownloading] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);
  const [copiedSourceUrl, setCopiedSourceUrl] = useState(false);

  const handleCopySourceUrl = () => {
    if (video?.source_url) {
      navigator.clipboard.writeText(video.source_url);
      setCopiedSourceUrl(true);
      setTimeout(() => setCopiedSourceUrl(false), 2000);
    }
  };

  useEffect(() => {
    if (video) {
      setTitle(video.title || "");
      setCategoryId(video.category_id || "all");
      setNotes(video.notes || "");
      setDescription(video.description || "");
      setHashtags(video.hashtags || []);
      setIsUsed(Boolean(video.is_used));
    }
  }, [video]);

  if (!video) return null;

  // Video / Image file URL for HTML5 player / image viewer
  const filename = video.file_path ? video.file_path.split(/[\\/]/).pop() : "";
  const videoStreamUrl = filename ? `${MEDIA_BASE}/${filename}` : "";
  const isImage = video.media_type === "image" || (video.file_path && /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(video.file_path));
  const imageDisplayUrl = videoStreamUrl || (video.local_thumbnail ? `${MEDIA_BASE}/thumbnails/${video.local_thumbnail.split(/[\\/]/).pop()}` : "") || (video.thumbnail_url && !video.thumbnail_url.includes("googleusercontent.com/d/") ? video.thumbnail_url : "") || (video.drive_file_id ? `/api/drive/thumbnail/${video.drive_file_id}` : "") || video.thumbnail_url || "";

  const handleToggleUsed = async () => {
    const nextVal = !isUsed;
    setIsUsed(nextVal);
    try {
      const res = await toggleVideoUsed(video.id, nextVal);
      if (res && res.video) {
        onVideoUpdated(res.video);
      }
    } catch (err) {
      setIsUsed(!nextVal);
      alert("Lỗi khi cập nhật trạng thái: " + err.message);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateVideo(video.id, {
        title,
        category_id: categoryId,
        notes,
        description,
        hashtags,
        is_used: isUsed ? 1 : 0
      });
      onVideoUpdated(updated);
      alert(t("save") + " OK!");
    } catch (err) {
      alert("Lỗi khi lưu thông tin: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTranslate = async (targetLang) => {
    setIsTranslating(true);
    try {
      const res = await translateMetadata({
        title,
        description,
        hashtags,
        target_lang: targetLang
      });
      if (res.title) setTitle(res.title);
      if (res.description) setDescription(res.description);
      if (res.hashtags && Array.isArray(res.hashtags)) setHashtags(res.hashtags);
    } catch (err) {
      alert("Lỗi khi dịch thuật: " + err.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRedownload = async () => {
    setIsRedownloading(true);
    try {
      const res = await redownloadVideo(video.id);
      if (res && res.video) {
        onVideoUpdated(res.video);
        alert("Đã tải lại video từ nguồn gốc thành công!");
      }
    } catch (err) {
      alert("Lỗi khi tải lại video: " + err.message);
    } finally {
      setIsRedownloading(false);
    }
  };

  const copyDescription = () => {
    navigator.clipboard.writeText(description || "");
    setCopiedDesc(true);
    setTimeout(() => setCopiedDesc(false), 2000);
  };

  const copyHashtags = () => {
    const text = (hashtags || []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
    navigator.clipboard.writeText(text);
    setCopiedTags(true);
    setTimeout(() => setCopiedTags(false), 2000);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: "880px", maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
            <span className={`video-platform-badge platform-${video.platform || "other"}`} style={{ position: "static", padding: "3px 8px" }}>
              {video.platform?.toUpperCase()}
            </span>

            {/* Nút chuyển đổi trạng thái Đã dùng ngay trên header modal */}
            <button
              type="button"
              onClick={handleToggleUsed}
              style={{
                background: isUsed ? "rgba(16, 185, 129, 0.18)" : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${isUsed ? "rgba(16, 185, 129, 0.6)" : "var(--border-color)"}`,
                color: isUsed ? "#10b981" : "var(--text-secondary)",
                borderRadius: "6px",
                padding: "3px 9px",
                fontSize: "11.5px",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              title={isUsed ? "Bấm để chuyển về Chưa sử dụng" : "Bấm để đánh dấu Đã sử dụng"}
            >
              <Icon name={isUsed ? "checkCircle" : "bookmarkCheck"} size={13} color={isUsed ? "#10b981" : "currentColor"} />
              <span>{isUsed ? "✓ ĐÃ SỬ DỤNG" : "Chưa sử dụng"}</span>
            </button>

            <h3 style={{ fontSize: "16px", fontWeight: 700, maxWidth: "420px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {title || video.title}
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Modal Body: Split view (Left: Player & Tech details, Right: Metadata & Notes) */}
        <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1.1fr 1.2fr", gap: "24px", padding: "20px 24px" }}>
          {/* Left Column: Player & File info */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ width: "100%", background: "#000", borderRadius: "12px", overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
              {isImage ? (
                <div style={{ position: "relative", width: "100%", minHeight: "260px", maxHeight: "400px", display: "flex", alignItems: "center", justifyContent: "center", background: "#080c14" }}>
                  <img
                    src={imageDisplayUrl}
                    alt={video.title}
                    style={{ maxWidth: "100%", maxHeight: "390px", objectFit: "contain", display: "block" }}
                  />
                  {imageDisplayUrl && (
                    <a
                      href={imageDisplayUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{
                        position: "absolute",
                        bottom: "10px",
                        right: "10px",
                        background: "rgba(0, 0, 0, 0.75)",
                        borderColor: "rgba(255, 255, 255, 0.25)",
                        color: "#fff",
                        fontSize: "11px",
                        gap: "4px"
                      }}
                      title="Mở ảnh gốc chất lượng cao trong tab mới"
                    >
                      <Icon name="externalLink" size={12} color="#38bdf8" />
                      <span>Mở ảnh gốc</span>
                    </a>
                  )}
                </div>
              ) : videoStreamUrl ? (
                <video
                  src={videoStreamUrl}
                  controls
                  playsInline
                  style={{ width: "100%", maxHeight: "360px", display: "block" }}
                />
              ) : video.drive_file_id ? (
                <div style={{ position: "relative", width: "100%", height: "340px", background: "#000" }}>
                  <iframe
                    src={`https://drive.google.com/file/d/${video.drive_file_id}/preview`}
                    style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                    allow="autoplay"
                    title={video.title || "Video Google Drive"}
                  />
                </div>
              ) : (
                <div style={{ height: "240px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", padding: "20px", textAlign: "center", gap: "10px" }}>
                  <Icon name="film" size={32} color="var(--text-muted)" />
                  <div style={{ fontSize: "13px" }}>File lưu trữ trên Cloud hoặc không tìm thấy file local.</div>
                  {video.source_url && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleRedownload}
                      disabled={isRedownloading}
                      style={{ marginTop: "4px", gap: "6px", display: "inline-flex", alignItems: "center" }}
                    >
                      <Icon name="download" size={13} />
                      <span>{isRedownloading ? "Đang tải lại từ nguồn..." : "Tải lại video từ link gốc"}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Helper banner: Video link gốc khi không xem được trực tiếp trên local/cloud */}
            {video.source_url && !videoStreamUrl && (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                padding: "8px 12px",
                background: "rgba(56, 189, 248, 0.08)",
                border: "1px solid rgba(56, 189, 248, 0.25)",
                borderRadius: "8px",
                fontSize: "12px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                  <Icon name="link" size={14} color="#38bdf8" />
                  <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Không phát được video? 👉 <strong style={{ color: "#38bdf8" }}>Xem video trên trang gốc</strong>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <a
                    href={video.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ padding: "3px 10px", fontSize: "11px", gap: "4px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    <span>Mở VD gốc</span>
                    <Icon name="externalLink" size={12} />
                  </a>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopySourceUrl}
                    style={{ padding: "3px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px" }}
                    title="Sao chép link VD gốc"
                  >
                    <Icon name={copiedSourceUrl ? "check" : "copy"} size={11} color={copiedSourceUrl ? "var(--accent-green)" : undefined} />
                    <span>{copiedSourceUrl ? "Đã chép" : "Chép link"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Meta Stats */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "8px",
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              textAlign: "center"
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{t("quality")}</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-cyan)" }}>{video.quality || "Chuẩn"}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Dung lượng</div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{formatFileSize(video.file_size)}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{isImage ? "Định dạng" : t("duration")}</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: isImage ? "#38bdf8" : undefined }}>
                  {isImage ? "Ảnh HD" : `${Math.floor(video.duration / 60)}p ${video.duration % 60}s`}
                </div>
              </div>
            </div>

            {/* Source & Channel Links */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("uploader")}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-primary)" }}>
                  @{video.uploader}
                </span>
              </div>

              {/* VD gốc (Original Source URL) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
                    <Icon name="link" size={13} color="var(--accent-cyan)" />
                    <span>{t("source_url") || "VD gốc:"}</span>
                  </span>
                  {video.source_url ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <a
                        href={video.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: "2px 9px",
                          fontSize: "11px",
                          color: "var(--accent-cyan)",
                          borderColor: "rgba(6, 182, 212, 0.4)",
                          background: "rgba(6, 182, 212, 0.08)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          textDecoration: "none",
                          fontWeight: 600
                        }}
                        title="Mở link gốc trên trình duyệt (tab mới)"
                      >
                        <span>{t("open_source") || "Mở link gốc"}</span>
                        <Icon name="externalLink" size={11} />
                      </a>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopySourceUrl}
                        style={{ padding: "2px 7px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px" }}
                        title="Sao chép liên kết URL gốc"
                      >
                        <Icon name={copiedSourceUrl ? "check" : "copy"} size={11} color={copiedSourceUrl ? "var(--accent-green)" : undefined} />
                        <span>{copiedSourceUrl ? "Đã chép" : "Chép"}</span>
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>Không có link nguồn</span>
                  )}
                </div>

                {video.source_url && (
                  <a
                    href={video.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: "11.5px",
                      fontFamily: "monospace",
                      color: "var(--accent-cyan)",
                      textDecoration: "none",
                      background: "rgba(0, 0, 0, 0.25)",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block"
                    }}
                    title={`Bấm để mở VD gốc: ${video.source_url}`}
                  >
                    {video.source_url}
                  </a>
                )}
              </div>

              {/* Google Drive Status */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Google Drive:</span>
                {video.drive_synced === 1 && video.drive_file_id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "var(--accent-green)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Icon name="check" size={13} />
                      <span>Đã lưu trên Drive</span>
                    </span>
                    {video.drive_web_link && (
                      <a
                        href={video.drive_web_link}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: "2px 8px", fontSize: "11px", textDecoration: "none" }}
                      >
                        <Icon name="external-link" size={11} /> Mở Drive
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Chưa lưu trên Drive</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => onSyncDrive(video.id)}>
                      <Icon name="cloud" size={13} />
                      <span>Đồng bộ ngay</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Computer Export Status & History */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Lưu trên máy tính:</span>
                  {(video.local_export_count || 0) > 0 || video.is_saved_to_computer ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "var(--accent-cyan)", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                        <Icon name="check" size={13} color="var(--accent-cyan)" />
                        <span>Đã lưu {video.local_export_count || 1} lần</span>
                      </span>
                      {onResetVideoSaved && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{
                            padding: "1px 6px",
                            fontSize: "10.5px",
                            height: "20px",
                            color: "#f87171",
                            borderColor: "rgba(248, 113, 113, 0.3)",
                            background: "rgba(248, 113, 113, 0.08)"
                          }}
                          onClick={() => {
                            if (confirm("Bỏ thông tin hiển thị đã lưu máy cho video này?")) {
                              onResetVideoSaved(video.id);
                            }
                          }}
                          title="Bỏ thông tin hiển thị đã lưu về máy và reset lượt tải"
                        >
                          Bỏ lưu máy
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Chưa lưu vào máy</span>
                  )}
                </div>

                {video.last_export_folder && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", gap: "6px" }}>
                    <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>Thư mục:</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                      <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-secondary)", maxWidth: "160px" }} title={video.last_export_folder}>
                        {video.last_export_folder}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: "1px 6px", fontSize: "10px", height: "20px" }}
                        onClick={async () => {
                          try {
                            await openSpecificFolder(video.last_export_folder);
                          } catch (err) {
                            alert("Không thể mở thư mục: " + err.message);
                          }
                        }}
                        title="Mở thư mục này trên máy tính"
                      >
                        Mở
                      </button>
                    </div>
                  </div>
                )}

                {video.last_exported_at && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Lần lưu gần nhất:</span>
                    <span>{new Date(video.last_exported_at).toLocaleString("vi-VN")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Editable Info, Description, Hashtags, Reup notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Metadata Translation Bar (Anh | Việt | Trung) */}
            <div className="translate-meta-bar">
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                {t("translate_section")}
              </span>
              <div className="translate-btn-group">
                <button
                  type="button"
                  className="translate-btn"
                  onClick={() => handleTranslate("vi")}
                  disabled={isTranslating}
                >
                  <span>{t("translate_to_vi")}</span>
                </button>
                <button
                  type="button"
                  className="translate-btn"
                  onClick={() => handleTranslate("en")}
                  disabled={isTranslating}
                >
                  <span>{t("translate_to_en")}</span>
                </button>
                <button
                  type="button"
                  className="translate-btn"
                  onClick={() => handleTranslate("zh")}
                  disabled={isTranslating}
                >
                  <span>{t("translate_to_zh")}</span>
                </button>
              </div>
              {isTranslating && (
                <span style={{ fontSize: "11px", color: "var(--accent-cyan)", fontStyle: "italic" }}>
                  {t("translating")}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Tiêu đề Video</label>
              <input
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t("move_category")}</label>
              <select
                className="form-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {renderCategorySelectOptions(categories, { includeAll: true, allLabel: t("all_unclassified") })}
              </select>
            </div>

            {/* Hashtags section */}
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="form-label">{t("hashtags_label")} ({hashtags?.length || 0})</label>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                  onClick={copyHashtags}
                >
                  <Icon name={copiedTags ? "check" : "copy"} size={12} color={copiedTags ? "var(--accent-green)" : "currentColor"} />
                  <span>{copiedTags ? t("copied_toast") : t("copy_hashtags")}</span>
                </button>
              </div>

              <div style={{
                maxHeight: "75px",
                overflowY: "auto",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                padding: "8px",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px"
              }}>
                {hashtags && hashtags.length > 0 ? (
                  hashtags.map((tag, idx) => (
                    <span key={idx} className="video-tag">
                      #{tag.replace(/^#/, '')}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Không có hashtag</span>
                )}
              </div>
            </div>

            {/* Original Caption / Description */}
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="form-label">Mô tả / Caption</label>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                  onClick={copyDescription}
                >
                  <Icon name={copiedDesc ? "check" : "copy"} size={12} color={copiedDesc ? "var(--accent-green)" : "currentColor"} />
                  <span>{copiedDesc ? t("copied_toast") : "Chép mô tả"}</span>
                </button>
              </div>
              <textarea
                className="form-textarea"
                style={{ minHeight: "70px", fontSize: "12px" }}
                value={description || ""}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Reup Notes & Ideas */}
            <div className="form-group">
              <label className="form-label">{t("notes_label")}</label>
              <textarea
                className="form-textarea"
                style={{ minHeight: "65px", fontSize: "12px" }}
                placeholder={t("notes_placeholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (confirm(t("delete_video_confirm"))) {
                onDeleteVideo(video.id);
                onClose();
              }
            }}
          >
            <Icon name="trash" size={14} />
            <span>{t("delete_video")}</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => onOpenScheduleModal(video)}
          >
            <Icon name="calendar" size={15} />
            <span>{t("schedule_post")}</span>
          </button>

          {!isImage && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                onClose();
                if (onOpenAudioStudio) onOpenAudioStudio(video);
              }}
              style={{ color: "#a855f7", borderColor: "rgba(168, 85, 247, 0.4)" }}
            >
              <Icon name="music" size={15} color="#a855f7" />
              <span>Studio Âm Thanh</span>
            </button>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Icon name="check" size={15} color="#fff" />
            <span>{isSaving ? "Đang lưu..." : t("save_changes")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
