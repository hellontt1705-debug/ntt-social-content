import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Icon } from "./Icons";
import { MEDIA_BASE, updateVideo, translateMetadata, toggleVideoUsed, toggleVideoLearned, openSpecificFolder, redownloadVideo, getVideoStreamUrl, getThumbnailSrc, preloadVideo } from "../api";
import { useLanguage } from "../i18n";
import { renderCategorySelectOptions } from "../utils/categoryHelper";

export default function VideoDetailModal({
  video,
  videoList = [],
  onSelectVideo,
  onClose,
  categories,
  onOpenScheduleModal,
  onDeleteVideo,
  onSyncDrive,
  onVideoUpdated,
  onOpenAudioStudio,
  onResetVideoSaved,
  onToggleVideoLearned
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(video?.title || "");
  const [categoryId, setCategoryId] = useState(video?.category_id || "all");
  const [notes, setNotes] = useState(video?.notes || "");
  const [description, setDescription] = useState(video?.description || "");
  const [hashtags, setHashtags] = useState(video?.hashtags || []);
  const [isUsed, setIsUsed] = useState(Boolean(video?.is_used));
  const [isLearned, setIsLearned] = useState(Boolean(video?.is_learned));
  const [learnNotes, setLearnNotes] = useState(video?.learn_notes || "");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRedownloading, setIsRedownloading] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem("social_os_player_muted");
    return saved !== null ? saved === "true" : true; // Mặc định muted an toàn chuẩn TikTok để 100% video luôn autoplay tức thì
  });
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  const videoRef = useRef(null);

  // Video / Image file URL for HTML5 player / image viewer (Khai báo sớm để dùng trong useEffect)
  const isImage = Boolean(video?.media_type === "image" || (video?.file_path && /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(video.file_path)));
  const videoStreamUrl = getVideoStreamUrl(video);
  const thumbnailDisplayUrl = getThumbnailSrc(video);
  const imageDisplayUrl = isImage ? (videoStreamUrl || thumbnailDisplayUrl) : thumbnailDisplayUrl;
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);
  const [copiedSourceUrl, setCopiedSourceUrl] = useState(false);

  // Chế độ xem rạp chiếu lớn (TikTok Cinema Mode) giống Ảnh 2
  const [isCinemaMode, setIsCinemaMode] = useState(() => {
    const saved = localStorage.getItem("video_detail_cinema_mode");
    return saved !== null ? saved === "true" : true; // Mặc định bật chế độ rạp chiếu siêu nét
  });

  const toggleCinemaMode = () => {
    setIsCinemaMode((prev) => {
      const next = !prev;
      localStorage.setItem("video_detail_cinema_mode", String(next));
      return next;
    });
  };

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
      setIsLearned(Boolean(video.is_learned));
      setLearnNotes(video.learn_notes || "");
      setIsVideoBuffering(false);
    }
  }, [video]);

  // --- TikTok-style Video Browsing / Playlist Navigation ---
  const playlist = useMemo(() => {
    if (Array.isArray(videoList) && videoList.length > 0) {
      return videoList;
    }
    return video ? [video] : [];
  }, [videoList, video]);

  const currentIndex = useMemo(() => {
    if (!video || !playlist.length) return -1;
    return playlist.findIndex((v) => v.id === video.id);
  }, [playlist, video]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < playlist.length - 1;

  // --- Tự động Preload trước các video và thumbnail liền kề (Cơ chế lướt 0ms chuẩn TikTok / Reels) ---
  useEffect(() => {
    if (playlist.length > 1 && currentIndex >= 0) {
      const timer = setTimeout(() => {
        const nextVid = playlist[currentIndex + 1];
        const prevVid = playlist[currentIndex - 1];

        if (nextVid?.id) preloadVideo(nextVid.id);
        if (prevVid?.id) preloadVideo(prevVid.id);

        [nextVid, prevVid].forEach((v) => {
          if (!v) return;
          const thumb = (v.thumbnail_url && v.thumbnail_url.startsWith("http") && !v.thumbnail_url.includes("googleusercontent.com/d/") ? v.thumbnail_url : "") || (v.drive_file_id ? `/api/drive/thumbnail/${v.drive_file_id}` : "") || (v.local_thumbnail ? `${MEDIA_BASE}/thumbnails/${v.local_thumbnail.split(/[\\/]/).pop()}` : "") || (v.id ? `/api/videos/${v.id}/thumbnail` : "") || v.thumbnail_url;
          if (thumb) {
            const img = new Image();
            img.src = thumb;
          }
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, playlist]);

  // Autoplay an toàn vượt qua chính sách âm thanh của trình duyệt (Chuẩn TikTok / Reels mượt mà 0ms)
  useEffect(() => {
    if (!video?.id || isImage) return;

    let isMounted = true;
    const v = videoRef.current;
    if (!v) return;

    setIsVideoBuffering(false);

    const runAutoplay = async () => {
      try {
        v.muted = isMutedRef.current;
        const playPromise = v.play();
        if (playPromise !== undefined) {
          await playPromise;
          if (isMounted) {
            setIsPlaying(true);
            setIsVideoBuffering(false);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        // Nếu trình duyệt chặn phát có tiếng, tự động phát muted để không bao giờ bị kẹt ở 0:00
        try {
          v.muted = true;
          setIsMuted(true);
          const mutedPromise = v.play();
          if (mutedPromise !== undefined) {
            await mutedPromise;
            if (isMounted) {
              setIsPlaying(true);
              setIsVideoBuffering(false);
            }
          }
        } catch (err2) {
          if (isMounted) {
            setIsPlaying(false);
            setIsVideoBuffering(false);
          }
        }
      }
    };

    const timer = setTimeout(runAutoplay, 30);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [video?.id, videoStreamUrl, isImage]);

  const handleToggleMute = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !isMuted;
    v.muted = nextMuted;
    setIsMuted(nextMuted);
    localStorage.setItem("social_os_player_muted", String(nextMuted));
  };

  const handleTogglePlay = (e) => {
    if (
      e.target.tagName?.toLowerCase() === "button" ||
      e.target.closest("button") ||
      e.target.closest(".tiktok-nav-floating-controls") ||
      e.target.closest(".tiktok-stage-bottom-bar") ||
      e.target.closest(".tiktok-stage-close-btn")
    ) {
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play()
        .then(() => {
          setIsPlaying(true);
          setIsVideoBuffering(false);
        })
        .catch(() => {
          v.muted = true;
          setIsMuted(true);
          v.play().catch(() => {});
        });
    } else {
      v.pause();
      setIsPlaying(false);
      setIsVideoBuffering(false);
    }
  };

  const handlePrev = useCallback(() => {
    if (hasPrev && onSelectVideo) {
      onSelectVideo(playlist[currentIndex - 1]);
    }
  }, [hasPrev, onSelectVideo, playlist, currentIndex]);

  const handleNext = useCallback(() => {
    if (hasNext && onSelectVideo) {
      onSelectVideo(playlist[currentIndex + 1]);
    }
  }, [hasNext, onSelectVideo, playlist, currentIndex]);

  // Phím tắt bàn phím: Mũi tên lên (video trước), Mũi tên xuống (video sau)
  useEffect(() => {
    if (!video) return;

    const handleKeyDown = (e) => {
      // Bỏ qua nếu người dùng đang nhập liệu trong ô input, textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) {
        return;
      }

      if (e.key === "ArrowUp" || e.key === "PageUp") {
        if (hasPrev) {
          e.preventDefault();
          handlePrev();
        }
      } else if (e.key === "ArrowDown" || e.key === "PageDown") {
        if (hasNext) {
          e.preventDefault();
          handleNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [video, hasPrev, hasNext, handlePrev, handleNext]);

  // Lướt bằng con lăn chuột trên player (giống TikTok Web)
  const lastWheelTimeRef = useRef(0);
  const handlePlayerWheel = (e) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 400) return;

    if (e.deltaY > 25) {
      if (hasNext) {
        e.preventDefault();
        lastWheelTimeRef.current = now;
        handleNext();
      }
    } else if (e.deltaY < -25) {
      if (hasPrev) {
        e.preventDefault();
        lastWheelTimeRef.current = now;
        handlePrev();
      }
    }
  };

  // Cử chỉ vuốt tay (Touch Swipe)
  const touchStartYRef = useRef(null);
  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  };
  const handleTouchEnd = (e) => {
    if (touchStartYRef.current === null) return;
    const touchEndY = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientY : null;
    if (touchEndY === null) return;
    const diffY = touchStartYRef.current - touchEndY;
    touchStartYRef.current = null;

    if (diffY > 50) {
      if (hasNext) handleNext();
    } else if (diffY < -50) {
      if (hasPrev) handlePrev();
    }
  };

  const currentCatObj = useMemo(() => {
    if (!categoryId || categoryId === "all" || !Array.isArray(categories)) return null;
    return categories.find((c) => c.id === categoryId);
  }, [categories, categoryId]);

  const parentCatOfCurrent = useMemo(() => {
    if (!currentCatObj?.parent_id || !Array.isArray(categories)) return null;
    return categories.find((c) => c.id === currentCatObj.parent_id);
  }, [categories, currentCatObj]);

  if (!video) return null;

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

  const handleToggleLearned = async () => {
    const nextVal = !isLearned;
    setIsLearned(nextVal);
    try {
      const res = await toggleVideoLearned(video.id, nextVal, learnNotes);
      if (res && res.video) {
        onVideoUpdated(res.video);
      }
      if (onToggleVideoLearned) {
        onToggleVideoLearned(video.id);
      }
    } catch (err) {
      setIsLearned(!nextVal);
      alert("Lỗi khi cập nhật trạng thái học làm: " + err.message);
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
        is_used: isUsed ? 1 : 0,
        is_learned: isLearned ? 1 : 0,
        learn_notes: learnNotes
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

  // --- Form Editor Elements (dùng chung cho cả Cinema Mode và Compact Mode) ---
  const renderRightForm = (isCinema) => (
    <>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <label className="form-label" style={{ marginBottom: 0 }}>{t("move_category")}</label>
          {currentCatObj && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 600,
                background: currentCatObj.parent_id ? "rgba(6, 182, 212, 0.12)" : "rgba(139, 92, 246, 0.12)",
                color: currentCatObj.parent_id ? "var(--accent-cyan)" : "var(--accent-primary)",
                border: `1px solid ${currentCatObj.parent_id ? "rgba(6, 182, 212, 0.3)" : "rgba(139, 92, 246, 0.3)"}`
              }}
            >
              <Icon name={currentCatObj.icon || "folder"} size={11} />
              <span>{parentCatOfCurrent ? `${parentCatOfCurrent.name} › ${currentCatObj.name}` : currentCatObj.name}</span>
            </span>
          )}
        </div>
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
          style={{ minHeight: isCinema ? "80px" : "65px", fontSize: "12px" }}
          value={description || ""}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Reup Notes & Ideas */}
      <div className="form-group">
        <label className="form-label">{t("notes_label")}</label>
        <textarea
          className="form-textarea"
          style={{ minHeight: isCinema ? "75px" : "60px", fontSize: "12px" }}
          placeholder={t("notes_placeholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* CapCut Edit Learning Notes */}
      <div className="form-group" style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px dashed rgba(16, 185, 129, 0.35)", borderRadius: "8px", padding: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <label className="form-label" style={{ color: "#10b981", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "5px" }}>
            <span>🎓</span>
            <span>Ghi chú học edit CapCut / Kỹ thuật</span>
          </label>
          <span style={{ fontSize: "11px", color: isLearned ? "#10b981" : "var(--text-muted)", fontWeight: 600 }}>
            {isLearned ? "✓ Đã học làm" : "Chưa học"}
          </span>
        </div>
        <textarea
          className="form-textarea"
          style={{ minHeight: isCinema ? "75px" : "60px", fontSize: "12px", borderColor: "rgba(16, 185, 129, 0.3)" }}
          placeholder="Ghi chú các bước làm, hiệu ứng CapCut, Keyframe, lớp phủ, zoom, chuyển cảnh cần áp dụng..."
          value={learnNotes}
          onChange={(e) => setLearnNotes(e.target.value)}
        />
      </div>

      {/* Computer Save Info & Actions (trong Cinema Mode) */}
      {isCinema && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid var(--border-color)", marginTop: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
            <span style={{ color: "var(--text-muted)" }}>Lưu trên máy tính:</span>
            {(video.local_export_count || 0) > 0 || video.is_saved_to_computer ? (
              <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>Đã lưu {video.local_export_count || 1} lần</span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>Chưa lưu vào máy</span>
            )}
          </div>
          {video.last_export_folder && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
              <span style={{ color: "var(--text-muted)" }}>Thư mục:</span>
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
              >
                Mở thư mục
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons in Cinema Mode (docked at the end of the scrollable panel) */}
      {isCinema && (
        <div style={{
          marginTop: "16px",
          paddingTop: "16px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          flexWrap: "wrap"
        }}>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (confirm(t("delete_video_confirm"))) {
                onDeleteVideo(video.id);
                onClose();
              }
            }}
            title="Chuyển video vào thùng rác"
          >
            <Icon name="trash" size={13} />
            <span>{t("delete_video")}</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onOpenScheduleModal(video)}
            >
              <Icon name="calendar" size={13} />
              <span>{t("schedule_post")}</span>
            </button>

            {!isImage && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  if (onOpenAudioStudio) onOpenAudioStudio(video);
                }}
                style={{ color: "#a855f7", borderColor: "rgba(168, 85, 247, 0.4)" }}
              >
                <Icon name="music" size={13} color="#a855f7" />
                <span>Audio</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={isSaving}
              style={{ padding: "6px 14px", fontWeight: 700 }}
            >
              <Icon name="check" size={14} color="#fff" />
              <span>{isSaving ? "Đang lưu..." : t("save_changes")}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose} style={{ padding: isCinemaMode ? "10px" : "20px", background: "rgba(0, 0, 0, 0.9)" }}>
      {isCinemaMode ? (
        /* ========================================================================= */
        /* CHẾ ĐỘ RẠP CHIẾU LỚN TIKTOK (CINEMA THEATER MODE - GIỐNG ẢNH 2 100%)      */
        /* ========================================================================= */
        <div
          className="modal-content tiktok-cinema-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* CỘT TRÁI: KHUNG CHIẾU VIDEO RỘNG LỚN, NỀN ĐEN SÂU THẲM */}
          <div
            className="tiktok-stage-left"
            onWheel={handlePlayerWheel}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Nút Đóng (X) tròn mờ ở góc trên bên trái khung chiếu (chuẩn TikTok) */}
            <button
              type="button"
              onClick={onClose}
              className="tiktok-stage-close-btn"
              title="Đóng (Esc)"
              style={{
                position: "absolute",
                top: "20px",
                left: "20px",
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.15)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.22)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 35,
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
                transition: "all 0.2s ease"
              }}
            >
              <Icon name="x" size={20} />
            </button>

            {/* Vùng phát Media trung tâm: Phóng to tối đa theo chiều cao */}
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 80px 75px 80px",
                position: "relative"
              }}
            >
              {isImage ? (
                <img
                  key={video.id}
                  src={imageDisplayUrl}
                  alt={video.title}
                  onError={(e) => {
                    if (thumbnailDisplayUrl && e.currentTarget.src !== thumbnailDisplayUrl) {
                      e.currentTarget.src = thumbnailDisplayUrl;
                    }
                  }}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "calc(94vh - 130px)",
                    objectFit: "contain",
                    borderRadius: "8px",
                    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.85)"
                  }}
                />
              ) : videoStreamUrl ? (
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    cursor: "pointer"
                  }}
                  onClick={handleTogglePlay}
                >
                  {/* Nút Play trung tâm khi video tạm dừng (Chuẩn TikTok / Reels) */}
                  {!isPlaying && !isVideoBuffering && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        zIndex: 20,
                        width: "72px",
                        height: "72px",
                        borderRadius: "50%",
                        background: "rgba(0, 0, 0, 0.62)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        border: "1.5px solid rgba(255, 255, 255, 0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
                        pointerEvents: "none",
                        transition: "all 0.2s ease"
                      }}
                    >
                      <Icon name="play" size={32} color="#ffffff" style={{ marginLeft: "4px" }} />
                    </div>
                  )}

                  {/* Vòng xoay Buffering - chỉ hiện khi thực sự đang phát mà mạng/ổ đĩa chưa kịp nạp */}
                  {isVideoBuffering && isPlaying && (
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0, 0, 0, 0.45)",
                      backdropFilter: "blur(3px)",
                      WebkitBackdropFilter: "blur(3px)",
                      borderRadius: "8px",
                      zIndex: 15,
                      gap: "10px",
                      color: "#fff",
                      pointerEvents: "none"
                    }}>
                      <div className="spinner" style={{ width: "34px", height: "34px", borderTopColor: "var(--accent-primary)" }} />
                      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "rgba(255, 255, 255, 0.9)" }}>
                        Đang nạp video chất lượng gốc...
                      </div>
                    </div>
                  )}

                  {isMuted && (
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      style={{
                        position: "absolute",
                        top: "20px",
                        right: "20px",
                        zIndex: 25,
                        background: "rgba(0, 0, 0, 0.75)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        border: "1px solid rgba(255, 255, 255, 0.25)",
                        borderRadius: "20px",
                        color: "#fff",
                        padding: "7px 16px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "7px",
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)"
                      }}
                    >
                      <Icon name="volume" size={15} color="#38bdf8" />
                      <span>Bật âm thanh</span>
                    </button>
                  )}

                  <video
                    ref={videoRef}
                    key={video.id}
                    src={videoStreamUrl}
                    poster={imageDisplayUrl}
                    controls
                    playsInline
                    preload="auto"
                    muted={isMuted}
                    onWaiting={() => {
                      if (videoRef.current && !videoRef.current.paused) {
                        setIsVideoBuffering(true);
                      }
                    }}
                    onLoadedData={() => {
                      setIsVideoBuffering(false);
                    }}
                    onCanPlay={() => {
                      setIsVideoBuffering(false);
                    }}
                    onPlaying={() => {
                      setIsVideoBuffering(false);
                      setIsPlaying(true);
                    }}
                    onPause={() => {
                      setIsPlaying(false);
                      setIsVideoBuffering(false);
                    }}
                    onSeeked={() => {
                      setIsVideoBuffering(false);
                    }}
                    onError={() => {
                      setIsVideoBuffering(false);
                      setIsPlaying(false);
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      maxWidth: "100%",
                      maxHeight: "calc(94vh - 130px)",
                      objectFit: "contain",
                      borderRadius: "8px",
                      boxShadow: "0 10px 40px rgba(0, 0, 0, 0.85)",
                      backgroundColor: "#000"
                    }}
                  />
                </div>
              ) : (
                <div style={{ height: "260px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", padding: "20px", textAlign: "center", gap: "10px" }}>
                  <Icon name="film" size={40} color="var(--text-muted)" />
                  <div style={{ fontSize: "14px" }}>File lưu trữ trên Cloud hoặc không tìm thấy file local.</div>
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

            {/* Nút Điều hướng Lướt Video Trước/Sau Dọc (Chevron Up & Down nổi bên phải - Chuẩn Ảnh 2) */}
            {playlist.length > 1 && (
              <div
                className="tiktok-nav-floating-controls"
                data-no-drag
                style={{
                  position: "absolute",
                  right: "24px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  zIndex: 35
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  disabled={!hasPrev}
                  className="tiktok-nav-btn"
                  title={hasPrev ? "Video trước (Phím ↑ hoặc cuộn chuột lên)" : "Đã là video đầu tiên"}
                  style={{ width: "48px", height: "48px" }}
                >
                  <Icon name="chevronUp" size={26} color="#ffffff" />
                </button>

                <div className="tiktok-nav-counter-badge" style={{ fontSize: "12px", padding: "4px 10px" }} title={`Video ${currentIndex + 1} trên tổng số ${playlist.length}`}>
                  {currentIndex + 1}/{playlist.length}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  disabled={!hasNext}
                  className="tiktok-nav-btn"
                  title={hasNext ? "Video tiếp theo (Phím ↓ hoặc cuộn chuột xuống)" : "Đã là video cuối cùng"}
                  style={{ width: "48px", height: "48px" }}
                >
                  <Icon name="chevronDown" size={26} color="#ffffff" />
                </button>
              </div>
            )}

            {/* Thanh Thông Tin Nhanh Dưới Đáy Khung Chiếu (Docked Stats Bar) */}
            <div
              className="tiktok-stage-bottom-bar"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "14px 24px",
                background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 65%, transparent 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                zIndex: 25
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px" }}>
                <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>
                  {video.quality || "HD"}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {formatFileSize(video.file_size)}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {isImage ? "Ảnh HD" : `${Math.floor(video.duration / 60)}p ${video.duration % 60}s`}
                </span>
                {video.uploader && (
                  <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
                    @{video.uploader}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {video.source_url && (
                  <>
                    <a
                      href={video.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: "4px 11px", fontSize: "11px", gap: "5px", textDecoration: "none" }}
                      title="Mở video gốc trên tab mới"
                    >
                      <Icon name="externalLink" size={12} color="var(--accent-cyan)" />
                      <span>Mở VD gốc</span>
                    </a>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCopySourceUrl}
                      style={{ padding: "4px 9px", fontSize: "11px", gap: "4px" }}
                      title="Sao chép link gốc"
                    >
                      <Icon name={copiedSourceUrl ? "check" : "copy"} size={11} color={copiedSourceUrl ? "var(--accent-green)" : undefined} />
                      <span>{copiedSourceUrl ? "Đã chép" : "Chép link"}</span>
                    </button>
                  </>
                )}
                {video.drive_web_link && (
                  <a
                    href={video.drive_web_link}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "4px 10px", fontSize: "11px", gap: "4px", textDecoration: "none" }}
                    title="Mở file trên Google Drive"
                  >
                    <Icon name="drive" size={12} />
                    <span>Drive</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: BẢNG BIÊN TẬP THÔNG TIN METADATA & GHI CHÚ (FULL HEIGHT SCROLLABLE) */}
          <div
            className="tiktok-panel-right"
          >
            {/* Thanh tiêu đề nhỏ trên cùng của cột phải */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
                <span className={`video-platform-badge platform-${video.platform || "other"}`} style={{ position: "static", padding: "3px 8px" }}>
                  {video.platform?.toUpperCase()}
                </span>
                {currentCatObj && (
                  <span
                    style={{
                      background: "rgba(6, 182, 212, 0.15)",
                      border: "1px solid rgba(6, 182, 212, 0.4)",
                      color: "#38bdf8",
                      borderRadius: "6px",
                      padding: "3px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <Icon name={currentCatObj.icon || "folder"} size={12} color="#38bdf8" />
                    <span>{parentCatOfCurrent ? `${parentCatOfCurrent.name} › ${currentCatObj.name}` : currentCatObj.name}</span>
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                {playlist.length > 1 && (
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    padding: "2px 6px"
                  }}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={handlePrev}
                      disabled={!hasPrev}
                      title="Video trước (Phím ↑)"
                      style={{ padding: "3px 4px", opacity: hasPrev ? 1 : 0.35 }}
                    >
                      <Icon name="chevronUp" size={14} />
                    </button>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", padding: "0 3px", minWidth: "32px", textAlign: "center" }}>
                      {currentIndex + 1}/{playlist.length}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={handleNext}
                      disabled={!hasNext}
                      title="Video tiếp theo (Phím ↓)"
                      style={{ padding: "3px 4px", opacity: hasNext ? 1 : 0.35 }}
                    >
                      <Icon name="chevronDown" size={14} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="icon-btn"
                  onClick={toggleCinemaMode}
                  title="Thu nhỏ cửa sổ (Compact mode)"
                >
                  <Icon name="minimize" size={16} />
                </button>

                <button type="button" className="icon-btn" onClick={onClose} title="Đóng (Esc)">
                  <Icon name="x" size={18} />
                </button>
              </div>
            </div>

            {/* Thẻ Creator Header (Chuẩn TikTok Image 2) */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              marginBottom: "14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--accent-primary) 0%, #38bdf8 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "14px",
                  flexShrink: 0
                }}>
                  {(video.uploader || "C").charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    @{video.uploader || "creator"}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {video.platform?.toUpperCase() || "SOCIAL"} • {video.quality || "HD"}
                  </div>
                </div>
              </div>

              {/* Status action buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={handleToggleUsed}
                  style={{
                    background: isUsed ? "rgba(16, 185, 129, 0.18)" : "rgba(255, 255, 255, 0.06)",
                    border: `1px solid ${isUsed ? "rgba(16, 185, 129, 0.6)" : "var(--border-color)"}`,
                    color: isUsed ? "#10b981" : "var(--text-secondary)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                  title={isUsed ? "Chuyển về Chưa sử dụng" : "Đánh dấu Đã sử dụng"}
                >
                  {isUsed ? "✓ ĐÃ DÙNG" : "Chưa dùng"}
                </button>

                <button
                  type="button"
                  onClick={handleToggleLearned}
                  style={{
                    background: isLearned ? "rgba(16, 185, 129, 0.22)" : "rgba(255, 255, 255, 0.06)",
                    border: `1px solid ${isLearned ? "rgba(16, 185, 129, 0.6)" : "var(--border-color)"}`,
                    color: isLearned ? "#10b981" : "var(--text-secondary)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                  title={isLearned ? "Chuyển về Chưa học" : "Đã xem học làm CapCut"}
                >
                  {isLearned ? "🎓 ĐÃ HỌC" : "⏳ Chưa học"}
                </button>
              </div>
            </div>

            {/* Render Form Inputs */}
            {renderRightForm(true)}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* CHẾ ĐỘ THU GỌN (COMPACT MODE - KHI NGƯỜI DÙNG MUỐN THU NHỎ CỬA SỔ)       */
        /* ========================================================================= */
        <div className="modal-content" style={{ maxWidth: "900px", maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
              <span className={`video-platform-badge platform-${video.platform || "other"}`} style={{ position: "static", padding: "3px 8px" }}>
                {video.platform?.toUpperCase()}
              </span>

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
                  cursor: "pointer"
                }}
              >
                <Icon name={isUsed ? "checkCircle" : "bookmarkCheck"} size={13} color={isUsed ? "#10b981" : "currentColor"} />
                <span>{isUsed ? "✓ ĐÃ SỬ DỤNG" : "Chưa sử dụng"}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleLearned}
                style={{
                  background: isLearned ? "linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(13, 148, 136, 0.25) 100%)" : "rgba(255, 255, 255, 0.06)",
                  border: `1px solid ${isLearned ? "rgba(16, 185, 129, 0.75)" : "var(--border-color)"}`,
                  color: isLearned ? "#10b981" : "var(--text-secondary)",
                  borderRadius: "6px",
                  padding: "3px 9px",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  cursor: "pointer"
                }}
              >
                <Icon name="graduationCap" size={13} color={isLearned ? "#10b981" : "currentColor"} />
                <span>{isLearned ? "🎓 ĐÃ HỌC LÀM" : "⏳ Chưa học làm"}</span>
              </button>

              <h3 style={{ fontSize: "16px", fontWeight: 700, maxWidth: "340px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {title || video.title}
              </h3>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <button
                type="button"
                className="icon-btn"
                onClick={toggleCinemaMode}
                title="Mở rộng rạp chiếu lớn (TikTok mode)"
              >
                <Icon name="maximize" size={16} />
              </button>
              <button className="icon-btn" onClick={onClose} title="Đóng (Esc)">
                <Icon name="x" size={18} />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1.1fr 1.2fr", gap: "20px", padding: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ position: "relative", width: "100%", background: "#000", borderRadius: "12px", overflow: "hidden" }}>
                {isImage ? (
                  <img
                    src={imageDisplayUrl}
                    alt={video.title}
                    onError={(e) => {
                      if (thumbnailDisplayUrl && e.currentTarget.src !== thumbnailDisplayUrl) {
                        e.currentTarget.src = thumbnailDisplayUrl;
                      }
                    }}
                    style={{ width: "100%", maxHeight: "380px", objectFit: "contain", display: "block" }}
                  />
                ) : videoStreamUrl ? (
                  <video src={videoStreamUrl} poster={thumbnailDisplayUrl} controls playsInline autoPlay style={{ width: "100%", maxHeight: "380px", display: "block" }} />
                ) : (
                  <div style={{ height: "240px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Không tìm thấy video</div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {renderRightForm(false)}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="modal-footer">
            <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(t("delete_video_confirm"))) { onDeleteVideo(video.id); onClose(); } }}>
              <Icon name="trash" size={14} />
              <span>{t("delete_video")}</span>
            </button>
            <button className="btn btn-secondary" onClick={() => onOpenScheduleModal(video)}>
              <Icon name="calendar" size={15} />
              <span>{t("schedule_post")}</span>
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
              <Icon name="check" size={15} color="#fff" />
              <span>{isSaving ? "Đang lưu..." : t("save_changes")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
