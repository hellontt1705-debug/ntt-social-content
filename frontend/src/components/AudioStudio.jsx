import React, { useState, useEffect, useRef } from "react";
import { Icon } from "./Icons";
import { useLanguage } from "../i18n";
import {
  extractAudio,
  extractAudioUpload,
  adjustVolume,
  adjustVolumeUpload,
  fetchAudioHistory,
  getAudioDownloadUrl,
  getAudioStreamUrl,
  MEDIA_BASE
} from "../api";

export default function AudioStudio({
  videos = [],
  categories = [],
  initialVideo = null,
  onSaveSuccess,
  onBackToVault
}) {
  const { t } = useLanguage();

  // Active view mode: "overview" | "extract" | "volume" | "history"
  const [activeTab, setActiveTab] = useState("overview");

  // Media source mode: "vault" | "upload" | "url"
  const [sourceMode, setSourceMode] = useState("vault");
  const [selectedVaultVideo, setSelectedVaultVideo] = useState(initialVideo);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [onlineUrl, setOnlineUrl] = useState("");
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");

  // Extractor options
  const [extractFormat, setExtractFormat] = useState("mp3");
  const [extractBitrate, setExtractBitrate] = useState("320k");
  const [extractTitle, setExtractTitle] = useState("");
  const [extractSaveVault, setExtractSaveVault] = useState(true);
  const [extractCategory, setExtractCategory] = useState("all");

  // Volume boost options
  const [volumePercent, setVolumePercent] = useState(200);
  const [volumeOutputType, setVolumeOutputType] = useState("video");
  const [enableLimiter, setEnableLimiter] = useState(true);
  const [volumeTitle, setVolumeTitle] = useState("");
  const [volumeSaveVault, setVolumeSaveVault] = useState(true);
  const [volumeCategory, setVolumeCategory] = useState("all");

  // Execution states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [extractResult, setExtractResult] = useState(null);
  const [volumeResult, setVolumeResult] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fileInputRef = useRef(null);

  // If initialVideo is passed, auto-select it and jump to overview or extract
  useEffect(() => {
    if (initialVideo) {
      setSelectedVaultVideo(initialVideo);
      setSourceMode("vault");
    }
  }, [initialVideo]);

  // Load history when tab is clicked
  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const data = await fetchAudioHistory();
      setHistoryItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDuration = (secs) => {
    if (!secs) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
      setErrorMessage("");
    }
  };

  // --- EXECUTE EXTRACT ---
  const handleExtractAudio = async () => {
    setErrorMessage("");
    setExtractResult(null);

    try {
      setIsProcessing(true);
      setProgressMsg("Đang chuẩn bị và phân tích luồng âm thanh...");

      let result;
      if (sourceMode === "upload") {
        if (!uploadedFile) {
          throw new Error("Vui lòng chọn một file video từ máy tính của bạn");
        }
        setProgressMsg(`Đang tải file ${uploadedFile.name} lên và xử lý trích xuất ${extractFormat.toUpperCase()} ${extractBitrate}...`);
        const formData = new FormData();
        formData.append("file", uploadedFile);
        formData.append("format", extractFormat);
        formData.append("bitrate", extractBitrate);
        formData.append("save_to_vault", extractSaveVault);
        formData.append("custom_title", extractTitle || uploadedFile.name);
        formData.append("category_id", extractCategory);
        result = await extractAudioUpload(formData);
      } else if (sourceMode === "vault") {
        if (!selectedVaultVideo) {
          throw new Error("Vui lòng chọn 1 video từ Kho Video (Vault)");
        }
        setProgressMsg(`Đang trích xuất âm thanh từ "${selectedVaultVideo.title}"...`);
        result = await extractAudio({
          video_id: selectedVaultVideo.id,
          format: extractFormat,
          bitrate: extractBitrate,
          save_to_vault: extractSaveVault,
          custom_title: extractTitle || selectedVaultVideo.title,
          category_id: extractCategory
        });
      } else {
        if (!onlineUrl.trim()) {
          throw new Error("Vui lòng nhập liên kết video hợp lệ");
        }
        setProgressMsg("Đang tải nguồn và tách âm thanh trực tuyến...");
        result = await extractAudio({
          url: onlineUrl.trim(),
          format: extractFormat,
          bitrate: extractBitrate,
          save_to_vault: extractSaveVault,
          custom_title: extractTitle,
          category_id: extractCategory
        });
      }

      setExtractResult(result);
      if (extractSaveVault && onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (err) {
      setErrorMessage(err.message || "Đã xảy ra lỗi khi trích xuất âm thanh");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  // --- EXECUTE VOLUME ADJUSTMENT ---
  const handleAdjustVolume = async () => {
    setErrorMessage("");
    setVolumeResult(null);

    try {
      setIsProcessing(true);
      setProgressMsg(`Đang xử lý khuếch đại âm lượng lên ${volumePercent}% (Anti-Distortion: ${enableLimiter ? "Bật" : "Tắt"})...`);

      let result;
      if (sourceMode === "upload") {
        if (!uploadedFile) {
          throw new Error("Vui lòng chọn một file video hoặc âm thanh từ máy tính");
        }
        const formData = new FormData();
        formData.append("file", uploadedFile);
        formData.append("volume_percent", volumePercent);
        formData.append("output_type", volumeOutputType);
        formData.append("enable_limiter", enableLimiter);
        formData.append("save_to_vault", volumeSaveVault);
        formData.append("custom_title", volumeTitle || uploadedFile.name);
        formData.append("category_id", volumeCategory);
        result = await adjustVolumeUpload(formData);
      } else if (sourceMode === "vault") {
        if (!selectedVaultVideo) {
          throw new Error("Vui lòng chọn 1 video từ Kho Video (Vault)");
        }
        result = await adjustVolume({
          video_id: selectedVaultVideo.id,
          volume_percent: volumePercent,
          output_type: volumeOutputType,
          enable_limiter: enableLimiter,
          save_to_vault: volumeSaveVault,
          custom_title: volumeTitle || selectedVaultVideo.title,
          category_id: volumeCategory
        });
      } else {
        if (!onlineUrl.trim()) {
          throw new Error("Vui lòng nhập liên kết video hợp lệ");
        }
        result = await adjustVolume({
          url: onlineUrl.trim(),
          volume_percent: volumePercent,
          output_type: volumeOutputType,
          enable_limiter: enableLimiter,
          save_to_vault: volumeSaveVault,
          custom_title: volumeTitle,
          category_id: volumeCategory
        });
      }

      setVolumeResult(result);
      if (volumeSaveVault && onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (err) {
      setErrorMessage(err.message || "Đã xảy ra lỗi khi điều chỉnh âm lượng");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  // Filter vault videos for selection
  const filteredVaultVideos = videos.filter((v) => {
    if (!vaultSearchQuery.trim()) return true;
    const q = vaultSearchQuery.toLowerCase();
    return (
      (v.title && v.title.toLowerCase().includes(q)) ||
      (v.uploader && v.uploader.toLowerCase().includes(q))
    );
  });

  return (
    <div className="view-content" style={{ padding: "24px 32px 100px 32px", overflowY: "auto" }}>
      <div className="audio-studio-container" style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Top Header & Breadcrumbs */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(168, 85, 247, 0.35)"
            }}>
              <Icon name="music" size={20} color="#fff" />
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: "700", margin: 0, color: "var(--text-primary)" }}>
              Studio Xử Lý Âm Thanh & Video
            </h1>
            <span style={{
              background: "rgba(168, 85, 247, 0.15)",
              color: "#a855f7",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              borderRadius: "20px",
              padding: "2px 10px",
              fontSize: "12px",
              fontWeight: "600"
            }}>
              AI Audio Engine
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)" }}>
            Trích xuất nhạc MP3 chất lượng cao 320Kbps và khuếch đại âm lượng lên tới 500% BOOST chống vỡ tiếng.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-surface)", padding: "4px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
          <button
            className={`btn btn-sm ${activeTab === "overview" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("overview")}
            style={{ border: "none" }}
          >
            <Icon name="grid" size={14} />
            <span>Tổng quan</span>
          </button>
          <button
            className={`btn btn-sm ${activeTab === "extract" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("extract")}
            style={{ border: "none" }}
          >
            <Icon name="music" size={14} />
            <span>Tách Nhạc (MP3 320K)</span>
          </button>
          <button
            className={`btn btn-sm ${activeTab === "volume" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("volume")}
            style={{ border: "none" }}
          >
            <Icon name="volume" size={14} />
            <span>Tăng Âm Lượng (500% BOOST)</span>
          </button>
          <button
            className={`btn btn-sm ${activeTab === "history" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("history")}
            style={{ border: "none" }}
          >
            <Icon name="fileText" size={14} />
            <span>Lịch sử đã xử lý</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div style={{
          background: "rgba(244, 63, 94, 0.12)",
          border: "1px solid rgba(244, 63, 94, 0.3)",
          color: "#fb7185",
          padding: "12px 16px",
          borderRadius: "10px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "14px"
        }}>
          <Icon name="x" size={18} color="#fb7185" />
          <span style={{ flex: 1 }}>{errorMessage}</span>
          <button onClick={() => setErrorMessage("")} style={{ background: "none", border: "none", color: "#fb7185", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. OVERVIEW TAB: Cards matching user's exact uploaded image */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "24px",
            marginBottom: "32px"
          }}>
            {/* CARD 1: Tăng Âm Lượng Video / Nhạc (Matching User Screenshot) */}
            <div
              className="audio-feature-card"
              style={{
                background: "var(--bg-surface)",
                borderRadius: "20px",
                padding: "28px",
                border: "1px solid var(--border-color)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                transition: "all 0.25s ease",
                cursor: "pointer"
              }}
              onClick={() => setActiveTab("volume")}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#06b6d4";
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 16px 36px rgba(6, 182, 212, 0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
                {/* Speaker icon in vibrant gradient blue circle/square */}
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 20px rgba(6, 182, 212, 0.35)"
                }}>
                  <Icon name="volume" size={28} color="#ffffff" />
                </div>

                {/* Badge: 500% BOOST */}
                <span style={{
                  background: "rgba(6, 182, 212, 0.15)",
                  color: "#06b6d4",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "800",
                  letterSpacing: "0.5px"
                }}>
                  500% BOOST
                </span>
              </div>

              <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 10px 0", color: "var(--text-primary)" }}>
                Tăng Âm Lượng Video / Nhạc
              </h2>

              <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text-secondary)", margin: "0 0 24px 0", flex: 1 }}>
                Khuếch đại âm thanh video hoặc bài hát bị nhỏ lên đến 200% - 500% mà không bị rè hoặc vỡ tiếng nhờ bộ lọc thông minh Smart Limiter.
              </p>

              <div style={{
                borderTop: "1px solid var(--border-color)",
                paddingTop: "16px",
                display: "flex",
                alignItems: "center",
                color: "#06b6d4",
                fontWeight: "600",
                fontSize: "15px",
                gap: "8px"
              }}>
                <span>Mở công cụ</span>
                <Icon name="arrowRight" size={16} color="#06b6d4" />
              </div>
            </div>

            {/* CARD 2: Tách Nhạc Từ Video (Matching User Screenshot) */}
            <div
              className="audio-feature-card"
              style={{
                background: "var(--bg-surface)",
                borderRadius: "20px",
                padding: "28px",
                border: "1px solid var(--border-color)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                transition: "all 0.25s ease",
                cursor: "pointer"
              }}
              onClick={() => setActiveTab("extract")}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#a855f7";
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 16px 36px rgba(168, 85, 247, 0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
                {/* Purple rounded icon */}
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 20px rgba(168, 85, 247, 0.35)"
                }}>
                  <Icon name="music" size={28} color="#ffffff" />
                </div>

                {/* Badge: MP3 320K */}
                <span style={{
                  background: "rgba(168, 85, 247, 0.15)",
                  color: "#a855f7",
                  border: "1px solid rgba(168, 85, 247, 0.3)",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "800",
                  letterSpacing: "0.5px"
                }}>
                  MP3 320K
                </span>
              </div>

              <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 10px 0", color: "var(--text-primary)" }}>
                Tách Nhạc Từ Video
              </h2>

              <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text-secondary)", margin: "0 0 24px 0", flex: 1 }}>
                Trích xuất toàn bộ luồng âm thanh từ video sang định dạng MP3 chất lượng cao trực tiếp tại máy tính.
              </p>

              <div style={{
                borderTop: "1px solid var(--border-color)",
                paddingTop: "16px",
                display: "flex",
                alignItems: "center",
                color: "#a855f7",
                fontWeight: "600",
                fontSize: "15px",
                gap: "8px"
              }}>
                <span>Mở công cụ</span>
                <Icon name="arrowRight" size={16} color="#a855f7" />
              </div>
            </div>
          </div>

          {/* Quick Stats or Recently Processed Media in Overview */}
          <div style={{
            background: "var(--bg-surface)",
            borderRadius: "16px",
            padding: "20px 24px",
            border: "1px solid var(--border-color)"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0, color: "var(--text-primary)" }}>
                ⚡ Xử lý nhanh ngay từ Kho Video hiện tại ({videos.length} video sẵn sàng)
              </h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setActiveTab("extract");
                  setSourceMode("vault");
                }}
              >
                <span>Xem tất cả video kho</span>
                <Icon name="arrowRight" size={14} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
              {videos.slice(0, 4).map((v) => (
                <div
                  key={v.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    padding: "10px",
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    cursor: "pointer"
                  }}
                  onClick={() => {
                    setSelectedVaultVideo(v);
                    setActiveTab("extract");
                  }}
                >
                  <div style={{
                    width: "52px",
                    height: "52px",
                    borderRadius: "8px",
                    background: "#1e2238",
                    flexShrink: 0,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    {v.local_thumbnail || v.thumbnail_url ? (
                      <img
                        src={v.local_thumbnail ? `${MEDIA_BASE}/${v.local_thumbnail}` : v.thumbnail_url}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <Icon name="play" size={20} color="var(--accent-primary)" />
                    )}
                  </div>
                  <div style={{ overflow: "hidden", flex: 1 }}>
                    <div style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {v.title || "Video không tên"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {formatDuration(v.duration)} • {v.platform?.toUpperCase() || "MP4"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SHARED SOURCE SELECTOR (Vault Video, Local Upload, or Online URL) */}
      {/* ========================================================================= */}
      {(activeTab === "extract" || activeTab === "volume") && (
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-color)",
          marginBottom: "24px"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "var(--accent-primary)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "700"
              }}>1</span>
              Chọn nguồn video hoặc file nhạc cần xử lý
            </h3>

            {/* Source Mode Switcher */}
            <div style={{ display: "flex", gap: "6px", background: "var(--bg-input)", padding: "3px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <button
                className={`btn btn-sm ${sourceMode === "vault" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSourceMode("vault")}
                style={{ border: "none", padding: "6px 12px" }}
              >
                <Icon name="grid" size={13} />
                <span>Từ Kho Vault</span>
              </button>
              <button
                className={`btn btn-sm ${sourceMode === "upload" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSourceMode("upload")}
                style={{ border: "none", padding: "6px 12px" }}
              >
                <Icon name="download" size={13} />
                <span>Tải từ Máy tính</span>
              </button>
              <button
                className={`btn btn-sm ${sourceMode === "url" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSourceMode("url")}
                style={{ border: "none", padding: "6px 12px" }}
              >
                <Icon name="sparkles" size={13} />
                <span>Dán Link Video</span>
              </button>
            </div>
          </div>

          {/* Source 1: Vault selector */}
          {sourceMode === "vault" && (
            <div>
              {selectedVaultVideo ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "rgba(139, 92, 246, 0.08)",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  borderRadius: "12px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      background: "#1e2238",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      {selectedVaultVideo.local_thumbnail || selectedVaultVideo.thumbnail_url ? (
                        <img
                          src={selectedVaultVideo.local_thumbnail ? `${MEDIA_BASE}/${selectedVaultVideo.local_thumbnail}` : selectedVaultVideo.thumbnail_url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <Icon name="play" size={20} color="var(--accent-primary)" />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "14px" }}>
                        {selectedVaultVideo.title || "Video đã chọn"}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        Thời lượng: {formatDuration(selectedVaultVideo.duration)} • Tác giả: {selectedVaultVideo.uploader || "Uploader"} • Nền tảng: {selectedVaultVideo.platform?.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedVaultVideo(null)}
                  >
                    <span>Đổi video khác</span>
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: "12px" }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Tìm kiếm video trong kho theo tiêu đề hoặc tác giả..."
                      value={vaultSearchQuery}
                      onChange={(e) => setVaultSearchQuery(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div style={{
                    maxHeight: "220px",
                    overflowY: "auto",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: "10px",
                    paddingRight: "6px"
                  }}>
                    {filteredVaultVideos.length === 0 ? (
                      <div style={{ gridColumn: "1/-1", padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                        Không tìm thấy video nào phù hợp trong kho.
                      </div>
                    ) : (
                      filteredVaultVideos.map((v) => (
                        <div
                          key={v.id}
                          style={{
                            padding: "8px 12px",
                            background: "var(--bg-card)",
                            borderRadius: "10px",
                            border: "1px solid var(--border-color)",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                          onClick={() => setSelectedVaultVideo(v)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--accent-primary)";
                            e.currentTarget.style.background = "var(--bg-card-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border-color)";
                            e.currentTarget.style.background = "var(--bg-card)";
                          }}
                        >
                          <div style={{ width: "38px", height: "38px", borderRadius: "6px", background: "#1e2238", overflow: "hidden", flexShrink: 0 }}>
                            {v.local_thumbnail || v.thumbnail_url ? (
                              <img
                                src={v.local_thumbnail ? `${MEDIA_BASE}/${v.local_thumbnail}` : v.thumbnail_url}
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <Icon name="play" size={16} />
                            )}
                          </div>
                          <div style={{ overflow: "hidden", flex: 1 }}>
                            <div style={{ fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>
                              {v.title}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {formatDuration(v.duration)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source 2: Local File Upload */}
          {sourceMode === "upload" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*,.mp4,.mkv,.mov,.webm,.mp3,.wav,.m4a,.aac"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <div
                style={{
                  border: "2px dashed var(--border-color)",
                  borderRadius: "14px",
                  padding: "32px 20px",
                  textAlign: "center",
                  background: uploadedFile ? "rgba(139, 92, 246, 0.05)" : "transparent",
                  borderColor: uploadedFile ? "var(--accent-primary)" : "var(--border-color)",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = "var(--accent-primary)";
                }}
                onDragLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-color)";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setUploadedFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(139, 92, 246, 0.15)",
                  color: "var(--accent-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "12px"
                }}>
                  <Icon name="download" size={22} />
                </div>
                {uploadedFile ? (
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-primary)" }}>
                      {uploadedFile.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Dung lượng: {formatFileSize(uploadedFile.size)} • Sẵn sàng xử lý
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: "12px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadedFile(null);
                      }}
                    >
                      <span>Chọn file khác</span>
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-primary)" }}>
                      Nhấp để chọn file hoặc kéo thả file video/nhạc vào đây
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Hỗ trợ MP4, MKV, MOV, WebM, MP3, WAV, M4A, AAC (không giới hạn dung lượng)
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Source 3: Online Link */}
          {sourceMode === "url" && (
            <div>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Dán link video TikTok, Douyin, YouTube, Reels, X/Twitter..."
                  value={onlineUrl}
                  onChange={(e) => setOnlineUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
                💡 Hệ thống sẽ tự động quét và phân tách audio trực tiếp mà không cần bạn phải tải video về trước.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TOOL 1: TÁCH NHẠC TỪ VIDEO (MP3 320K) */}
      {/* ========================================================================= */}
      {activeTab === "extract" && (
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-color)",
          marginBottom: "24px"
        }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 20px 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: "#a855f7",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: "700"
            }}>2</span>
            Tùy chọn định dạng & chất lượng âm thanh đầu ra
          </h3>

          {/* Format selection cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
            marginBottom: "20px"
          }}>
            {/* MP3 320K - High Quality Master */}
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "2px solid",
                borderColor: extractFormat === "mp3" && extractBitrate === "320k" ? "#a855f7" : "var(--border-color)",
                background: extractFormat === "mp3" && extractBitrate === "320k" ? "rgba(168, 85, 247, 0.08)" : "var(--bg-card)",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
              onClick={() => {
                setExtractFormat("mp3");
                setExtractBitrate("320k");
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-primary)" }}>MP3 320 Kbps</span>
                <span style={{
                  background: "rgba(168, 85, 247, 0.2)",
                  color: "#a855f7",
                  fontSize: "10px",
                  fontWeight: "800",
                  padding: "2px 6px",
                  borderRadius: "4px"
                }}>
                  KHUYÊN DÙNG
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                Âm thanh phòng thu Studio Master cao nhất, tương thích 100% mọi thiết bị.
              </div>
            </div>

            {/* MP3 192K */}
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "2px solid",
                borderColor: extractFormat === "mp3" && extractBitrate === "192k" ? "#a855f7" : "var(--border-color)",
                background: extractFormat === "mp3" && extractBitrate === "192k" ? "rgba(168, 85, 247, 0.08)" : "var(--bg-card)",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
              onClick={() => {
                setExtractFormat("mp3");
                setExtractBitrate("192k");
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-primary)" }}>MP3 192 Kbps</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                Tiêu chuẩn phổ thông, dung lượng nhẹ hơn 40%, tốc độ tải cực nhanh.
              </div>
            </div>

            {/* M4A AAC */}
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "2px solid",
                borderColor: extractFormat === "m4a" ? "#a855f7" : "var(--border-color)",
                background: extractFormat === "m4a" ? "rgba(168, 85, 247, 0.08)" : "var(--bg-card)",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
              onClick={() => {
                setExtractFormat("m4a");
                setExtractBitrate("256k");
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-primary)" }}>M4A (AAC 256K)</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                Chuẩn mã hóa hiện đại của Apple, âm treble trong trẻo và chi tiết.
              </div>
            </div>

            {/* WAV Lossless */}
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "2px solid",
                borderColor: extractFormat === "wav" ? "#a855f7" : "var(--border-color)",
                background: extractFormat === "wav" ? "rgba(168, 85, 247, 0.08)" : "var(--bg-card)",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
              onClick={() => {
                setExtractFormat("wav");
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-primary)" }}>WAV Lossless</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                Âm thanh không nén 16-bit PCM nguyên bản, thích hợp dựng phim & remix.
              </div>
            </div>
          </div>

          {/* Custom title & Vault saving settings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px", color: "var(--text-secondary)" }}>
                Đặt tên file âm thanh (Tùy chọn)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="VD: Nhạc nền viral TikTok, Nhạc không lời..."
                value={extractTitle}
                onChange={(e) => setExtractTitle(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px", color: "var(--text-secondary)" }}>
                Lưu vào danh mục trong Kho
              </label>
              <select
                className="input-field"
                value={extractCategory}
                onChange={(e) => setExtractCategory(e.target.value)}
                style={{ width: "100%" }}
                disabled={!extractSaveVault}
              >
                <option value="all">📁 Tất cả video / Chưa phân loại</option>
                {categories.filter(c => c.id !== "all").map(c => (
                  <option key={c.id} value={c.id}>📁 {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Checkbox Auto Save to Vault */}
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={extractSaveVault}
              onChange={(e) => setExtractSaveVault(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "#a855f7" }}
            />
            <span style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              Tự động lưu file âm thanh này vào <b>Kho Video & Tài Nguyên (Media Vault)</b> để tiện quản lý và soạn thảo kịch bản
            </span>
          </label>

          {/* Big Action Button */}
          <button
            className="btn btn-primary"
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "16px",
              fontWeight: "700",
              background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
              boxShadow: "0 8px 24px rgba(168, 85, 247, 0.35)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px"
            }}
            disabled={isProcessing}
            onClick={handleExtractAudio}
          >
            {isProcessing ? (
              <>
                <div className="spinner-border" style={{ width: "18px", height: "18px" }} />
                <span>{progressMsg || "Đang xử lý tách âm thanh..."}</span>
              </>
            ) : (
              <>
                <Icon name="music" size={20} color="#fff" />
                <span>Bắt Đầu Tách Nhạc Ngay ({extractFormat.toUpperCase()} {extractBitrate})</span>
              </>
            )}
          </button>

          {/* Extraction Result Preview Box */}
          {extractResult && (
            <div style={{
              marginTop: "24px",
              padding: "20px",
              background: "rgba(168, 85, 247, 0.06)",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              borderRadius: "14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#10b981",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <Icon name="check" size={20} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "15px" }}>
                      Tách nhạc thành công! (Xong trong {extractResult.elapsed_seconds}s)
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      File: {extractResult.filename} • Định dạng: {extractResult.format?.toUpperCase()} ({extractResult.bitrate}) • Dung lượng: {formatFileSize(extractResult.file_size)}
                    </div>
                  </div>
                </div>

                <a
                  href={extractResult.download_url}
                  download={extractResult.filename}
                  className="btn btn-primary"
                  style={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    border: "none",
                    padding: "8px 18px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    textDecoration: "none"
                  }}
                >
                  <Icon name="download" size={16} color="#fff" />
                  <span>Tải File MP3 Về Máy</span>
                </a>
              </div>

              {/* Built-in Audio Player */}
              <div style={{ marginTop: "12px" }}>
                <audio
                  controls
                  src={extractResult.stream_url}
                  style={{ width: "100%", borderRadius: "8px", outline: "none" }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TOOL 2: TĂNG / GIẢM ÂM LƯỢNG (0% - 500% BOOST) */}
      {/* ========================================================================= */}
      {activeTab === "volume" && (
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-color)",
          marginBottom: "24px"
        }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 20px 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: "#06b6d4",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: "700"
            }}>2</span>
            Thiết lập mức âm lượng & bộ lọc khuếch đại (0% - 500% BOOST)
          </h3>

          {/* Quick Volume Preset Buttons */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
              Chọn nhanh mức âm lượng:
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { label: "50% (Giảm)", val: 50 },
                { label: "100% (Gốc)", val: 100 },
                { label: "150%", val: 150 },
                { label: "200% (Gấp 2)", val: 200 },
                { label: "300% (Gấp 3)", val: 300 },
                { label: "500% BOOST (Tối đa)", val: 500, highlight: true }
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => setVolumePercent(p.val)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    fontWeight: "700",
                    fontSize: "13px",
                    cursor: "pointer",
                    border: volumePercent === p.val ? "2px solid #06b6d4" : "1px solid var(--border-color)",
                    background: volumePercent === p.val
                      ? (p.highlight ? "linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)" : "rgba(6, 182, 212, 0.15)")
                      : "var(--bg-card)",
                    color: volumePercent === p.val ? "#06b6d4" : "var(--text-secondary)",
                    transition: "all 0.15s ease"
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Volume Slider */}
          <div style={{
            background: "var(--bg-input)",
            borderRadius: "14px",
            padding: "20px",
            border: "1px solid var(--border-color)",
            marginBottom: "24px"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>
                Kéo thanh trượt điều chỉnh:
              </span>
              <span style={{
                fontSize: "24px",
                fontWeight: "900",
                color: volumePercent > 200 ? "#ec4899" : (volumePercent > 100 ? "#06b6d4" : "var(--text-primary)"),
                letterSpacing: "0.5px"
              }}>
                {volumePercent}% {volumePercent > 300 && "🔥 BOOST"}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="500"
              step="5"
              value={volumePercent}
              onChange={(e) => setVolumePercent(Number(e.target.value))}
              style={{
                width: "100%",
                height: "8px",
                borderRadius: "4px",
                accentColor: volumePercent > 200 ? "#ec4899" : "#06b6d4",
                cursor: "pointer"
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              <span>0% (Tắt tiếng)</span>
              <span>100% (Mặc định)</span>
              <span>200%</span>
              <span>300%</span>
              <span>500% BOOST</span>
            </div>
          </div>

          {/* Anti-Distortion Limiter Toggle */}
          <div style={{
            padding: "16px 20px",
            borderRadius: "12px",
            background: enableLimiter ? "rgba(16, 185, 129, 0.08)" : "rgba(244, 63, 94, 0.08)",
            border: "1px solid",
            borderColor: enableLimiter ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px"
          }}>
            <div>
              <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Bộ lọc chống rè / vỡ tiếng thông minh (Smart Peak Limiter)</span>
                <span style={{
                  background: enableLimiter ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)",
                  color: enableLimiter ? "#10b981" : "#f43f5e",
                  padding: "1px 8px",
                  borderRadius: "10px",
                  fontSize: "11px"
                }}>
                  {enableLimiter ? "Đang bật (An toàn)" : "Đã tắt"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", maxWidth: "680px" }}>
                Giữ đỉnh sóng âm dưới ngưỡng méo tiếng (0dB) bằng thuật toán FFmpeg Alimiter. Giúp âm lượng to gấp bội nhưng giọng nói và giai điệu vẫn rõ ràng, êm tai.
              </div>
            </div>

            <button
              type="button"
              className={`btn btn-sm ${enableLimiter ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setEnableLimiter(!enableLimiter)}
              style={{
                background: enableLimiter ? "#10b981" : "",
                borderColor: enableLimiter ? "#10b981" : ""
              }}
            >
              <span>{enableLimiter ? "Bật" : "Tắt"}</span>
            </button>
          </div>

          {/* Output Type: Video MP4 vs Audio MP3 */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
              Định dạng file xuất ra:
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: "12px",
                  border: "2px solid",
                  borderColor: volumeOutputType === "video" ? "#06b6d4" : "var(--border-color)",
                  background: volumeOutputType === "video" ? "rgba(6, 182, 212, 0.08)" : "var(--bg-card)",
                  cursor: "pointer"
                }}
                onClick={() => setVolumeOutputType("video")}
              >
                <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-primary)", marginBottom: "4px" }}>
                  🎬 Xuất Video MP4 mới
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Giữ nguyên chất lượng hình ảnh gốc 100% (-c:v copy), xử lý siêu tốc trong 1-2 giây.
                </div>
              </div>

              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: "12px",
                  border: "2px solid",
                  borderColor: volumeOutputType === "audio" ? "#06b6d4" : "var(--border-color)",
                  background: volumeOutputType === "audio" ? "rgba(6, 182, 212, 0.08)" : "var(--bg-card)",
                  cursor: "pointer"
                }}
                onClick={() => setVolumeOutputType("audio")}
              >
                <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-primary)", marginBottom: "4px" }}>
                  🎵 Chỉ xuất File Nhạc MP3
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Tách riêng luồng âm thanh đã tăng âm sang định dạng MP3 320Kbps chất lượng cao.
                </div>
              </div>
            </div>
          </div>

          {/* Title and Category */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px", color: "var(--text-secondary)" }}>
                Tên file xuất ra (Tùy chọn)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="VD: Video giọng to rõ, Bài hát tăng bass..."
                value={volumeTitle}
                onChange={(e) => setVolumeTitle(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px", color: "var(--text-secondary)" }}>
                Lưu vào danh mục
              </label>
              <select
                className="input-field"
                value={volumeCategory}
                onChange={(e) => setVolumeCategory(e.target.value)}
                style={{ width: "100%" }}
                disabled={!volumeSaveVault}
              >
                <option value="all">📁 Tất cả video / Chưa phân loại</option>
                {categories.filter(c => c.id !== "all").map(c => (
                  <option key={c.id} value={c.id}>📁 {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Checkbox Save to Vault */}
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={volumeSaveVault}
              onChange={(e) => setVolumeSaveVault(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "#06b6d4" }}
            />
            <span style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              Tự động thêm sản phẩm sau khi khuếch đại vào <b>Kho Video (Media Vault)</b>
            </span>
          </label>

          {/* Big Action Button */}
          <button
            className="btn btn-primary"
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "16px",
              fontWeight: "700",
              background: "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
              boxShadow: "0 8px 24px rgba(6, 182, 212, 0.35)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px"
            }}
            disabled={isProcessing}
            onClick={handleAdjustVolume}
          >
            {isProcessing ? (
              <>
                <div className="spinner-border" style={{ width: "18px", height: "18px" }} />
                <span>{progressMsg || "Đang xử lý khuếch đại..."}</span>
              </>
            ) : (
              <>
                <Icon name="volume" size={20} color="#fff" />
                <span>Bắt Đầu Khuếch Đại Âm Lượng ({volumePercent}% BOOST)</span>
              </>
            )}
          </button>

          {/* Volume Result Preview Box */}
          {volumeResult && (
            <div style={{
              marginTop: "24px",
              padding: "20px",
              background: "rgba(6, 182, 212, 0.06)",
              border: "1px solid rgba(6, 182, 212, 0.3)",
              borderRadius: "14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#10b981",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <Icon name="check" size={20} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "15px" }}>
                      Khuếch đại âm lượng thành công ({volumeResult.volume_percent}% BOOST, xong trong {volumeResult.elapsed_seconds}s)
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      File: {volumeResult.filename} • Dung lượng: {formatFileSize(volumeResult.file_size)}
                    </div>
                  </div>
                </div>

                <a
                  href={volumeResult.download_url}
                  download={volumeResult.filename}
                  className="btn btn-primary"
                  style={{
                    background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
                    border: "none",
                    padding: "8px 18px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    textDecoration: "none"
                  }}
                >
                  <Icon name="download" size={16} color="#fff" />
                  <span>Tải File Đã Xử Lý Về Máy</span>
                </a>
              </div>

              {/* Player */}
              <div style={{ marginTop: "12px" }}>
                {volumeResult.output_type === "video" ? (
                  <video
                    controls
                    src={volumeResult.stream_url}
                    style={{ width: "100%", maxHeight: "360px", borderRadius: "8px", background: "#000" }}
                  />
                ) : (
                  <audio
                    controls
                    src={volumeResult.stream_url}
                    style={{ width: "100%", borderRadius: "8px", outline: "none" }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. HISTORY TAB: PROCESSED MEDIA LIBRARY */}
      {/* ========================================================================= */}
      {activeTab === "history" && (
        <div style={{
          background: "var(--bg-surface)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-color)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                Lịch sử âm thanh & media đã xử lý
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                Toàn bộ các file MP3 và video đã qua studio tăng âm lượng / tách nhạc được lưu trực tiếp trên máy tính của bạn.
              </p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadHistory}
            >
              <span>Làm mới</span>
            </button>
          </div>

          {historyLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Đang tải danh sách file...
            </div>
          ) : historyItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Chưa có file âm thanh nào được xử lý. Hãy sử dụng công cụ "Tách Nhạc" hoặc "Tăng Âm Lượng" để bắt đầu!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {historyItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "14px 18px",
                    background: "var(--bg-card)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "14px",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "260px" }}>
                    <div style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      background: item.type === "video" ? "rgba(6, 182, 212, 0.15)" : "rgba(168, 85, 247, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: item.type === "video" ? "#06b6d4" : "#a855f7"
                    }}>
                      <Icon name={item.type === "video" ? "play" : "music"} size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>
                        {item.filename}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {item.format?.toUpperCase()} • {formatFileSize(item.file_size)} • {new Date(item.created_at * 1000).toLocaleString("vi-VN")}
                      </div>
                    </div>
                  </div>

                  {/* Inline Audio Player if it's audio */}
                  {item.type === "audio" && (
                    <div style={{ flex: 1, minWidth: "200px", maxWidth: "360px" }}>
                      <audio
                        controls
                        src={item.stream_url}
                        style={{ width: "100%", height: "36px" }}
                      />
                    </div>
                  )}

                  <a
                    href={item.download_url}
                    download={item.filename}
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: "none" }}
                  >
                    <Icon name="download" size={14} />
                    <span>Tải về</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
