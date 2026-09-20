import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Sparkles,
  Plus,
  Search,
  Copy,
  Check,
  Heart,
  Eye,
  Trash2,
  Edit3,
  Upload,
  Link as LinkIcon,
  Film,
  Image as ImageIcon,
  Sliders,
  Tag,
  FolderOpen,
  FolderDown,
  Filter,
  Layers,
  X,
  RefreshCw,
  Info,
  Cloud,
  Zap
} from "lucide-react";
import PromptDetailModal, { parseAspectRatio, getAspectRatioInfo } from "./PromptDetailModal";
import ExportPromptModal from "./ExportPromptModal";
import {
  fetchPrompts,
  fetchPromptStats,
  createPrompt,
  createBatchPrompts,
  updatePrompt,
  deletePrompt,
  deleteBatchPrompts,
  favoriteBatchPrompts,
  syncBatchPromptsToDrive,
  toggleFavoritePrompt,
  uploadPromptMedia,
  extractPromptMediaFromUrl,
  MEDIA_BASE,
  getFullMediaUrl
} from "../api";
import { useLanguage } from "../i18n";

function VideoCardMedia({ prompt, isVideoTab, thumbUrl, playableUrl }) {
  const [aspect, setAspect] = React.useState(() => {
    const arMatch = parseAspectRatio(prompt.parameters || "") || parseAspectRatio(prompt.prompt || "");
    if (arMatch) {
      return getAspectRatioInfo(arMatch.width, arMatch.height, "parameter");
    }
    return null;
  });

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (naturalWidth && naturalHeight) {
      setAspect((prev) => {
        if (prev && prev.source === "parameter") return prev;
        return getAspectRatioInfo(naturalWidth, naturalHeight, "thumbnail");
      });
    }
  };

  const handleVideoMetadata = (e) => {
    const { videoWidth, videoHeight } = e.target;
    if (videoWidth && videoHeight) {
      setAspect(getAspectRatioInfo(videoWidth, videoHeight, "metadata"));
    }
  };

  const cssRatio = aspect?.cssRatio || "16 / 9";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        aspectRatio: cssRatio,
        backgroundColor: "#080912"
      }}
    >
      {playableUrl ? (
        <video
          src={playableUrl}
          poster={thumbUrl}
          className="prompt-card-media"
          preload="metadata"
          muted
          playsInline
          loop
          onLoadedMetadata={handleVideoMetadata}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onMouseOver={(e) => e.target.play().catch(() => {})}
          onMouseOut={(e) => {
            e.target.pause();
            e.target.currentTime = 0;
          }}
        />
      ) : thumbUrl ? (
        <img
          src={thumbUrl}
          alt={prompt.title || "Video Thumbnail"}
          className="prompt-card-media"
          loading="lazy"
          onLoad={handleImageLoad}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            if (prompt.drive_file_id) {
              e.target.style.display = "none";
              const iframe = e.target.parentElement?.querySelector(".drive-video-iframe-fallback");
              if (iframe) iframe.style.display = "block";
            }
          }}
        />
      ) : null}

      {/* Drive video iframe fallback nếu không có ảnh thumbnail hoặc ảnh lỗi */}
      {prompt.drive_file_id && (
        <iframe
          src={`https://drive.google.com/file/d/${prompt.drive_file_id}/preview`}
          className="drive-video-iframe-fallback"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            pointerEvents: "none",
            display: thumbUrl ? "none" : "block"
          }}
          loading="lazy"
          title={prompt.title || "Drive Video"}
        />
      )}

      {!playableUrl && !thumbUrl && !prompt.drive_file_id && (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255, 255, 255, 0.03)",
            color: "var(--text-muted, #64748b)",
            gap: "8px"
          }}
        >
          <Film size={24} opacity={0.4} />
          <span style={{ fontSize: "11.5px" }}>Video Prompt</span>
        </div>
      )}

      {/* Góc dưới bên phải: Badge Video kèm Tỉ lệ kích thước nhận diện */}
      <div
        className="prompt-video-badge-idle"
        style={{
          position: "absolute",
          bottom: "8px",
          right: "8px",
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(6px)",
          borderRadius: "6px",
          padding: "3px 7px",
          fontSize: "10px",
          fontWeight: 600,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: "5px",
          zIndex: 2,
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)"
        }}
      >
        <Film size={11} color="#f472b6" />
        <span>Video</span>
        {aspect && (
          <span
            style={{
              paddingLeft: "5px",
              borderLeft: "1px solid rgba(255, 255, 255, 0.25)",
              color: aspect.orientation === "portrait" ? "#f472b6" : aspect.orientation === "landscape" ? "#818cf8" : "#34d399",
              fontWeight: 700
            }}
          >
            {aspect.badge.split(" ")[0]}
          </span>
        )}
      </div>
    </div>
  );
}

const POPULAR_AI_MODELS = [
  "Tất cả",
  "ChatGPT",
  "Veo 3",
  "Seedance"
];

const CATEGORIES = [
  "Tất cả",
  "Chân dung (Portrait)",
  "Phong cảnh (Landscape)",
  "Thời trang (Fashion)",
  "Anime / Manga",
  "3D & CGI",
  "Điện ảnh (Cinematic)",
  "Quảng cáo & Sản phẩm",
  "Khoa học viễn tưởng (Sci-Fi)",
  "Nghệ thuật trừu tượng"
];

export default function PromptVault() {
  const { t } = useLanguage();

  // State: Data
  const [prompts, setPrompts] = useState([]);
  const [stats, setStats] = useState({ total: 0, images: 0, videos: 0, favorites: 0, models: [] });
  const [loading, setLoading] = useState(true);

  // State: Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all"); // "all" | "image" | "video" | "favorite"
  const [selectedModel, setSelectedModel] = useState("Tất cả");
  const [selectedCategory, setSelectedCategory] = useState("Tất cả");
  const [videoCardSize, setVideoCardSize] = useState("large"); // "medium" (320px) | "large" (440px) | "cinema" (620px)

  // State: Modals
  const [detailPrompt, setDetailPrompt] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);

  // State: Copy feedback tracker (card ID -> boolean)
  const [copiedId, setCopiedId] = useState(null);

  // State: Multi-select IDs
  const [selectedIds, setSelectedIds] = useState([]);

  // State: Export to local folder modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTargetIds, setExportTargetIds] = useState([]);

  // Batch Selection Handlers
  const handleToggleSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredPrompts.length && filteredPrompts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPrompts.map((p) => p.id));
    }
  };

  const handleBatchCopy = async () => {
    if (selectedIds.length === 0) return;
    const selectedPrompts = prompts.filter((p) => selectedIds.includes(p.id));
    const combined = selectedPrompts
      .map((p, idx) => `[Prompt ${idx + 1}] ${p.prompt}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(combined);
      alert(`Đã sao chép thành công ${selectedPrompts.length} câu lệnh Prompt vào clipboard!`);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const handleBatchFavorite = async () => {
    if (selectedIds.length === 0) return;
    try {
      await favoriteBatchPrompts(selectedIds, true);
      setPrompts((prev) =>
        prev.map((p) => (selectedIds.includes(p.id) ? { ...p, is_favorite: 1 } : p))
      );
      fetchPromptStats().then(setStats).catch(() => {});
      alert(`Đã thêm ${selectedIds.length} prompt vào danh sách Yêu thích!`);
    } catch (err) {
      alert("Lỗi khi cập nhật yêu thích: " + err.message);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} prompt đã chọn khỏi kho?`)) return;
    try {
      await deleteBatchPrompts(selectedIds);
      setPrompts((prev) => prev.filter((p) => !selectedIds.includes(p.id)));
      setSelectedIds([]);
      fetchPromptStats().then(setStats).catch(() => {});
    } catch (err) {
      alert("Lỗi khi xóa: " + err.message);
    }
  };

  // Batch Sync to Google Drive
  const [syncingDrive, setSyncingDrive] = useState(false);
  const handleBatchSyncDrive = async () => {
    if (selectedIds.length === 0) return;
    setSyncingDrive(true);
    try {
      const res = await syncBatchPromptsToDrive(selectedIds);
      setPrompts((prev) =>
        prev.map((p) =>
          selectedIds.includes(p.id) ? { ...p, drive_synced: 1 } : p
        )
      );
      alert(res.message || `Đã đồng bộ ${selectedIds.length} prompt lên Google Drive thành công!`);
    } catch (err) {
      alert("Lỗi đồng bộ lên Google Drive: " + err.message);
    } finally {
      setSyncingDrive(false);
    }
  };

  // 1. Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [promptsData, statsData] = await Promise.all([
        fetchPrompts(),
        fetchPromptStats()
      ]);
      setPrompts(promptsData || []);
      setStats(statsData || { total: 0, images: 0, videos: 0, favorites: 0, models: [] });
    } catch (e) {
      console.error("Lỗi khi tải dữ liệu prompt:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 2. Filter prompts client-side for ultra-fast instant search
  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      // Type filter
      if (selectedType === "image" && p.media_type !== "image") return false;
      if (selectedType === "video" && p.media_type !== "video") return false;
      if (selectedType === "favorite" && !p.is_favorite) return false;

      // Model filter
      if (selectedModel !== "Tất cả") {
        const modelLower = (p.ai_model || "").toLowerCase();
        const targetLower = selectedModel.toLowerCase();
        if (!modelLower.includes(targetLower) && !targetLower.includes(modelLower)) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== "Tất cả") {
        if (p.category !== selectedCategory) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = (p.title || "").toLowerCase().includes(q);
        const inPrompt = (p.prompt || "").toLowerCase().includes(q);
        const inNegative = (p.negative_prompt || "").toLowerCase().includes(q);
        const inModel = (p.ai_model || "").toLowerCase().includes(q);
        const inTags = (p.tags || []).some((tag) => tag.toLowerCase().includes(q));
        if (!inTitle && !inPrompt && !inNegative && !inModel && !inTags) {
          return false;
        }
      }

      return true;
    });
  }, [prompts, selectedType, selectedModel, selectedCategory, searchQuery]);

  // 3. Quick Copy Prompt
  const handleCopyPrompt = async (promptText, promptId, e) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedId(promptId);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  // 4. Toggle Favorite
  const handleToggleFavorite = async (promptId, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await toggleFavoritePrompt(promptId);
      setPrompts((prev) =>
        prev.map((p) => (p.id === promptId ? { ...p, is_favorite: res.is_favorite ? 1 : 0 } : p))
      );
      setStats((prev) => ({
        ...prev,
        favorites: res.is_favorite ? prev.favorites + 1 : Math.max(0, prev.favorites - 1)
      }));
      if (detailPrompt && detailPrompt.id === promptId) {
        setDetailPrompt((prev) => ({ ...prev, is_favorite: res.is_favorite ? 1 : 0 }));
      }
    } catch (err) {
      console.error("Toggle favorite failed", err);
    }
  };

  // 5. Delete Prompt
  const handleDeletePrompt = async (promptId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Bạn có chắc chắn muốn xóa prompt này khỏi kho?")) return;
    try {
      await deletePrompt(promptId);
      setPrompts((prev) => prev.filter((p) => p.id !== promptId));
      if (detailPrompt && detailPrompt.id === promptId) {
        setDetailPrompt(null);
      }
      fetchPromptStats().then(setStats).catch(() => {});
    } catch (err) {
      alert("Lỗi khi xóa prompt: " + err.message);
    }
  };

  // 6. Start Edit
  const handleStartEdit = (prompt, e) => {
    if (e) e.stopPropagation();
    setEditingPrompt(prompt);
    setIsCreateModalOpen(true);
    if (detailPrompt) setDetailPrompt(null);
  };

  const isVideoTab = selectedType === "video";
  const videoMinW = videoCardSize === "cinema" ? "620px" : videoCardSize === "medium" ? "300px" : "430px";

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px",
        backgroundColor: "var(--bg-app, #090a10)",
        color: "var(--text-primary, #f8fafc)",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }}
    >
      <style>{`
        /* Promptsref-style Masonry Grid - 20% more compact */
        .prompt-masonry-grid {
          column-count: 6;
          column-gap: 9px;
          width: 100%;
        }
        @media (min-width: 1650px) {
          .prompt-masonry-grid {
            column-count: 7;
          }
        }
        @media (min-width: 1920px) {
          .prompt-masonry-grid {
            column-count: 8;
          }
        }
        @media (max-width: 1350px) {
          .prompt-masonry-grid {
            column-count: 5;
          }
        }
        @media (max-width: 1050px) {
          .prompt-masonry-grid {
            column-count: 4;
          }
        }
        @media (max-width: 750px) {
          .prompt-masonry-grid {
            column-count: 3;
          }
        }
        @media (max-width: 480px) {
          .prompt-masonry-grid {
            column-count: 2;
          }
        }

        /* Dedicated Wide Showcase Grid for Video tab */
        .prompt-video-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(var(--video-card-min-width, 430px), 1fr));
          gap: 14px;
          width: 100%;
        }

        @media (max-width: 900px) {
          .prompt-video-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 12px;
          }
        }

        @media (max-width: 550px) {
          .prompt-video-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
        }

        .prompt-video-grid .prompt-card-masonry {
          margin-bottom: 0;
          border-radius: 12px;
          background: var(--bg-surface, #121422);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
          align-self: start;
        }

        .prompt-video-grid .prompt-card-masonry:hover {
          transform: translateY(-4px);
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(236, 72, 153, 0.5);
          border-color: rgba(236, 72, 153, 0.5);
        }

        /* Card Container: Displays raw image/video in exact natural aspect ratio */
        .prompt-card-masonry {
          break-inside: avoid;
          margin-bottom: 8px;
          position: relative;
          border-radius: 9px;
          overflow: hidden;
          background: var(--bg-surface, #121422);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
          cursor: pointer;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, border-color 0.25s ease;
        }

        .prompt-card-masonry:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.4);
          border-color: rgba(139, 92, 246, 0.4);
        }

        .prompt-card-media {
          width: 100%;
          height: auto;
          display: block;
          transition: transform 0.4s ease;
        }

        .prompt-card-masonry:hover .prompt-card-media {
          transform: scale(1.03);
        }

        /* Hover Overlay: Hidden by default (opacity: 0), smoothly appears only on hover */
        .prompt-card-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          padding: 8px;
          background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.75) 0%,
            rgba(0, 0, 0, 0.15) 30%,
            rgba(0, 0, 0, 0.25) 55%,
            rgba(5, 7, 15, 0.95) 100%
          );
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          border-radius: 10px;
          z-index: 2;
        }

        .prompt-card-masonry:hover .prompt-card-overlay {
          opacity: 1;
          pointer-events: auto;
        }

        .prompt-video-badge-idle {
          transition: opacity 0.2s ease;
        }

        .prompt-card-masonry:hover .prompt-video-badge-idle {
          opacity: 0;
          pointer-events: none;
        }

        /* Checkbox styling */
        .prompt-card-checkbox {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 10;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.18s ease;
          background: rgba(0, 0, 0, 0.65);
          border: 1.5px solid rgba(255, 255, 255, 0.65);
          backdrop-filter: blur(4px);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
          opacity: 0;
        }

        .prompt-card-masonry:hover .prompt-card-checkbox,
        .prompt-card-checkbox.is-selected,
        .prompt-card-checkbox.selection-active {
          opacity: 1 !important;
        }

        .prompt-card-checkbox.is-selected {
          background: #8b5cf6 !important;
          border-color: #fff !important;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.7) !important;
        }

        .prompt-card-masonry.is-selected {
          border-color: #8b5cf6 !important;
          box-shadow: 0 0 0 2px #8b5cf6, 0 8px 20px rgba(139, 92, 246, 0.35) !important;
        }
      `}</style>

      {/* Search, Filter & Action Toolbar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "var(--bg-surface, #10121d)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
          borderRadius: "12px",
          padding: "12px 16px"
        }}
      >
        {/* Row 1: Search input + Type tabs + Action Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px"
          }}
        >
          {/* Search Box */}
          <div
            style={{
              position: "relative",
              flex: "1 1 240px",
              maxWidth: "420px"
            }}
          >
            <Search
              size={15}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted, #64748b)"
              }}
            />
            <input
              type="text"
              placeholder="Tìm kiếm prompt, tiêu đề, tags, mô hình AI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                backgroundColor: "var(--bg-input, rgba(14, 16, 26, 0.85))",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                borderRadius: "8px",
                color: "var(--text-primary, #f8fafc)",
                fontSize: "13px",
                outline: "none"
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted, #64748b)",
                  cursor: "pointer"
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Type Tabs: Tất cả / Ảnh / Video / Yêu thích */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.05)",
              padding: "3px",
              borderRadius: "8px",
              gap: "3px"
            }}
          >
            {[
              { id: "all", label: "Tất cả", icon: Layers },
              { id: "image", label: "Ảnh", icon: ImageIcon },
              { id: "video", label: "Video", icon: Film },
              { id: "favorite", label: "Yêu thích", icon: Heart }
            ].map((tab) => {
              const IconComp = tab.icon;
              const isActive = selectedType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedType(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 11px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: isActive
                      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                      : "transparent",
                    color: isActive ? "#fff" : "var(--text-secondary, #94a3b8)",
                    boxShadow: isActive ? "0 2px 6px rgba(99, 102, 241, 0.25)" : "none",
                    transition: "all 0.15s"
                  }}
                >
                  <IconComp size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Video Size Controls (chỉ hiện khi đang xem tab Video) */}
          {selectedType === "video" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(255, 255, 255, 0.04)",
                padding: "3px 6px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.08)"
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", fontWeight: 600, paddingLeft: "4px" }}>
                Kích thước:
              </span>
              {[
                { id: "medium", label: "Vừa" },
                { id: "large", label: "Lớn" },
                { id: "cinema", label: "Rạp chiếu" }
              ].map((sz) => (
                <button
                  key={sz.id}
                  type="button"
                  onClick={() => setVideoCardSize(sz.id)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: videoCardSize === sz.id
                      ? "linear-gradient(135deg, #ec4899, #f43f5e)"
                      : "transparent",
                    color: videoCardSize === sz.id ? "#fff" : "var(--text-secondary, #94a3b8)",
                    transition: "all 0.15s"
                  }}
                  title={`Chuyển kích thước video sang ${sz.label}`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          )}

          {/* Action Buttons: Select All + Refresh + Add Prompt */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Select All Checkbox Button */}
            <button
              type="button"
              onClick={handleToggleSelectAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 12px",
                borderRadius: "8px",
                background: selectedIds.length > 0 ? "rgba(139, 92, 246, 0.18)" : "rgba(255, 255, 255, 0.05)",
                border: selectedIds.length > 0 ? "1px solid rgba(139, 92, 246, 0.45)" : "1px solid rgba(255, 255, 255, 0.1)",
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.15s"
              }}
              title={
                filteredPrompts.length > 0 && selectedIds.length === filteredPrompts.length
                  ? "Bỏ chọn tất cả"
                  : "Chọn tất cả prompt đang hiển thị"
              }
            >
              <div
                style={{
                  width: "15px",
                  height: "15px",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    selectedIds.length > 0 && selectedIds.length === filteredPrompts.length
                      ? "#8b5cf6"
                      : selectedIds.length > 0
                      ? "rgba(139, 92, 246, 0.7)"
                      : "transparent",
                  border: selectedIds.length > 0 ? "1px solid #fff" : "1.5px solid rgba(255, 255, 255, 0.5)"
                }}
              >
                {selectedIds.length > 0 && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: selectedIds.length > 0 ? "#c4b5fd" : "var(--text-secondary, #94a3b8)"
                }}
              >
                {selectedIds.length > 0
                  ? `Đã chọn (${selectedIds.length}/${filteredPrompts.length})`
                  : "Chọn tất cả"}
              </span>
            </button>
            <button
              type="button"
              onClick={loadData}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                padding: "8px",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
              title="Làm mới danh sách"
            >
              <RefreshCw size={14} />
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingPrompt(null);
                setIsCreateModalOpen(true);
              }}
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 4px 15px rgba(139, 92, 246, 0.35)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease"
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <Plus size={15} />
              <span>Thêm Prompt Mới</span>
            </button>
          </div>
        </div>

        {/* Row 2: AI Model Filter Pills (DomixHub / Promptsref style) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            overflowX: "auto",
            paddingBottom: "2px"
          }}
          className="model-filter-scroll"
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--text-muted, #64748b)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              whiteSpace: "nowrap",
              marginRight: "2px"
            }}
          >
            Mô hình AI:
          </span>

          {POPULAR_AI_MODELS.map((model) => {
            const isActive = selectedModel === model;
            return (
              <button
                key={model}
                type="button"
                onClick={() => setSelectedModel(model)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "11px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  border: isActive
                    ? "1px solid #8b5cf6"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  background: isActive ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.03)",
                  color: isActive ? "#c4b5fd" : "var(--text-secondary, #94a3b8)",
                  transition: "all 0.15s"
                }}
              >
                {model}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Prompt Grid */}
      {loading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 20px",
            gap: "16px",
            color: "var(--text-muted, #64748b)"
          }}
        >
          <RefreshCw size={32} className="spinning" />
          <span>Đang tải kho prompt...</span>
        </div>
      ) : filteredPrompts.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 20px",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "16px",
            border: "1px dashed rgba(255, 255, 255, 0.1)",
            gap: "14px",
            color: "var(--text-muted, #64748b)"
          }}
        >
          <Sparkles size={48} opacity={0.3} />
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary, #f8fafc)" }}>
            Chưa có prompt nào phù hợp với bộ lọc
          </h3>
          <p style={{ fontSize: "13px", maxWidth: "450px", textAlign: "center" }}>
            Hãy thử tìm kiếm với từ khóa khác, hoặc bấm nút bên dưới để tải ảnh/video từ máy tính lên
            và lưu câu lệnh prompt mới.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingPrompt(null);
              setIsCreateModalOpen(true);
            }}
            style={{
              marginTop: "8px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <Plus size={16} />
            <span>Thêm Prompt Ngay</span>
          </button>
        </div>
      ) : (
        <div
          className={isVideoTab ? "prompt-video-grid" : "prompt-masonry-grid"}
          style={isVideoTab ? { "--video-card-min-width": videoMinW } : undefined}
        >
          {filteredPrompts.map((p) => {
            const isVideo = p.media_type === "video";
            const driveThumb = p.drive_file_id
              ? (isVideo ? `/api/drive/thumbnail/${p.drive_file_id}` : `https://lh3.googleusercontent.com/d/${p.drive_file_id}`)
              : "";
            const isBrokenLh3 = isVideo && p.thumbnail_url && p.thumbnail_url.includes("googleusercontent.com/d/");
            const rawThumb = (p.thumbnail_url && !p.thumbnail_url.includes("/preview") && !isBrokenLh3)
              ? p.thumbnail_url
              : (driveThumb || (p.media_url && !p.media_url.includes("/preview") ? p.media_url : ""));
            const thumbUrl = getFullMediaUrl(rawThumb);

            const rawPlayable = (p.local_path && p.local_path.length > 0)
              ? (p.local_path.startsWith("/media") ? p.local_path : `/media/downloads/prompts/${p.local_path.split(/[/\\]/).pop()}`)
              : (p.media_url && (p.media_url.endsWith(".mp4") || p.media_url.endsWith(".webm") || p.media_url.includes(".mp4?")) ? p.media_url : "");
            const playableUrl = getFullMediaUrl(rawPlayable);

            const isCopied = copiedId === p.id;
            const isSelected = selectedIds.includes(p.id);

            return (
              <div
                key={p.id}
                className={`prompt-card-masonry ${isSelected ? "is-selected" : ""}`}
                onClick={() => setDetailPrompt(p)}
              >
                {/* Checkbox chọn 1 / chọn nhiều */}
                <div
                  className={`prompt-card-checkbox ${isSelected ? "is-selected" : ""} ${selectedIds.length > 0 ? "selection-active" : ""}`}
                  onClick={(e) => handleToggleSelect(p.id, e)}
                  title={isSelected ? "Bỏ chọn prompt này" : "Chọn prompt này"}
                >
                  {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                </div>

                {/* 1. Natural Aspect Ratio Media */}
                {isVideo ? (
                  <VideoCardMedia
                    prompt={p}
                    isVideoTab={isVideoTab}
                    thumbUrl={thumbUrl}
                    playableUrl={playableUrl}
                  />
                ) : (thumbUrl || p.media_url) ? (
                  <div style={{ width: "100%", overflow: "hidden" }}>
                    <img
                      src={thumbUrl || p.media_url}
                      alt={p.title || "Prompt Visual"}
                      className="prompt-card-media"
                      loading="lazy"
                      onError={(e) => {
                        if (p.drive_file_id && !e.target.src.includes("googleusercontent.com")) {
                          e.target.src = `https://lh3.googleusercontent.com/d/${p.drive_file_id}`;
                        } else if (p.thumbnail_url && e.target.src !== p.thumbnail_url) {
                          e.target.src = p.thumbnail_url;
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "180px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255, 255, 255, 0.03)",
                      color: "var(--text-muted, #64748b)"
                    }}
                  >
                    <Sparkles size={28} opacity={0.3} />
                  </div>
                )}

                {/* 2. Hover Overlay (Hiển thị thông tin & chức năng khi rê chuột) */}
                <div className="prompt-card-overlay">
                  {/* Top: Badges + Action Icons */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "6px"
                    }}
                  >
                    {/* Left Badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginLeft: "26px" }}>
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: "5px",
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#fff",
                          background: isVideo
                            ? "linear-gradient(135deg, #ec4899, #f43f5e)"
                            : "linear-gradient(135deg, #8b5cf6, #6366f1)",
                          textTransform: "uppercase",
                          boxShadow: "0 2px 5px rgba(0,0,0,0.4)"
                        }}
                      >
                        {isVideo ? "Video" : "Ảnh"}
                      </span>

                      {isVideo && (() => {
                        const arMatch = parseAspectRatio(p.parameters || "") || parseAspectRatio(p.prompt || "");
                        const arInfo = arMatch ? getAspectRatioInfo(arMatch.width, arMatch.height) : null;
                        if (arInfo) {
                          return (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: "5px",
                                fontSize: "9px",
                                fontWeight: 700,
                                color: arInfo.orientation === "portrait" ? "#f472b6" : arInfo.orientation === "landscape" ? "#818cf8" : "#34d399",
                                background: "rgba(0, 0, 0, 0.75)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                backdropFilter: "blur(4px)"
                              }}
                            >
                              📐 {arInfo.badge.split(" ")[0]}
                            </span>
                          );
                        }
                        return null;
                      })()}

                      {p.ai_model && (
                        <span
                          style={{
                            padding: "2px 7px",
                            borderRadius: "5px",
                            fontSize: "9px",
                            fontWeight: 600,
                            background: "rgba(0, 0, 0, 0.75)",
                            color: "#c4b5fd",
                            backdropFilter: "blur(4px)",
                            border: "1px solid rgba(255, 255, 255, 0.15)"
                          }}
                        >
                          #{p.ai_model}
                        </span>
                      )}

                      {Boolean(p.drive_synced) && (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "5px",
                            fontSize: "9px",
                            fontWeight: 600,
                            background: "rgba(16, 185, 129, 0.25)",
                            color: "#34d399",
                            backdropFilter: "blur(4px)",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px"
                          }}
                          title="Đã đồng bộ lên Google Drive"
                        >
                          <Cloud size={10} />
                          <span>Drive</span>
                        </span>
                      )}
                    </div>

                    {/* Right Action Icons: Favorite, Edit, Delete */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(p.id, e)}
                        style={{
                          width: "25px",
                          height: "25px",
                          borderRadius: "6px",
                          background: p.is_favorite
                            ? "rgba(244, 63, 94, 0.9)"
                            : "rgba(0, 0, 0, 0.65)",
                          backdropFilter: "blur(4px)",
                          border: "none",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "transform 0.15s ease"
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                        onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        title={p.is_favorite ? "Bỏ yêu thích" : "Yêu thích"}
                      >
                        <Heart size={12} fill={p.is_favorite ? "#fff" : "none"} />
                      </button>

                      {/* Quick Export to PC Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExportTargetIds([p.id]);
                          setIsExportModalOpen(true);
                        }}
                        style={{
                          width: "25px",
                          height: "25px",
                          borderRadius: "6px",
                          background: "rgba(16, 185, 129, 0.25)",
                          backdropFilter: "blur(4px)",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          color: "#34d399",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "transform 0.15s ease"
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                        onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        title="Tải về máy tính"
                      >
                        <FolderDown size={12} />
                      </button>

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={(e) => handleStartEdit(p, e)}
                        style={{
                          width: "25px",
                          height: "25px",
                          borderRadius: "6px",
                          background: "rgba(0, 0, 0, 0.65)",
                          backdropFilter: "blur(4px)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "transform 0.15s ease"
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                        onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        title="Chỉnh sửa"
                      >
                        <Edit3 size={12} />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => handleDeletePrompt(p.id, e)}
                        style={{
                          width: "25px",
                          height: "25px",
                          borderRadius: "6px",
                          background: "rgba(244, 63, 94, 0.25)",
                          backdropFilter: "blur(4px)",
                          border: "1px solid rgba(244, 63, 94, 0.4)",
                          color: "#f43f5e",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "transform 0.15s ease"
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                        onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        title="Xóa prompt"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Bottom: Prompt text & 1-Click Copy Button */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div
                      style={{
                        fontSize: "10.5px",
                        lineHeight: 1.4,
                        color: "#f1f5f9",
                        fontFamily: "var(--font-mono, monospace)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textShadow: "0 1px 3px rgba(0, 0, 0, 0.8)"
                      }}
                    >
                      {p.prompt}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleCopyPrompt(p.prompt, p.id, e)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        padding: "6px 10px",
                        borderRadius: "7px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: isCopied
                          ? "rgba(16, 185, 129, 0.95)"
                          : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "0 3px 10px rgba(99, 102, 241, 0.35)",
                        transition: "all 0.15s ease"
                      }}
                      title="Sao chép câu lệnh Prompt"
                    >
                      {isCopied ? <Check size={13} /> : <Copy size={13} />}
                      <span>{isCopied ? "Đã chép!" : "Sao chép Prompt"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3.5 Floating Batch Action Bar (Chức năng chung khi tích chọn) */}
      {selectedIds.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 999,
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: "5px",
            padding: "4px 8px",
            background: "rgba(13, 16, 27, 0.96)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            borderRadius: "30px",
            boxShadow: "0 8px 25px rgba(0, 0, 0, 0.65), 0 0 15px rgba(139, 92, 246, 0.2)",
            animation: "fadeIn 0.2s ease-out",
            whiteSpace: "nowrap",
            maxWidth: "95vw"
          }}
        >
          {/* Counter Badge */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "4px",
              paddingRight: "6px",
              paddingLeft: "3px",
              borderRight: "1px solid rgba(255, 255, 255, 0.12)",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
          >
            <span
              style={{
                minWidth: "16px",
                height: "16px",
                borderRadius: "8px",
                background: "#8b5cf6",
                color: "#fff",
                fontSize: "9px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
                lineHeight: 1
              }}
            >
              {selectedIds.length}
            </span>
            <span style={{ fontSize: "9.5px", fontWeight: 600, color: "#f8fafc", whiteSpace: "nowrap", lineHeight: 1 }}>
              Đã chọn
            </span>
          </div>

          {/* 1. Sao chép tất cả Prompt */}
          <button
            type="button"
            onClick={handleBatchCopy}
            style={{
              display: "inline-flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "14px",
              fontSize: "9.5px",
              fontWeight: 600,
              lineHeight: 1,
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#fff",
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
            title="Sao chép toàn bộ câu lệnh của các prompt đã chọn"
          >
            <Copy size={11} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", lineHeight: 1 }}>Sao chép Prompt</span>
          </button>

          {/* 2. Yêu thích hàng loạt */}
          <button
            type="button"
            onClick={handleBatchFavorite}
            style={{
              display: "inline-flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "14px",
              fontSize: "9.5px",
              fontWeight: 600,
              lineHeight: 1,
              background: "rgba(244, 63, 94, 0.15)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              color: "#f43f5e",
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
            title="Thêm các prompt đã chọn vào danh sách Yêu thích"
          >
            <Heart size={11} fill="#f43f5e" style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", lineHeight: 1 }}>Yêu thích</span>
          </button>

          {/* 2.5 Lưu lên Google Drive */}
          <button
            type="button"
            onClick={handleBatchSyncDrive}
            disabled={syncingDrive}
            style={{
              display: "inline-flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "14px",
              fontSize: "9.5px",
              fontWeight: 600,
              lineHeight: 1,
              background: "rgba(59, 130, 246, 0.18)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              color: "#60a5fa",
              cursor: syncingDrive ? "wait" : "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
            title="Đồng bộ ảnh/video và câu lệnh của các prompt đã chọn lên Google Drive (Apps Script / Cloud)"
          >
            <Cloud size={11} className={syncingDrive ? "spinning" : ""} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", lineHeight: 1 }}>{syncingDrive ? "Đang lưu..." : "Lưu lên Drive"}</span>
          </button>

          {/* 2.6 Lưu vào Máy Tính (Tải về thư mục máy) */}
          <button
            type="button"
            onClick={() => {
              setExportTargetIds(selectedIds);
              setIsExportModalOpen(true);
            }}
            style={{
              display: "inline-flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "14px",
              fontSize: "9.5px",
              fontWeight: 600,
              lineHeight: 1,
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))",
              border: "1px solid rgba(16, 185, 129, 0.45)",
              color: "#34d399",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.15)",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
            title="Lưu ảnh/video và câu lệnh Prompt về thư mục bất kỳ trên máy tính"
          >
            <FolderDown size={11} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", lineHeight: 1 }}>Lưu Vào Máy Tính...</span>
          </button>

          {/* 3. Xóa đã chọn */}
          <button
            type="button"
            onClick={handleBatchDelete}
            style={{
              display: "inline-flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "14px",
              fontSize: "9.5px",
              fontWeight: 600,
              lineHeight: 1,
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#ef4444",
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
            title="Xóa tất cả các prompt đã chọn"
          >
            <Trash2 size={11} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", lineHeight: 1 }}>Xóa ({selectedIds.length})</span>
          </button>

          {/* 4. Bỏ chọn tất cả */}
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.1)",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              transition: "all 0.15s",
              flexShrink: 0
            }}
            title="Bỏ chọn tất cả"
          >
            <X size={10} />
          </button>
        </div>
      )}



      {/* 4. Prompt Detail Modal */}
      <PromptDetailModal
        prompt={detailPrompt}
        isOpen={Boolean(detailPrompt)}
        onClose={() => setDetailPrompt(null)}
        onEdit={(p) => handleStartEdit(p)}
        onDelete={(id) => handleDeletePrompt(id)}
        onToggleFavorite={(id) => handleToggleFavorite(id)}
        onExportSinglePrompt={(id) => {
          setExportTargetIds([id]);
          setIsExportModalOpen(true);
        }}
      />

      {/* 4.5 Export Prompt to Computer Folder Modal */}
      <ExportPromptModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        promptIds={exportTargetIds}
      />

      {/* 5. Create / Edit Prompt Modal */}
      {isCreateModalOpen && (
        <PromptCreateModal
          isOpen={isCreateModalOpen}
          editingPrompt={editingPrompt}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingPrompt(null);
          }}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            setEditingPrompt(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal Thêm / Chỉnh Sửa Prompt
 * Hỗ trợ:
 * - Upload file từ máy tính (nhiều ảnh/video, kéo thả)
 * - Dán URL ảnh/video trực tiếp
 * - Nhập câu lệnh Prompt, Tiêu đề, Mô hình AI, Negative prompt, Parameters, Tags
 */
function PromptCreateModal({ isOpen, editingPrompt, onClose, onSuccess }) {
  const isEditing = Boolean(editingPrompt);

  // Source mode: "upload" | "url"
  const [sourceMode, setSourceMode] = useState(isEditing && editingPrompt.media_url?.startsWith("http") ? "url" : "upload");

  // Form states - strictly 3 fields: Media (Upload/URL), Prompt, AI Model
  const [promptText, setPromptText] = useState(editingPrompt?.prompt || "");
  const [aiModel, setAiModel] = useState(editingPrompt?.ai_model || "Tất cả");
  const [mediaUrlInput, setMediaUrlInput] = useState(editingPrompt?.media_url || "");
  const [mediaType, setMediaType] = useState(editingPrompt?.media_type || "image");

  // Auto-detected dimensions: { width: number, height: number, ratioStr: string }
  const [mediaDimensions, setMediaDimensions] = useState(null);

  // Calculate friendly ratio string (9:16, 16:9, 1:1, 4:5, etc.)
  const getAspectRatioStr = (w, h) => {
    if (!w || !h) return "";
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(w, h);
    const rw = Math.round(w / divisor);
    const rh = Math.round(h / divisor);

    const ratio = w / h;
    if (Math.abs(ratio - 9 / 16) < 0.05) return "9:16";
    if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
    if (Math.abs(ratio - 1) < 0.05) return "1:1";
    if (Math.abs(ratio - 4 / 5) < 0.05) return "4:5";
    if (Math.abs(ratio - 5 / 4) < 0.05) return "5:4";
    if (Math.abs(ratio - 3 / 4) < 0.05) return "3:4";
    if (Math.abs(ratio - 4 / 3) < 0.05) return "4:3";
    if (Math.abs(ratio - 2 / 3) < 0.05) return "2:3";
    if (Math.abs(ratio - 3 / 2) < 0.05) return "3:2";

    if (rw <= 20 && rh <= 20) {
      return `${rw}:${rh}`;
    }
    return `${ratio.toFixed(2)}:1`;
  };

  const handleMediaDimensions = (w, h) => {
    if (!w || !h) return;
    const ratioStr = getAspectRatioStr(w, h);
    setMediaDimensions({
      width: w,
      height: h,
      ratioStr: ratioStr
    });
  };

  // Uploaded files
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState(editingPrompt?.media_url || "");
  const [localPath, setLocalPath] = useState(editingPrompt?.local_path || "");

  // URL Extraction States (YouTube, TikTok, Douyin, Instagram, X/Twitter, Google Drive)
  const [isExtractingUrl, setIsExtractingUrl] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extractedPlatform, setExtractedPlatform] = useState(null);
  const [extractedPromptText, setExtractedPromptText] = useState("");
  const [downloadToVault, setDownloadToVault] = useState(true);

  // Detect supported platforms
  const getPlatformInfo = (url) => {
    if (!url) return null;
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) return { name: "YouTube", tag: "4K & Shorts", color: "#ef4444" };
    if (u.includes("tiktok.com")) return { name: "TikTok", tag: "No Watermark", color: "#06b6d4" };
    if (u.includes("douyin.com")) return { name: "Douyin (抖音)", tag: "1080p Source", color: "#f43f5e" };
    if (u.includes("instagram.com")) return { name: "Instagram", tag: "Reels & Post", color: "#ec4899" };
    if (u.includes("x.com") || u.includes("twitter.com")) return { name: "X / Twitter", tag: "Full HD", color: "#38bdf8" };
    if (u.includes("drive.google.com")) return { name: "Google Drive", tag: "Folder Sync", color: "#10b981" };
    return null;
  };

  const handleExtractMedia = async (targetUrl = mediaUrlInput) => {
    const clean = (targetUrl || "").trim();
    if (!clean) return;
    setIsExtractingUrl(true);
    setExtractError(null);
    try {
      const res = await extractPromptMediaFromUrl(clean, downloadToVault);
      if (res && res.media_url) {
        setUploadedPreviewUrl(res.media_url);
        setMediaType(res.media_type || "video");
        setLocalPath(res.local_path || "");
        setExtractedPlatform(res.platform);

        if (res.width && res.height) {
          handleMediaDimensions(res.width, res.height);
        } else if (res.ratioStr) {
          setMediaDimensions({
            width: res.width || 1080,
            height: res.height || 1920,
            ratioStr: res.ratioStr
          });
        }

        if (res.prompt_text) {
          setExtractedPromptText(res.prompt_text);
          if (!promptText.trim()) {
            setPromptText(res.prompt_text);
          }
        }
      }
    } catch (err) {
      setExtractError(err.message || "Lỗi khi trích xuất video từ URL. Hãy kiểm tra lại liên kết.");
    } finally {
      setIsExtractingUrl(false);
    }
  };

  const fileInputRef = useRef(null);

  // Handle local files selection
  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setSelectedFiles(fileList);

    // Auto detect aspect ratio immediately from local file
    const firstFile = fileList[0];
    const isVideo = firstFile.type.startsWith("video/");
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = URL.createObjectURL(firstFile);
      v.onloadedmetadata = () => {
        handleMediaDimensions(v.videoWidth, v.videoHeight);
        URL.revokeObjectURL(v.src);
      };
    } else {
      const img = new Image();
      img.src = URL.createObjectURL(firstFile);
      img.onload = () => {
        handleMediaDimensions(img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(img.src);
      };
    }

    // Auto upload immediately
    setUploading(true);
    try {
      const res = await uploadPromptMedia(fileList);
      if (res.files && res.files.length > 0) {
        const first = res.files[0];
        setUploadedPreviewUrl(first.media_url);
        setLocalPath(first.local_path);
        setMediaType(first.media_type);
      }
    } catch (err) {
      alert("Lỗi khi tải file lên: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUrlChange = (val) => {
    setMediaUrlInput(val);
    setExtractError(null);
    if (!val) {
      setMediaDimensions(null);
      setExtractedPlatform(null);
      setExtractedPromptText("");
      return;
    }
    const plat = getPlatformInfo(val);
    if (plat) {
      setExtractedPlatform(plat.name.toLowerCase());
    } else if (val.startsWith("http") || val.startsWith("data:")) {
      const lower = val.toLowerCase();
      const isVid = lower.includes(".mp4") || lower.includes(".webm") || lower.includes(".mov") || lower.includes(".mkv");
      if (isVid) {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.src = val;
        v.onloadedmetadata = () => {
          handleMediaDimensions(v.videoWidth, v.videoHeight);
        };
      } else {
        const img = new Image();
        img.src = val;
        img.onload = () => {
          handleMediaDimensions(img.naturalWidth, img.naturalHeight);
        };
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!promptText.trim()) {
      alert("Vui lòng nhập câu lệnh Prompt!");
      return;
    }

    const finalMediaUrl = sourceMode === "upload" 
      ? uploadedPreviewUrl 
      : (uploadedPreviewUrl || mediaUrlInput.trim());

    // Auto detect media type for URL mode if not specified
    let finalMediaType = mediaType;
    if (sourceMode === "url" && !uploadedPreviewUrl && mediaUrlInput) {
      const lower = mediaUrlInput.toLowerCase();
      if (lower.includes(".mp4") || lower.includes(".webm") || lower.includes(".mov") || lower.includes(".mkv")) {
        finalMediaType = "video";
      } else {
        finalMediaType = "image";
      }
    }

    const autoTitle = promptText.trim().length > 60
      ? promptText.trim().slice(0, 60) + "..."
      : promptText.trim();

    const payload = {
      title: editingPrompt?.title || autoTitle,
      prompt: promptText.trim(),
      negative_prompt: "",
      media_type: finalMediaType,
      media_url: finalMediaUrl,
      local_path: localPath,
      thumbnail_url: finalMediaUrl,
      ai_model: aiModel,
      category: "general",
      tags: [],
      parameters: mediaDimensions?.ratioStr ? `--ar ${mediaDimensions.ratioStr}` : ""
    };

    try {
      if (isEditing) {
        await updatePrompt(editingPrompt.id, payload);
      } else {
        await createPrompt(payload);
      }
      onSuccess();
    } catch (err) {
      alert("Lỗi khi lưu prompt: " + err.message);
    }
  };

  const currentMediaUrl = sourceMode === "upload" ? uploadedPreviewUrl : mediaUrlInput.trim();

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
        padding: "16px",
        animation: "fadeIn 0.2s ease-out"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .prompt-create-split-form {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: "880px",
          maxHeight: "92vh",
          backgroundColor: "var(--bg-surface, #10121d)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff"
              }}
            >
              <Sparkles size={15} />
            </div>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#fff" }}>
                {isEditing ? "Chỉnh Sửa Prompt" : "Thêm Prompt Mới Vào Kho"}
              </h3>
              <span style={{ fontSize: "11px", color: "var(--text-secondary, #94a3b8)" }}>
                Nhập câu lệnh prompt và đính kèm ảnh hoặc video minh họa
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "var(--text-secondary, #94a3b8)",
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer"
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Modal Body Form: 2-Column Split Layout */}
        <form
          onSubmit={handleSave}
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "1fr 1.15fr",
            gap: "18px",
            alignItems: "start"
          }}
          className="prompt-create-split-form"
        >
          {/* CỘT TRÁI: Ảnh / Video Minh Họa */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "12px"
            }}
          >
            {/* Top Bar: Title & Source Mode Toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px"
              }}
            >
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}
              >
                <FolderOpen size={14} color="#8b5cf6" />
                Ảnh / Video Minh Họa
              </label>

              {/* Mode Toggle Pills */}
              <div
                style={{
                  display: "flex",
                  background: "rgba(0, 0, 0, 0.4)",
                  padding: "2px",
                  borderRadius: "7px",
                  gap: "3px"
                }}
              >
                <button
                  type="button"
                  onClick={() => setSourceMode("upload")}
                  style={{
                    padding: "3px 9px",
                    borderRadius: "5px",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: sourceMode === "upload" ? "#8b5cf6" : "transparent",
                    color: sourceMode === "upload" ? "#fff" : "var(--text-muted, #64748b)"
                  }}
                >
                  Tải lên
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("url")}
                  style={{
                    padding: "3px 9px",
                    borderRadius: "5px",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: sourceMode === "url" ? "#8b5cf6" : "transparent",
                    color: sourceMode === "url" ? "#fff" : "var(--text-muted, #64748b)"
                  }}
                >
                  URL Web
                </button>
              </div>
            </div>

            {/* Exact Detected Dimensions Badge */}
            {mediaDimensions && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(139, 92, 246, 0.12)",
                  border: "1px solid rgba(139, 92, 246, 0.28)",
                  fontSize: "11px",
                  color: "#c4b5fd"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>⚡ Kích thước:</span>
                  <strong style={{ color: "#fff" }}>{mediaDimensions.width} × {mediaDimensions.height} px</strong>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ color: "var(--text-secondary, #94a3b8)" }}>Tỉ lệ:</span>
                  <span
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      color: "#fff",
                      padding: "1px 7px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      fontSize: "11px"
                    }}
                  >
                    {mediaDimensions.ratioStr}
                  </span>
                </div>
              </div>
            )}

            {/* Mode 1: Upload from Computer/Folder */}
            {sourceMode === "upload" ? (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*,video/*"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileSelect(e.target.files)}
                />

                {uploadedPreviewUrl ? (
                  /* Media Preview with Exact Aspect Ratio */
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        maxHeight: "340px",
                        aspectRatio: mediaDimensions ? `${mediaDimensions.width} / ${mediaDimensions.height}` : "auto",
                        margin: "0 auto",
                        backgroundColor: "#05060a",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {mediaType === "video" ? (
                        <video
                          src={uploadedPreviewUrl}
                          controls
                          autoPlay
                          loop
                          muted
                          onLoadedMetadata={(e) => {
                            handleMediaDimensions(e.target.videoWidth, e.target.videoHeight);
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain"
                          }}
                        />
                      ) : (
                        <img
                          src={uploadedPreviewUrl}
                          alt="Preview"
                          onLoad={(e) => {
                            handleMediaDimensions(e.target.naturalWidth, e.target.naturalHeight);
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain"
                          }}
                        />
                      )}

                      {/* Badge exact dimensions */}
                      <span
                        style={{
                          position: "absolute",
                          top: "6px",
                          left: "6px",
                          padding: "3px 8px",
                          borderRadius: "5px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: "rgba(0, 0, 0, 0.8)",
                          backdropFilter: "blur(4px)",
                          color: "#fff",
                          border: "1px solid rgba(255, 255, 255, 0.15)"
                        }}
                      >
                        {mediaDimensions ? `${mediaDimensions.width} × ${mediaDimensions.height} (${mediaDimensions.ratioStr})` : mediaType === "video" ? "Video" : "Ảnh"}
                      </span>
                    </div>

                    {/* Change / Clear actions */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 8px",
                        background: "rgba(0, 0, 0, 0.35)",
                        borderRadius: "8px",
                        fontSize: "11px"
                      }}
                    >
                      <span
                        style={{
                          color: "var(--text-secondary, #94a3b8)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "160px"
                        }}
                      >
                        {uploadedPreviewUrl.split("/").pop()}
                      </span>

                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "5px",
                            fontSize: "10.5px",
                            background: "rgba(255, 255, 255, 0.08)",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer"
                          }}
                        >
                          Đổi file
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedPreviewUrl("");
                            setLocalPath("");
                            setMediaDimensions(null);
                          }}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "5px",
                            fontSize: "10.5px",
                            background: "rgba(244, 63, 94, 0.15)",
                            color: "#f43f5e",
                            border: "none",
                            cursor: "pointer"
                          }}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Dropzone when empty */
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleFileSelect(e.dataTransfer.files);
                    }}
                    style={{
                      border: "2px dashed rgba(139, 92, 246, 0.35)",
                      borderRadius: "10px",
                      padding: "28px 14px",
                      minHeight: "190px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      cursor: "pointer",
                      backgroundColor: "rgba(139, 92, 246, 0.04)",
                      transition: "all 0.2s"
                    }}
                  >
                    <Upload size={28} color="#8b5cf6" />
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>
                        {uploading
                          ? "Đang tải file lên..."
                          : "Bấm để chọn file hoặc kéo thả vào đây"}
                      </span>
                      <p style={{ fontSize: "10px", color: "var(--text-muted, #64748b)", margin: "3px 0 0" }}>
                        Tự động nhận diện chính xác kích thước & tỉ lệ ảnh/video
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Mode 2: Paste URL & Auto Extract Video */
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Supported Platform Badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {[
                    { name: "YouTube", tag: "4K & Shorts", color: "#ef4444" },
                    { name: "TikTok", tag: "No Watermark", color: "#06b6d4" },
                    { name: "Douyin", tag: "1080p Source", color: "#f43f5e" },
                    { name: "Instagram", tag: "Reels & Post", color: "#ec4899" },
                    { name: "X / Twitter", tag: "Full HD", color: "#38bdf8" },
                    { name: "Google Drive", tag: "Folder Sync", color: "#10b981" }
                  ].map((p) => (
                    <span
                      key={p.name}
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: p.color
                      }}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <LinkIcon
                      size={13}
                      style={{
                        position: "absolute",
                        left: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted, #64748b)"
                      }}
                    />
                    <input
                      type="url"
                      placeholder="Dán link video từ X, TikTok, Douyin, YouTube, Instagram, Drive..."
                      value={mediaUrlInput}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleExtractMedia();
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 10px 8px 30px",
                        backgroundColor: "var(--bg-input, rgba(14, 16, 26, 0.85))",
                        border: "1px solid var(--border-color, rgba(255, 255, 255, 0.12))",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "11.5px",
                        outline: "none"
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExtractMedia()}
                    disabled={isExtractingUrl || !mediaUrlInput.trim()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "0 12px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      border: "none",
                      color: "#fff",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: isExtractingUrl || !mediaUrlInput.trim() ? "not-allowed" : "pointer",
                      opacity: isExtractingUrl || !mediaUrlInput.trim() ? 0.6 : 1,
                      whiteSpace: "nowrap",
                      boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)"
                    }}
                  >
                    {isExtractingUrl ? (
                      <>
                        <RefreshCw size={12} className="spinning" />
                        <span>Đang lấy...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={12} />
                        <span>Lấy Video</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Error Banner */}
                {extractError && (
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      background: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      color: "#f87171",
                      fontSize: "11px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    <Info size={13} style={{ flexShrink: 0 }} />
                    <span>{extractError}</span>
                  </div>
                )}

                {/* Extracted Media Preview (Video or Image) */}
                {(uploadedPreviewUrl || (mediaUrlInput && !getPlatformInfo(mediaUrlInput))) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        maxHeight: "340px",
                        aspectRatio: mediaDimensions ? `${mediaDimensions.width} / ${mediaDimensions.height}` : "auto",
                        margin: "0 auto",
                        backgroundColor: "#05060a",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {mediaType === "video" ? (
                        <video
                          src={getFullMediaUrl(uploadedPreviewUrl || mediaUrlInput)}
                          controls
                          autoPlay
                          loop
                          muted
                          playsInline
                          onLoadedMetadata={(e) => {
                            if (e.target.videoWidth && e.target.videoHeight) {
                              handleMediaDimensions(e.target.videoWidth, e.target.videoHeight);
                            }
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain"
                          }}
                        />
                      ) : (
                        <img
                          src={getFullMediaUrl(uploadedPreviewUrl || mediaUrlInput)}
                          alt="Preview"
                          onLoad={(e) => {
                            handleMediaDimensions(e.target.naturalWidth, e.target.naturalHeight);
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain"
                          }}
                        />
                      )}

                      {/* Badge Platform & Dimensions */}
                      <div
                        style={{
                          position: "absolute",
                          top: "6px",
                          left: "6px",
                          display: "flex",
                          gap: "4px"
                        }}
                      >
                        {extractedPlatform && (
                          <span
                            style={{
                              padding: "3px 7px",
                              borderRadius: "5px",
                              fontSize: "10px",
                              fontWeight: 700,
                              background: "rgba(99, 102, 241, 0.85)",
                              color: "#fff",
                              backdropFilter: "blur(4px)"
                            }}
                          >
                            {extractedPlatform.toUpperCase()}
                          </span>
                        )}
                        <span
                          style={{
                            padding: "3px 7px",
                            borderRadius: "5px",
                            fontSize: "10px",
                            fontWeight: 700,
                            background: "rgba(0, 0, 0, 0.8)",
                            backdropFilter: "blur(4px)",
                            color: "#fff",
                            border: "1px solid rgba(255, 255, 255, 0.15)"
                          }}
                        >
                          {mediaDimensions ? `${mediaDimensions.width} × ${mediaDimensions.height} (${mediaDimensions.ratioStr})` : mediaType === "video" ? "Video" : "Ảnh"}
                        </span>
                      </div>
                    </div>

                    {/* Auto-fill Prompt Suggestion Chip */}
                    {extractedPromptText && promptText !== extractedPromptText && (
                      <button
                        type="button"
                        onClick={() => setPromptText(extractedPromptText)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 10px",
                          borderRadius: "7px",
                          background: "rgba(139, 92, 246, 0.15)",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                          color: "#c4b5fd",
                          fontSize: "11px",
                          cursor: "pointer",
                          textAlign: "left"
                        }}
                        title="Sao chép nội dung bài viết vào ô Câu Lệnh Prompt"
                      >
                        <Sparkles size={13} color="#a78bfa" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          ✨ <strong>Dùng nội dung bài viết làm Prompt:</strong> "{extractedPromptText.slice(0, 50)}..."
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CỘT PHẢI: Câu Lệnh Prompt, Mô hình AI & Nút Lưu */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              height: "100%",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Section 2: Prompt Command (Required) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px"
                  }}
                >
                  <Sparkles size={13} color="#8b5cf6" />
                  Câu Lệnh Prompt <span style={{ color: "#f43f5e" }}>*</span>
                </label>
                <textarea
                  rows={8}
                  required
                  placeholder="Nhập câu lệnh prompt đầy đủ (VD: Cinematic portrait of a cyberpunk girl, neon lighting, 8k, photorealistic, intricate details...)"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: "170px",
                    padding: "10px 12px",
                    backgroundColor: "var(--bg-input, rgba(14, 16, 26, 0.85))",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono, monospace)",
                    lineHeight: 1.55,
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              </div>

              {/* Section 3: AI Model */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary, #94a3b8)" }}>
                  Mô hình AI
                </label>
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    backgroundColor: "var(--bg-input, rgba(14, 16, 26, 0.85))",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                    outline: "none"
                  }}
                >
                  {POPULAR_AI_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m === "Tất cả" ? "Tất cả (Chưa rõ model)" : m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                paddingTop: "12px"
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "var(--text-secondary, #94a3b8)",
                  cursor: "pointer"
                }}
              >
                Hủy
              </button>

              <button
                type="submit"
                disabled={uploading}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                  border: "none",
                  cursor: uploading ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Sparkles size={13} />
                <span>{isEditing ? "Cập Nhật Prompt" : "Lưu Prompt Vào Kho"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
