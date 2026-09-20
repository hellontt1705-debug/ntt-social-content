import React, { useState } from "react";
import { Icon } from "./Icons";
import {
  Copy,
  Check,
  Download,
  FolderDown,
  Heart,
  Edit3,
  Trash2,
  X,
  Sparkles,
  ExternalLink,
  Sliders,
  Tag,
  Calendar,
  Layers,
  Zap,
  RefreshCw,
  Maximize2,
  Tv
} from "lucide-react";
import { reExtractPromptMedia, getFullMediaUrl, fetchDriveMediaInfo } from "../api";

export function parseAspectRatio(arString) {
  if (!arString) return null;
  const match = arString.match(/(?:--ar\s+|aspect\s*ratio\s*|ratio\s*)?(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)/i);
  if (match) {
    const w = parseFloat(match[1]);
    const h = parseFloat(match[2]);
    if (w > 0 && h > 0) return { width: w, height: h, ratio: w / h };
  }
  return null;
}

export function getAspectRatioInfo(width, height, source = "auto") {
  if (!width || !height) return null;
  const ratio = width / height;
  let label = "";
  let badge = "";
  let cssRatio = `${width} / ${height}`;
  let orientation = "landscape"; // landscape | portrait | square
  let badgeColor = "#6366f1";

  if (ratio < 0.92) {
    orientation = "portrait";
    badgeColor = "#ec4899";
  } else if (ratio >= 0.92 && ratio <= 1.08) {
    orientation = "square";
    badgeColor = "#10b981";
  } else {
    orientation = "landscape";
    badgeColor = "#6366f1";
  }

  if (Math.abs(ratio - 9/16) < 0.08) {
    label = "9:16 (Dọc - Shorts, TikTok, Reels)";
    badge = "9:16 Dọc";
    cssRatio = "9 / 16";
  } else if (Math.abs(ratio - 16/9) < 0.08) {
    label = "16:9 (Ngang - Màn ảnh rộng, YouTube)";
    badge = "16:9 Ngang";
    cssRatio = "16 / 9";
  } else if (Math.abs(ratio - 1) < 0.08) {
    label = "1:1 (Vuông - Square Feed)";
    badge = "1:1 Vuông";
    cssRatio = "1 / 1";
  } else if (Math.abs(ratio - 4/5) < 0.08) {
    label = "4:5 (Dọc - Instagram Post)";
    badge = "4:5 Dọc";
    cssRatio = "4 / 5";
  } else if (Math.abs(ratio - 3/4) < 0.08) {
    label = "3:4 (Dọc - Tiêu chuẩn)";
    badge = "3:4 Dọc";
    cssRatio = "3 / 4";
  } else if (Math.abs(ratio - 4/3) < 0.08) {
    label = "4:3 (Ngang - Tiêu chuẩn)";
    badge = "4:3 Ngang";
    cssRatio = "4 / 3";
  } else if (Math.abs(ratio - 21/9) < 0.12) {
    label = "21:9 (Điện ảnh - Ultrawide)";
    badge = "21:9 Ultrawide";
    cssRatio = "21 / 9";
  } else if (Math.abs(ratio - 2/3) < 0.08) {
    label = "2:3 (Dọc - Poster)";
    badge = "2:3 Dọc";
    cssRatio = "2 / 3";
  } else if (Math.abs(ratio - 3/2) < 0.08) {
    label = "3:2 (Ngang - Ảnh tiêu chuẩn)";
    badge = "3:2 Ngang";
    cssRatio = "3 / 2";
  } else {
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const d = gcd(Math.round(width), Math.round(height));
    const rw = Math.round(width / d);
    const rh = Math.round(height / d);
    if (rw < 50 && rh < 50) {
      label = `${rw}:${rh} (${orientation === "landscape" ? "Ngang" : orientation === "portrait" ? "Dọc" : "Vuông"})`;
      badge = `${rw}:${rh}`;
      cssRatio = `${rw} / ${rh}`;
    } else {
      const rStr = ratio > 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
      label = `${rStr} (${orientation === "landscape" ? "Ngang" : orientation === "portrait" ? "Dọc" : "Vuông"})`;
      badge = rStr;
      cssRatio = `${width} / ${height}`;
    }
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
    ratio,
    cssRatio,
    label,
    badge,
    orientation,
    badgeColor,
    source
  };
}

export default function PromptDetailModal({
  prompt,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onExportSinglePrompt
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState(prompt);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [detectedAspect, setDetectedAspect] = useState(null);
  const [userAspectOverride, setUserAspectOverride] = useState(null);

  React.useEffect(() => {
    setCurrentPrompt(prompt);
    setMediaError(false);
    setUserAspectOverride(null);

    if (!prompt) {
      setDetectedAspect(null);
      return;
    }

    // 1. Phân tích trước từ parameters hoặc prompt text (e.g. --ar 16:9, --ar 9:16)
    const arMatch = parseAspectRatio(prompt.parameters || "") || parseAspectRatio(prompt.prompt || "");
    if (arMatch) {
      setDetectedAspect(getAspectRatioInfo(arMatch.width, arMatch.height, "parameter"));
    } else {
      setDetectedAspect(null);
    }

    // 2. Nếu là Google Drive video/file: truy vấn metadata chuẩn (width, height)
    if (prompt.drive_file_id) {
      fetchDriveMediaInfo(prompt.drive_file_id).then((info) => {
        if (info && info.width && info.height) {
          setDetectedAspect(getAspectRatioInfo(info.width, info.height, "metadata"));
        }
      });
      // Preload thumbnail để lấy tỉ lệ qua kích thước ảnh nếu API chưa kịp phản hồi
      const thumb = prompt.thumbnail_url || `/api/drive/thumbnail/${prompt.drive_file_id}`;
      if (thumb) {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth && img.naturalHeight) {
            setDetectedAspect((prev) => {
              if (prev && prev.source === "metadata") return prev;
              return getAspectRatioInfo(img.naturalWidth, img.naturalHeight, "thumbnail");
            });
          }
        };
        img.src = getFullMediaUrl(thumb);
      }
    } else if (prompt.thumbnail_url) {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          setDetectedAspect((prev) => {
            if (prev && prev.source === "metadata") return prev;
            return getAspectRatioInfo(img.naturalWidth, img.naturalHeight, "thumbnail");
          });
        }
      };
      img.src = getFullMediaUrl(prompt.thumbnail_url);
    }
  }, [prompt]);

  if (!isOpen || !prompt) return null;

  const activePrompt = currentPrompt && currentPrompt.id === prompt?.id ? currentPrompt : prompt;

  const isVideo = activePrompt.media_type === "video";
  const isDrive = Boolean(activePrompt.drive_file_id);
  const rawUrl = activePrompt.media_url || activePrompt.thumbnail_url || "";
  const isSocialUrl = !isDrive && /x\.com|twitter\.com|tiktok\.com|douyin\.com|youtube\.com|youtu\.be|instagram\.com/i.test(rawUrl);
  const driveThumbnail = activePrompt.drive_file_id ? `https://lh3.googleusercontent.com/d/${activePrompt.drive_file_id}` : "";
  const mediaUrl = isDrive
    ? (isVideo ? `https://drive.google.com/file/d/${activePrompt.drive_file_id}/preview` : driveThumbnail)
    : rawUrl;

  const effectiveAspect = (() => {
    if (userAspectOverride) {
      if (userAspectOverride === "16:9") {
        return { cssRatio: "16 / 9", orientation: "landscape", badge: "16:9 Ngang", label: "16:9 (Màn ảnh rộng)" };
      }
      if (userAspectOverride === "9:16") {
        return { cssRatio: "9 / 16", orientation: "portrait", badge: "9:16 Dọc", label: "9:16 (Dọc Shorts/TikTok)" };
      }
      if (userAspectOverride === "1:1") {
        return { cssRatio: "1 / 1", orientation: "square", badge: "1:1 Vuông", label: "1:1 (Vuông)" };
      }
      if (userAspectOverride === "4:3") {
        return { cssRatio: "4 / 3", orientation: "landscape", badge: "4:3 Ngang", label: "4:3 (Tiêu chuẩn)" };
      }
    }
    if (detectedAspect) return detectedAspect;
    return isVideo
      ? { cssRatio: "16 / 9", orientation: "landscape", badge: "16:9 (Mặc định)", label: "16:9" }
      : null;
  })();

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(activePrompt.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (e) {
      console.error("Copy failed", e);
    }
  };

  const handleCopyNegative = async () => {
    if (!activePrompt.negative_prompt) return;
    try {
      await navigator.clipboard.writeText(activePrompt.negative_prompt);
      setCopiedNegative(true);
      setTimeout(() => setCopiedNegative(false), 2000);
    } catch (e) {
      console.error("Copy failed", e);
    }
  };

  const handleReExtract = async () => {
    if (!activePrompt?.id) return;
    setIsReExtracting(true);
    try {
      const updated = await reExtractPromptMedia(activePrompt.id);
      setCurrentPrompt(updated);
      setMediaError(false);
    } catch (err) {
      alert("Lỗi khi trích xuất video: " + err.message);
    } finally {
      setIsReExtracting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(5, 7, 15, 0.85)",
        backdropFilter: "blur(12px)",
        padding: "20px",
        animation: "fadeIn 0.2s ease-out"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: effectiveAspect?.orientation === "landscape" ? "1160px" : "960px",
          maxHeight: "92vh",
          backgroundColor: "var(--bg-surface, #10121d)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "max-width 0.25s ease"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                borderRadius: "16px",
                fontSize: "11px",
                fontWeight: 700,
                background: isVideo
                  ? "linear-gradient(135deg, #ec4899, #f43f5e)"
                  : "linear-gradient(135deg, #8b5cf6, #6366f1)",
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}
            >
              <Sparkles size={11} />
              {isVideo ? "Video Prompt" : "Image Prompt"}
            </span>

            {activePrompt.ai_model && (
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "16px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: "rgba(139, 92, 246, 0.15)",
                  color: "#a78bfa",
                  border: "1px solid rgba(139, 92, 246, 0.3)"
                }}
              >
                #{activePrompt.ai_model}
              </span>
            )}

            {activePrompt.category && activePrompt.category !== "general" && (
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  color: "var(--text-secondary, #94a3b8)",
                  background: "rgba(255, 255, 255, 0.05)"
                }}
              >
                {activePrompt.category}
              </span>
            )}

            {effectiveAspect && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 10px",
                  borderRadius: "16px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: effectiveAspect.orientation === "landscape"
                    ? "rgba(99, 102, 241, 0.15)"
                    : effectiveAspect.orientation === "portrait"
                      ? "rgba(236, 72, 153, 0.15)"
                      : "rgba(16, 185, 129, 0.15)",
                  color: effectiveAspect.orientation === "landscape"
                    ? "#818cf8"
                    : effectiveAspect.orientation === "portrait"
                      ? "#f472b6"
                      : "#34d399",
                  border: `1px solid ${
                    effectiveAspect.orientation === "landscape"
                      ? "rgba(99, 102, 241, 0.35)"
                      : effectiveAspect.orientation === "portrait"
                        ? "rgba(236, 72, 153, 0.35)"
                        : "rgba(16, 185, 129, 0.35)"
                  }`
                }}
                title={`Tỉ lệ nhận diện: ${effectiveAspect.label}${effectiveAspect.width ? ` (${effectiveAspect.width}×${effectiveAspect.height}px)` : ""}`}
              >
                <span>📐 {effectiveAspect.badge}</span>
                {effectiveAspect.width && (
                  <span style={{ opacity: 0.8, fontSize: "10px", fontWeight: 500 }}>
                    {effectiveAspect.width}×{effectiveAspect.height}
                  </span>
                )}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {isSocialUrl && (
              <button
                type="button"
                onClick={handleReExtract}
                disabled={isReExtracting}
                style={{
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))",
                  border: "1px solid rgba(139, 92, 246, 0.4)",
                  color: "#a78bfa",
                  padding: "8px 13px",
                  borderRadius: "10px",
                  cursor: isReExtracting ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
                title="Trích xuất lại video/ảnh chất lượng cao từ liên kết gốc"
              >
                {isReExtracting ? <RefreshCw size={14} className="spinning" /> : <Zap size={14} />}
                <span>{isReExtracting ? "Đang lấy video..." : "Trích xuất video"}</span>
              </button>
            )}

            {onExportSinglePrompt && (
              <button
                type="button"
                onClick={() => onExportSinglePrompt(activePrompt.id)}
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  color: "#34d399",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
                title="Tải ảnh/video và thông tin câu lệnh prompt về thư mục máy tính"
              >
                <FolderDown size={15} />
                <span>Tải Về Máy</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggleFavorite(activePrompt.id)}
              style={{
                background: activePrompt.is_favorite ? "rgba(244, 63, 94, 0.15)" : "rgba(255, 255, 255, 0.06)",
                border: activePrompt.is_favorite ? "1px solid rgba(244, 63, 94, 0.4)" : "1px solid rgba(255, 255, 255, 0.1)",
                color: activePrompt.is_favorite ? "#f43f5e" : "var(--text-secondary, #94a3b8)",
                padding: "8px 12px",
                borderRadius: "10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: 600,
                transition: "all 0.2s"
              }}
              title={activePrompt.is_favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
            >
              <Heart size={15} fill={activePrompt.is_favorite ? "#f43f5e" : "none"} />
              <span>{activePrompt.is_favorite ? "Đã thích" : "Yêu thích"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "var(--text-secondary, #94a3b8)",
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              title="Đóng (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body: Split Layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: effectiveAspect?.orientation === "landscape"
              ? "1.3fr 1fr"
              : effectiveAspect?.orientation === "portrait"
                ? "1fr 1.25fr"
                : "1.1fr 1fr",
            flex: 1,
            overflow: "hidden",
            minHeight: "450px",
            transition: "grid-template-columns 0.25s ease"
          }}
          className="prompt-detail-grid"
        >
          {/* Left: Media Viewport */}
          <div
            style={{
              backgroundColor: "#07080f",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              position: "relative",
              borderRight: "1px solid rgba(255, 255, 255, 0.08)",
              overflow: "hidden"
            }}
          >
            {/* Floating Aspect Ratio Control Overlay */}
            {isVideo && (
              <div
                style={{
                  position: "absolute",
                  top: "14px",
                  left: "16px",
                  zIndex: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(12, 14, 24, 0.8)",
                  backdropFilter: "blur(8px)",
                  padding: "4px 8px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  fontSize: "11px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                }}
              >
                <span style={{ fontWeight: 600, color: "#94a3b8", display: "flex", alignItems: "center", gap: "3px" }}>
                  📐 Tỉ lệ:
                </span>
                <span style={{ color: effectiveAspect?.orientation === "portrait" ? "#f472b6" : "#818cf8", fontWeight: 700 }}>
                  {effectiveAspect?.badge || "Tự động"}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: "2px", marginLeft: "4px" }}>
                  {[
                    { id: "auto", label: "Tự động" },
                    { id: "16:9", label: "16:9" },
                    { id: "9:16", label: "9:16" },
                    { id: "1:1", label: "1:1" }
                  ].map((btn) => {
                    const isSelected = (!userAspectOverride && btn.id === "auto") || userAspectOverride === btn.id;
                    return (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => setUserAspectOverride(btn.id === "auto" ? null : btn.id)}
                        style={{
                          background: isSelected ? "rgba(255, 255, 255, 0.22)" : "transparent",
                          border: "none",
                          borderRadius: "4px",
                          color: isSelected ? "#fff" : "#94a3b8",
                          padding: "2px 6px",
                          fontSize: "10.5px",
                          fontWeight: isSelected ? 700 : 500,
                          cursor: "pointer",
                          transition: "all 0.15s"
                        }}
                        title={`Chuyển khung video sang tỉ lệ ${btn.label}`}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mediaError || (isSocialUrl && !activePrompt.local_path && !rawUrl.includes("/media/downloads/prompts/")) ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "36px 20px",
                  gap: "14px",
                  maxWidth: "400px"
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "16px",
                    background: "rgba(99, 102, 241, 0.15)",
                    border: "1px solid rgba(99, 102, 241, 0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#818cf8"
                  }}
                >
                  <Zap size={28} />
                </div>

                <div>
                  <h4 style={{ margin: "0 0 6px", fontSize: "14.5px", fontWeight: 700, color: "#fff" }}>
                    Liên kết chưa được trích xuất video trực tiếp
                  </h4>
                  <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-secondary, #94a3b8)", lineHeight: 1.5 }}>
                    Đường dẫn bài viết mạng xã hội cần được giải mã để lấy file video MP4 gốc chất lượng cao và phát trực tiếp tại đây.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleReExtract}
                  disabled={isReExtracting}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "10px 20px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    border: "none",
                    color: "#fff",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    cursor: isReExtracting ? "wait" : "pointer",
                    boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4)",
                    transition: "all 0.2s"
                  }}
                >
                  {isReExtracting ? (
                    <>
                      <RefreshCw size={14} className="spinning" />
                      <span>Đang trích xuất video gốc...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      <span>Trích Xuất & Xem Video Gốc</span>
                    </>
                  )}
                </button>
              </div>
            ) : isVideo ? (
              <div
                style={{
                  width: "100%",
                  maxWidth: effectiveAspect?.orientation === "portrait"
                    ? "380px"
                    : effectiveAspect?.orientation === "square"
                      ? "480px"
                      : "100%",
                  aspectRatio: effectiveAspect?.cssRatio || "16 / 9",
                  maxHeight: "76vh",
                  borderRadius: "14px",
                  overflow: "hidden",
                  boxShadow: "0 15px 35px rgba(0, 0, 0, 0.6)",
                  backgroundColor: "#000",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "max-width 0.25s ease, aspect-ratio 0.25s ease"
                }}
              >
                {activePrompt.drive_file_id ? (
                  <iframe
                    src={`https://drive.google.com/file/d/${activePrompt.drive_file_id}/preview`}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none"
                    }}
                    allow="autoplay"
                    title={activePrompt.title || "Drive Video"}
                  />
                ) : (
                  <video
                    src={getFullMediaUrl(activePrompt.local_path?.startsWith("/media") ? activePrompt.local_path : (activePrompt.local_path ? `/media/downloads/prompts/${activePrompt.local_path.split(/[/\\]/).pop()}` : mediaUrl))}
                    controls
                    autoPlay
                    loop
                    playsInline
                    onLoadedMetadata={(e) => {
                      const { videoWidth, videoHeight } = e.target;
                      if (videoWidth && videoHeight) {
                        setDetectedAspect(getAspectRatioInfo(videoWidth, videoHeight, "metadata"));
                      }
                    }}
                    onError={() => setMediaError(true)}
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundColor: "#000",
                      objectFit: "contain"
                    }}
                  />
                )}
              </div>
            ) : mediaUrl ? (
              <img
                src={getFullMediaUrl(mediaUrl)}
                alt={activePrompt.title || "Prompt Visual"}
                onLoad={(e) => {
                  const { naturalWidth, naturalHeight } = e.target;
                  if (naturalWidth && naturalHeight) {
                    setDetectedAspect(getAspectRatioInfo(naturalWidth, naturalHeight, "metadata"));
                  }
                }}
                onError={(e) => {
                  if (activePrompt.drive_file_id && !e.target.src.includes("googleusercontent.com")) {
                    e.target.src = `https://lh3.googleusercontent.com/d/${activePrompt.drive_file_id}`;
                  } else {
                    setMediaError(true);
                  }
                }}
                style={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  borderRadius: "14px",
                  boxShadow: "0 15px 35px rgba(0, 0, 0, 0.6)"
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  color: "var(--text-muted, #64748b)"
                }}
              >
                <Sparkles size={48} opacity={0.3} />
                <span>Không có hình ảnh xem trước</span>
              </div>
            )}

            {/* Bottom Actions: External Drive Link & Download */}
            <div
              style={{
                position: "absolute",
                bottom: "20px",
                left: "20px",
                right: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                pointerEvents: "none"
              }}
            >
              {activePrompt.drive_file_id ? (
                <a
                  href={`https://drive.google.com/file/d/${activePrompt.drive_file_id}/view`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    pointerEvents: "auto",
                    background: "rgba(0, 0, 0, 0.75)",
                    backdropFilter: "blur(8px)",
                    color: "#fff",
                    padding: "7px 12px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    textDecoration: "none",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    boxShadow: "0 4px 15px rgba(0,0,0,0.4)",
                    transition: "all 0.2s"
                  }}
                  title="Mở video trên Google Drive để xem đầy đủ hoặc quản lý"
                >
                  <ExternalLink size={13} />
                  <span>Xem trên Drive</span>
                </a>
              ) : <div />}

              {mediaUrl && (
                <a
                  href={getFullMediaUrl(mediaUrl)}
                  download
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    pointerEvents: "auto",
                    background: "rgba(0, 0, 0, 0.75)",
                    backdropFilter: "blur(8px)",
                    color: "#fff",
                    padding: "7px 13px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    textDecoration: "none",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    boxShadow: "0 4px 15px rgba(0,0,0,0.4)",
                    transition: "all 0.2s"
                  }}
                >
                  <Download size={13} />
                  <span>Tải file gốc</span>
                </a>
              )}
            </div>
          </div>

          {/* Right: Prompt Info & Actions */}
          <div
            style={{
              padding: "18px 22px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}
          >
            {/* Title */}
            <div>
              <h2
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "var(--text-primary, #f8fafc)",
                  marginBottom: "4px",
                  lineHeight: 1.3
                }}
              >
                {activePrompt.title || "Prompt không có tiêu đề"}
              </h2>
              {activePrompt.created_at && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "var(--text-muted, #64748b)"
                  }}
                >
                  <Calendar size={13} />
                  <span>{new Date(activePrompt.created_at).toLocaleString("vi-VN")}</span>
                </div>
              )}
            </div>

            {/* Prompt Command Box */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--text-primary, #f8fafc)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  <Sparkles size={14} color="#8b5cf6" />
                  Câu Lệnh Prompt
                </label>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: copiedPrompt
                      ? "rgba(16, 185, 129, 0.2)"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: copiedPrompt ? "#34d399" : "#fff",
                    border: copiedPrompt ? "1px solid rgba(16, 185, 129, 0.4)" : "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
                    transition: "all 0.2s"
                  }}
                >
                  {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedPrompt ? "Đã chép Prompt!" : "Sao chép Prompt"}</span>
                </button>
              </div>

              <div
                style={{
                  backgroundColor: "rgba(14, 16, 26, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: "16px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                  color: "#e2e8f0",
                  fontFamily: "var(--font-mono, monospace)",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  userSelect: "all",
                  maxHeight: "180px",
                  overflowY: "auto"
                }}
              >
                {activePrompt.prompt}
              </div>
            </div>

            {/* Negative Prompt (if exists) */}
            {activePrompt.negative_prompt && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#f43f5e",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px"
                    }}
                  >
                    Negative Prompt
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyNegative}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "rgba(255, 255, 255, 0.06)",
                      color: copiedNegative ? "#34d399" : "var(--text-secondary, #94a3b8)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      cursor: "pointer"
                    }}
                  >
                    {copiedNegative ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedNegative ? "Đã chép!" : "Chép Negative"}</span>
                  </button>
                </div>

                <div
                  style={{
                    backgroundColor: "rgba(244, 63, 94, 0.05)",
                    border: "1px solid rgba(244, 63, 94, 0.2)",
                    borderRadius: "10px",
                    padding: "12px",
                    fontSize: "13px",
                    lineHeight: 1.5,
                    color: "#fda4af",
                    fontFamily: "var(--font-mono, monospace)",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {activePrompt.negative_prompt}
                </div>
              </div>
            )}

            {/* Parameters (if exists) */}
            {activePrompt.parameters && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text-muted, #64748b)",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    textTransform: "uppercase"
                  }}
                >
                  <Sliders size={13} />
                  Parameters / Cấu hình
                </label>
                <div
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontFamily: "var(--font-mono, monospace)",
                    color: "#a5b4fc"
                  }}
                >
                  {activePrompt.parameters}
                </div>
              </div>
            )}

            {/* Tags */}
            {activePrompt.tags && activePrompt.tags.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text-muted, #64748b)",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    textTransform: "uppercase"
                  }}
                >
                  <Tag size={13} />
                  Thẻ Tags
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {activePrompt.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: "12px",
                        padding: "4px 10px",
                        borderRadius: "15px",
                        background: "rgba(255, 255, 255, 0.06)",
                        color: "var(--text-secondary, #94a3b8)",
                        border: "1px solid rgba(255, 255, 255, 0.08)"
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div
              style={{
                marginTop: "auto",
                paddingTop: "16px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <button
                type="button"
                onClick={() => onEdit(activePrompt)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 600,
                  background: "rgba(255, 255, 255, 0.06)",
                  color: "var(--text-primary, #f8fafc)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <Edit3 size={15} />
                Chỉnh sửa
              </button>

              <button
                type="button"
                onClick={() => onDelete(activePrompt.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 600,
                  background: "rgba(244, 63, 94, 0.1)",
                  color: "#f43f5e",
                  border: "1px solid rgba(244, 63, 94, 0.25)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <Trash2 size={15} />
                Xóa Prompt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
