import React, { useState, useEffect, useRef } from "react";
import { Icon } from "../Icons";
import DubbingExportModal from "./DubbingExportModal";
import {
  getDubbingProject,
  getDubbingSegments,
  saveDubbingSegments,
  getDubbingAudits,
  saveDubbingSubtitleStyle,
  saveDubbingBlurRegions,
  getDubbingCredits,
  retranslateDubbingSegments,
  generateDubbingTTS,
  autoLocalizeDubbingProject,
  autoFitSyncDubbing
} from "../../api";

export default function DubbingStudioView({ projectId, onBackToProjects }) {
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState("transcript"); // Default to Tab 1 Lời thoại
  const [subTab, setSubTab] = useState("translate"); // "translate" | "dubbing"
  const [segments, setSegments] = useState([]);
  const [audits, setAudits] = useState({ overflow_indices: [], too_fast_indices: [] });
  const [credits, setCredits] = useState({ balance: 20000, expire_days: 7 });
  const [selectedSegIndex, setSelectedSegIndex] = useState(1);
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [isAutoFitting, setIsAutoFitting] = useState(false);

  // Auto Localization Pipeline State
  const [ocrMode, setOcrMode] = useState("SPEECH"); // "SPEECH" | "OCR"
  const [sourceLang, setSourceLang] = useState("auto");
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);
  const [autoProcessStep, setAutoProcessStep] = useState("");

  // Subtitle Style State
  const [subStyle, setSubStyle] = useState({
    is_enabled: 1,
    font_family: "Montserrat",
    font_size: 22,
    bold: 1,
    italic: 0,
    underline: 0,
    text_case: "DEFAULT",
    primary_color: "#FFEE00",
    outline_color: "#000000",
    outline_width: 2.0,
    box_bg_enabled: 1,
    box_bg_color: "#000000",
    box_bg_opacity: 0.65,
    alignment: 2,
    margin_v: 60
  });

  // Blur Regions State
  const [blurRegions, setBlurRegions] = useState([]);
  const [blurMode, setBlurMode] = useState("WHEN_SUBTITLE_ACTIVE"); // "WHEN_SUBTITLE_ACTIVE" | "ALWAYS"

  // Logo State
  const [logoSettings, setLogoSettings] = useState({
    is_enabled: 0,
    text_content: "",
    position: "TOP_RIGHT",
    opacity: 0.9,
    scale: 1.0
  });

  // Player & Audio Mixer State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(56100); // 00:56.10
  const [durationMs, setDurationMs] = useState(590370); // 09:50.37
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Audio Mixer Engine: Tiếng video gốc vs Giọng lồng tiếng AI Tiếng Việt
  const [originalVolume, setOriginalVolume] = useState(0); // 0% Mặc định tắt tiếng video gốc để giọng Việt rõ nét
  const [isOriginalMuted, setIsOriginalMuted] = useState(true); // Mặc định tắt tiếng gốc
  const [voiceoverVolume, setVoiceoverVolume] = useState(100); // 100% Giọng lồng tiếng AI Tiếng Việt
  const [isVoiceoverMuted, setIsVoiceoverMuted] = useState(false);
  const [hasVoiceover, setHasVoiceover] = useState(false);
  const [voiceoverKey, setVoiceoverKey] = useState(Date.now());

  // ROI on video player
  const [roiBox, setRoiBox] = useState({ x: 120, y: 1420, width: 840, height: 120 });

  const videoRef = useRef(null);
  const voiceoverRef = useRef(null);

  // Real-time Volume Adjustment Sync for Video (Original Audio)
  useEffect(() => {
    if (videoRef.current) {
      const vol = isOriginalMuted ? 0 : Math.max(0, Math.min(1, originalVolume / 100));
      videoRef.current.volume = vol;
      videoRef.current.muted = isOriginalMuted || originalVolume === 0;
    }
  }, [originalVolume, isOriginalMuted]);

  // Real-time Volume Adjustment Sync for Audio (Voiceover Audio)
  useEffect(() => {
    if (voiceoverRef.current) {
      const vol = isVoiceoverMuted ? 0 : Math.max(0, Math.min(1, voiceoverVolume / 100));
      voiceoverRef.current.volume = vol;
      voiceoverRef.current.muted = isVoiceoverMuted || voiceoverVolume === 0;
    }
  }, [voiceoverVolume, isVoiceoverMuted]);

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      const [pRes, sRes, aRes, cRes] = await Promise.all([
        getDubbingProject(projectId),
        getDubbingSegments(projectId),
        getDubbingAudits(projectId),
        getDubbingCredits()
      ]);

      if (pRes.success && pRes.project) {
        setProject(pRes.project);
        setDurationMs(pRes.project.duration_ms || 590370);
        if (pRes.project.subtitle_style) setSubStyle(pRes.project.subtitle_style);
        if (pRes.project.blur_regions) setBlurRegions(pRes.project.blur_regions);
        if (pRes.project.logo) setLogoSettings(pRes.project.logo);
      }
      if (sRes.success) setSegments(sRes.segments || []);
      if (aRes.success && aRes.audits) setAudits(aRes.audits);
      if (cRes.success) setCredits(cRes.credits);
    } catch (e) {
      console.error("Error loading project studio:", e);
    }
  };

  const handleUpdateSegmentText = (segIdx, field, val) => {
    setSegments(prev => prev.map(s => {
      if (s.seg_index === segIdx) {
        const updated = { ...s, [field]: val };
        return updated;
      }
      return s;
    }));
  };

  const handleUpdateSegmentSpeed = (segIdx, delta) => {
    setSegments(prev => prev.map(s => {
      if (s.seg_index === segIdx) {
        const curSpeed = s.tts_speed || 1.0;
        const newSpeed = Math.max(0.5, Math.min(2.0, parseFloat((curSpeed + delta).toFixed(1))));
        return { ...s, tts_speed: newSpeed };
      }
      return s;
    }));
  };

  const handleSaveAll = async () => {
    try {
      await Promise.all([
        saveDubbingSegments(projectId, segments),
        saveDubbingSubtitleStyle(projectId, subStyle),
        saveDubbingBlurRegions(projectId, blurRegions)
      ]);
      alert("Đã lưu toàn bộ thay đổi thành công!");
      loadProjectData();
    } catch (e) {
      alert("Lỗi lưu dữ liệu: " + e.message);
    }
  };

  const handleRetranslate = async () => {
    try {
      setIsRetranslating(true);
      const res = await retranslateDubbingSegments(projectId, "vi", "concise");
      if (res.success && res.segments) {
        setSegments(res.segments);
        const aRes = await getDubbingAudits(projectId);
        if (aRes.success && aRes.audits) setAudits(aRes.audits);
        alert("Đã hoàn tất dịch lại toàn bộ lời thoại sang Tiếng Việt!");
      }
    } catch (e) {
      alert("Lỗi dịch lại: " + e.message);
    } finally {
      setIsRetranslating(false);
    }
  };

  const handleGenerateTTS = async () => {
    try {
      setIsGeneratingTTS(true);
      const res = await generateDubbingTTS(projectId, "HN - Ngoc Huyen");
      if (res.success && res.segments) {
        setSegments(res.segments);
        const aRes = await getDubbingAudits(projectId);
        if (aRes.success && aRes.audits) setAudits(aRes.audits);
        setVoiceoverKey(Date.now());
        setHasVoiceover(true);
        if (voiceoverRef.current) {
          voiceoverRef.current.load();
        }
        alert("Đã sinh giọng đọc lồng tiếng AI thành công cho tất cả các câu!");
      }
    } catch (e) {
      alert("Lỗi tạo lồng tiếng: " + e.message);
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  const handleAutoFitSync = async () => {
    try {
      setIsAutoFitting(true);
      const res = await autoFitSyncDubbing(projectId);
      if (res.success) {
        if (res.segments) setSegments(res.segments);
        if (res.audits) setAudits(res.audits);
        setVoiceoverKey(Date.now());
        setHasVoiceover(true);
        if (voiceoverRef.current) {
          voiceoverRef.current.load();
        }
        alert("Đã đồng bộ và khớp thời lượng 100% với video gốc! Giọng đọc lồng tiếng đã được căn chỉnh timestamp và điều chỉnh tốc độ tự động.");
      }
    } catch (e) {
      alert("Lỗi khi đồng bộ khớp thời lượng: " + e.message);
    } finally {
      setIsAutoFitting(false);
    }
  };

  const jumpToSegment = (segIdx) => {
    setSelectedSegIndex(segIdx);
    const seg = segments.find(s => s.seg_index === segIdx);
    if (seg) {
      const targetSec = seg.start_ms / 1000;
      setCurrentTimeMs(seg.start_ms);
      if (videoRef.current) {
        videoRef.current.currentTime = targetSec;
      }
      if (voiceoverRef.current) {
        voiceoverRef.current.currentTime = targetSec;
        if (isPlaying) {
          voiceoverRef.current.play().catch(() => {});
        }
      }
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) {
      setIsPlaying(!isPlaying);
      return;
    }
    if (videoRef.current.paused) {
      // Apply exact volume levels right before playing
      const vVol = isOriginalMuted ? 0 : Math.max(0, Math.min(1, originalVolume / 100));
      videoRef.current.volume = vVol;
      videoRef.current.muted = isOriginalMuted || originalVolume === 0;

      if (voiceoverRef.current) {
        const aVol = isVoiceoverMuted ? 0 : Math.max(0, Math.min(1, voiceoverVolume / 100));
        voiceoverRef.current.volume = aVol;
        voiceoverRef.current.muted = isVoiceoverMuted || voiceoverVolume === 0;
        voiceoverRef.current.currentTime = videoRef.current.currentTime;
        voiceoverRef.current.play().catch(e => console.warn("Voiceover play error:", e));
      }

      videoRef.current.play().catch(e => console.warn("Video play error:", e));
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      if (voiceoverRef.current) {
        voiceoverRef.current.pause();
      }
      setIsPlaying(false);
    }
  };

  const formatTimecode = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
  };

  const getRemainingHours = () => {
    if (!project?.expire_at) return "24h";
    try {
      const diffMs = new Date(project.expire_at) - new Date();
      if (diffMs <= 0) return "Hết hạn";
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${mins}m`;
    } catch {
      return "24h";
    }
  };

  const handleRunAutoPipeline = async () => {
    setIsAutoProcessing(true);
    setAutoProcessStep(ocrMode === "SPEECH" 
      ? "Đang nhận diện ngôn ngữ & bóc tách lời thoại (Whisper)..." 
      : "Đang quét phụ đề trên màn hình (RapidOCR)...");
    try {
      const res = await autoLocalizeDubbingProject(projectId, {
        mode: ocrMode,
        source_lang: sourceLang,
        roi_box: roiBox,
        voice_id: "HN - Ngoc Huyen",
        auto_blur: true,
        auto_tts: true
      });
      if (res.success) {
        if (res.project) setProject(res.project);
        if (res.segments) setSegments(res.segments);
        if (res.audits) setAudits(res.audits);
        if (res.project?.blur_regions) setBlurRegions(res.project.blur_regions);
        if (res.project?.subtitle_style) setSubStyle(res.project.subtitle_style);
        alert(`Hoàn tất! Đã nhận diện: ${res.language_name || res.detected_language}, dịch sang Tiếng Việt, tạo lồng tiếng và làm mờ phụ đề gốc thành công.`);
      } else {
        throw new Error(res?.detail || "Xử lý tự động thất bại.");
      }
    } catch (err) {
      alert("Lỗi khi xử lý tự động: " + err.message);
    } finally {
      setIsAutoProcessing(false);
      setAutoProcessStep("");
    }
  };

  const handleAddBlurRegion = () => {
    const newIdx = blurRegions.length + 1;
    const newRegion = {
      region_index: newIdx,
      mode: blurMode,
      x: 120,
      y: 1420,
      width: 840,
      height: 120,
      blur_strength: 15,
      start_sec: parseFloat((currentTimeMs / 1000).toFixed(2)),
      end_sec: parseFloat(((currentTimeMs + 3000) / 1000).toFixed(2))
    };
    setBlurRegions([...blurRegions, newRegion]);
  };

  const handleDeleteBlurRegion = (idx) => {
    setBlurRegions(blurRegions.filter((_, i) => i !== idx));
  };

  const activeSeg = segments.find(s => currentTimeMs >= s.start_ms && currentTimeMs <= s.end_ms);
  const currentSubtitleText = activeSeg ? (activeSeg.translated_text || activeSeg.original_text) : (segments[0]?.translated_text || "");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", minWidth: 0, background: "#09090b", color: "#f4f4f5", overflow: "hidden" }}>
      
      {/* 1. TOP HEADER BAR matching 4KStudio */}
      <div style={{
        height: "56px", borderBottom: "1px solid #18181b", background: "#09090b",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px"
      }}>
        {/* Left: Project title & auto delete */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button 
            onClick={onBackToProjects}
            style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer", display: "flex", alignItems: "center" }}
            title="Quay về danh sách dự án"
          >
            <Icon name="arrowLeft" size={18} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: "600", fontSize: "14px" }}>
              {project?.name || "SaveTik.io_7676426179896823046"}
            </span>
            <Icon name="edit" size={14} color="#71717a" style={{ cursor: "pointer" }} />
          </div>

          <div style={{
            fontSize: "11px", display: "flex", alignItems: "center", gap: "5px",
            background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)",
            padding: "3px 8px", borderRadius: "12px", color: "#f59e0b", fontWeight: "600"
          }}>
            <Icon name="clock" size={12} /> Tự xoá sau {getRemainingHours()}
          </div>
        </div>

        {/* Center: 5 Studio Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#18181b", padding: "3px", borderRadius: "8px", border: "1px solid #27272a" }}>
          {[
            { id: "transcript", label: "Lời thoại", icon: "fileText" },
            { id: "translate", label: "Dịch & Lồng tiếng", icon: "globe" },
            { id: "subtitle", label: "Phụ đề", icon: "type" },
            { id: "blur", label: "Làm mờ", icon: "grid" },
            { id: "logo", label: "Logo", icon: "image" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 14px", borderRadius: "6px", border: "none",
                background: activeTab === tab.id ? "#27272a" : "transparent",
                color: activeTab === tab.id ? "#fff" : "#a1a1aa",
                fontWeight: activeTab === tab.id ? "600" : "500",
                fontSize: "12px", cursor: "pointer"
              }}
            >
              <Icon name={tab.icon} size={13} color={activeTab === tab.id ? "#10b981" : "#71717a"} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Credits, Settings & Export */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px", background: "#18181b",
            padding: "4px 10px", borderRadius: "16px", border: "1px solid #27272a", fontSize: "11px"
          }}>
            <span style={{ color: "#f59e0b", fontWeight: "700" }}>⚡ {credits.balance?.toLocaleString()} credit</span>
            <span style={{ color: "#71717a" }}>Hết hạn sau {credits.expire_days} ngày</span>
            <button style={{
              background: "#10b981", color: "#000", border: "none", borderRadius: "10px",
              padding: "2px 6px", fontSize: "10px", fontWeight: "700", cursor: "pointer"
            }}>
              Nạp credit
            </button>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: "4px", background: "#18181b",
            padding: "4px 8px", borderRadius: "6px", border: "1px solid #27272a", fontSize: "11px"
          }}>
            <span style={{ color: "#10b981", fontWeight: "700" }}>VI</span>
            <span style={{ color: "#52525b" }}>|</span>
            <span style={{ color: "#71717a" }}>EN</span>
          </div>

          <button 
            onClick={handleSaveAll}
            style={{
              background: "#18181b", border: "1px solid #27272a", color: "#d4d4d8",
              padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "4px"
            }}
          >
            <Icon name="save" size={13} /> Lưu
          </button>

          <button 
            onClick={() => setIsExportModalOpen(true)}
            style={{
              background: "#10b981", color: "#000", border: "none",
              padding: "6px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px"
            }}
          >
            <Icon name="download" size={14} /> Tải về
          </button>
        </div>
      </div>

      {/* Global Studio Pipeline Status Bar */}
      <div style={{
        height: "28px", background: "#121215", borderBottom: "1px solid #18181b",
        display: "flex", alignItems: "center", padding: "0 20px", gap: "12px", fontSize: "11px", color: "#a1a1aa"
      }}>
        {isAutoProcessing ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", border: "2px solid #10b981", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ color: "#10b981", fontWeight: "600" }}>{autoProcessStep || "Đang xử lý quy trình AI..."}</span>
            </div>
            <div style={{ flex: 1, height: "4px", background: "#27272a", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ width: "65%", height: "100%", background: "linear-gradient(90deg, #10b981, #34d399)" }} />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
              <span style={{ color: "#10b981", fontWeight: "600" }}>
                {project?.language_name || (project?.detected_language ? project.detected_language.toUpperCase() : "Tiếng Trung")} ➔ Tiếng Việt
              </span>
            </div>
            <span style={{ color: "#3f3f46" }}>•</span>
            <span style={{ color: "#e4e4e7" }}>{segments.length} câu thoại</span>
            <span style={{ color: "#3f3f46" }}>•</span>
            <span style={{ color: "#a1a1aa" }}>Giọng đọc: AI Hoài My Neural</span>
            <span style={{ color: "#3f3f46" }}>•</span>
            <span style={{ color: "#a1a1aa" }}>Phụ đề ASS & Vùng làm mờ sẵn sàng</span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", color: "#71717a", flexShrink: 0 }}>
              <span>Thời lượng: {formatTimecode(durationMs)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. MAIN WORKSPACE (SPLIT SCREEN: LEFT PLAYER + RIGHT TAB PANELS) */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, width: "100%", overflow: "hidden" }}>
        
        {/* LEFT COLUMN: VIDEO PLAYER & PRECISION TIMELINE */}
        <div style={{ flex: "0 0 55%", width: "55%", maxWidth: "55%", minWidth: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #18181b", background: "#000", overflow: "hidden" }}>
          
          {/* Realtime Video Display & Canvas Overlays */}
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            
            {/* Base Video / Visual Background */}
            <div style={{
              width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              background: "#09090b", position: "relative", overflow: "hidden"
            }}>
              {project?.id ? (
                <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                  <video 
                    ref={videoRef}
                    src={`/api/dubbing/assets/download/${project.id}/source`}
                    poster={`/api/dubbing/assets/download/${project.id}/thumbnail`}
                    preload="auto"
                    playsInline
                    controls={false}
                    onClick={togglePlayPause}
                    style={{ maxHeight: "88%", maxWidth: "90%", width: "auto", height: "auto", objectFit: "contain", borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", cursor: "pointer" }} 
                    onTimeUpdate={(e) => {
                      const curMs = Math.floor(e.target.currentTime * 1000);
                      setCurrentTimeMs(curMs);
                      if (voiceoverRef.current && !e.target.paused) {
                        const diff = Math.abs(voiceoverRef.current.currentTime - e.target.currentTime);
                        if (diff > 0.25) {
                          voiceoverRef.current.currentTime = e.target.currentTime;
                        }
                        if (voiceoverRef.current.paused) {
                          voiceoverRef.current.play().catch(() => {});
                        }
                      }
                    }}
                    onSeeked={(e) => {
                      if (voiceoverRef.current) {
                        voiceoverRef.current.currentTime = e.target.currentTime;
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      if (e.target.duration && !isNaN(e.target.duration)) {
                        setDurationMs(Math.floor(e.target.duration * 1000));
                      }
                      e.target.volume = isOriginalMuted ? 0 : Math.max(0, Math.min(1, originalVolume / 100));
                      e.target.muted = isOriginalMuted || originalVolume === 0;
                    }}
                    onPlay={() => {
                      setIsPlaying(true);
                      if (voiceoverRef.current && voiceoverRef.current.paused) {
                        voiceoverRef.current.currentTime = videoRef.current.currentTime;
                        voiceoverRef.current.play().catch(() => {});
                      }
                    }}
                    onPause={() => {
                      setIsPlaying(false);
                      if (voiceoverRef.current && !voiceoverRef.current.paused) {
                        voiceoverRef.current.pause();
                      }
                    }}
                  />
                  {/* Master Voiceover Audio Track (Edge-TTS AI) */}
                  <audio
                    ref={voiceoverRef}
                    src={`/api/dubbing/assets/download/${project.id}/voiceover?t=${voiceoverKey}`}
                    preload="auto"
                    onCanPlay={() => setHasVoiceover(true)}
                    onError={() => setHasVoiceover(false)}
                  />
                  {!isPlaying && (
                    <button 
                      onClick={togglePlayPause}
                      style={{
                        position: "absolute", width: "54px", height: "54px", borderRadius: "50%",
                        background: "rgba(0,0,0,0.7)", border: "2px solid #10b981", color: "#10b981",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 10
                      }}
                      title="Bấm để phát video"
                    >
                      <Icon name="play" size={24} />
                    </button>
                  )}
                </div>
              ) : (
                <img 
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=60" 
                  alt="" 
                  style={{ maxHeight: "85%", maxWidth: "85%", objectFit: "contain", borderRadius: "8px" }} 
                />
              )}

              {/* OVERLAY 1: OCR ROI Bounding Box (Active in Tab 1) */}
              {activeTab === "transcript" && (
                <div style={{
                  position: "absolute", bottom: "18%", left: "20%", right: "20%", height: "60px",
                  border: "2px dashed #10b981", background: "rgba(16, 185, 129, 0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "move", zIndex: 15
                }}>
                  <span style={{ background: "#10b981", color: "#000", fontSize: "10px", fontWeight: "700", padding: "1px 5px", position: "absolute", top: "-18px", left: "0" }}>
                    VÙNG QUÉT OCR (ROI)
                  </span>
                  <span style={{ color: "#fff", fontSize: "14px", fontWeight: "600", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
                    根据你的需求来调整
                  </span>
                </div>
              )}

              {/* OVERLAY 2: Blur Bounding Box (Active in Tab 4) */}
              {activeTab === "blur" && (
                <div style={{
                  position: "absolute", bottom: "18%", left: "18%", right: "18%", height: "70px",
                  border: "2px solid #84cc16", background: "rgba(132, 204, 22, 0.2)",
                  backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 15
                }}>
                  <div style={{
                    position: "absolute", top: "-22px", left: "0", background: "#84cc16", color: "#000",
                    fontSize: "10px", fontWeight: "700", padding: "2px 6px", display: "flex", alignItems: "center", gap: "6px"
                  }}>
                    <span>#1 • 00:15.53 - 00:19.03</span>
                    <span style={{ cursor: "pointer", color: "#dc2626" }} onClick={() => handleDeleteBlurRegion(0)}>✕ Xóa</span>
                  </div>
                </div>
              )}

              {/* OVERLAY 3: Live Subtitle ASS Render (Active in Tab 3 or default) */}
              {subStyle.is_enabled && (
                <div style={{
                  position: "absolute", bottom: `${subStyle.margin_v}px`,
                  textAlign: "center", padding: "4px 14px", maxWidth: "85%",
                  background: subStyle.box_bg_enabled ? `rgba(0, 0, 0, ${subStyle.box_bg_opacity})` : "transparent",
                  color: subStyle.primary_color,
                  fontSize: `${subStyle.font_size}px`,
                  fontFamily: subStyle.font_family,
                  fontWeight: subStyle.bold ? "bold" : "normal",
                  fontStyle: subStyle.italic ? "italic" : "normal",
                  textDecoration: subStyle.underline ? "underline" : "none",
                  textTransform: subStyle.text_case === "UPPERCASE" ? "uppercase" : subStyle.text_case === "LOWERCASE" ? "lowercase" : "none",
                  WebkitTextStroke: `${subStyle.outline_width}px ${subStyle.outline_color}`,
                  borderRadius: "4px", pointerEvents: "none", zIndex: 16
                }}>
                  {currentSubtitleText || "Phụ đề mẫu"}
                </div>
              )}

              {/* OVERLAY 4: Logo Watermark */}
              {logoSettings.is_enabled && (
                <div style={{
                  position: "absolute", top: "20px", right: "20px",
                  color: "#fff", opacity: logoSettings.opacity, fontSize: "14px", fontWeight: "700",
                  background: "rgba(0,0,0,0.5)", padding: "4px 8px", borderRadius: "4px"
                }}>
                  {logoSettings.text_content || "4KSTUDIO"}
                </div>
              )}

            </div>
          </div>

          {/* Precision Timeline Player Controls */}
          <div style={{ height: "140px", minWidth: 0, width: "100%", borderTop: "1px solid #18181b", background: "#09090b", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
            
            {/* Transport Bar */}
            <div style={{
              height: "44px", borderBottom: "1px solid #18181b", display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "0 16px", flexShrink: 0
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button 
                  onClick={togglePlayPause}
                  style={{
                    width: "28px", height: "28px", borderRadius: "6px", background: "#10b981",
                    color: "#000", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                  title={isPlaying ? "Tạm dừng" : "Phát video & lồng tiếng"}
                >
                  <Icon name={isPlaying ? "pause" : "play"} size={14} />
                </button>
                <button 
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                      if (voiceoverRef.current) voiceoverRef.current.currentTime = videoRef.current.currentTime;
                    }
                  }}
                  style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer", padding: "2px" }}
                  title="Lùi 5s"
                >
                  <Icon name="skipBack" size={14} />
                </button>
                <button 
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = Math.min(durationMs / 1000, videoRef.current.currentTime + 5);
                      if (voiceoverRef.current) voiceoverRef.current.currentTime = videoRef.current.currentTime;
                    }
                  }}
                  style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer", padding: "2px" }}
                  title="Tua 5s"
                >
                  <Icon name="skipForward" size={14} />
                </button>
                <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#10b981", fontWeight: "600" }}>
                  {formatTimecode(currentTimeMs)} <span style={{ color: "#71717a" }}>/ {formatTimecode(durationMs)}</span>
                </span>
              </div>

              {/* Quick Audio Volume Balance Controls */}
              <div style={{
                display: "flex", alignItems: "center", gap: "12px", background: "#141417",
                padding: "2px 10px", borderRadius: "6px", border: "1px solid #27272a"
              }}>
                {/* Original Audio (Tiếng video gốc) */}
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }} title="Âm lượng video gốc (Tiếng Trung)">
                  <button
                    onClick={() => setIsOriginalMuted(!isOriginalMuted)}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: "12px", color: isOriginalMuted || originalVolume === 0 ? "#ef4444" : "#a1a1aa", padding: 0
                    }}
                    title={isOriginalMuted ? "Bật lại tiếng gốc" : "Tắt tiếng gốc"}
                  >
                    {isOriginalMuted || originalVolume === 0 ? "🔇" : "🔊"}
                  </button>
                  <span style={{ fontSize: "10px", color: isOriginalMuted || originalVolume === 0 ? "#ef4444" : "#d4d4d8", fontWeight: "600", width: "42px" }}>
                    Gốc {isOriginalMuted ? 0 : originalVolume}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isOriginalMuted ? 0 : originalVolume}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setOriginalVolume(val);
                      if (val > 0) setIsOriginalMuted(false);
                      else setIsOriginalMuted(true);
                    }}
                    style={{ width: "50px", accentColor: "#ef4444", cursor: "pointer" }}
                  />
                </div>

                <div style={{ width: "1px", height: "14px", background: "#27272a" }} />

                {/* Voiceover (Tiếng lồng tiếng AI Tiếng Việt) */}
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }} title="Âm lượng lồng tiếng AI Tiếng Việt">
                  <button
                    onClick={() => setIsVoiceoverMuted(!isVoiceoverMuted)}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: "12px", color: isVoiceoverMuted || voiceoverVolume === 0 ? "#ef4444" : "#10b981", padding: 0
                    }}
                    title={isVoiceoverMuted ? "Bật lồng tiếng AI" : "Tắt lồng tiếng AI"}
                  >
                    {isVoiceoverMuted || voiceoverVolume === 0 ? "🔇" : "🎙️"}
                  </button>
                  <span style={{ fontSize: "10px", color: isVoiceoverMuted || voiceoverVolume === 0 ? "#71717a" : "#10b981", fontWeight: "600", width: "48px" }}>
                    Việt {isVoiceoverMuted ? 0 : voiceoverVolume}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isVoiceoverMuted ? 0 : voiceoverVolume}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setVoiceoverVolume(val);
                      if (val > 0) setIsVoiceoverMuted(false);
                      else setIsVoiceoverMuted(true);
                    }}
                    style={{ width: "50px", accentColor: "#10b981", cursor: "pointer" }}
                  />
                </div>
              </div>

              {/* Zoom & Fit */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#71717a" }}>-</span>
                <input 
                  type="range" min="0.5" max="3" step="0.1" 
                  value={timelineZoom} 
                  onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                  style={{ width: "65px", accentColor: "#10b981" }}
                />
                <span style={{ fontSize: "11px", color: "#71717a" }}>+</span>
                <button style={{
                  background: "#18181b", border: "1px solid #27272a", color: "#a1a1aa",
                  padding: "2px 6px", borderRadius: "4px", fontSize: "10px", cursor: "pointer"
                }}>
                  Fit
                </button>
              </div>
            </div>

            {/* Timeline Segment Tracks */}
            <div style={{ flex: 1, padding: "8px 16px", overflowX: "auto", overflowY: "hidden", minWidth: 0, width: "100%", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "100%", width: "max-content", minWidth: "100%" }}>
                <span style={{ fontSize: "11px", color: "#71717a", width: "45px", flexShrink: 0 }}>Phụ đề</span>
                <div style={{ display: "flex", gap: "4px", height: "42px", background: "#121215", borderRadius: "6px", padding: "4px", flexShrink: 0 }}>
                  {segments.map((s) => (
                    <div 
                      key={s.id || s.seg_index}
                      onClick={() => jumpToSegment(s.seg_index)}
                      style={{
                        minWidth: "80px",
                        maxWidth: "160px",
                        flexShrink: 0,
                        background: selectedSegIndex === s.seg_index ? "rgba(16, 185, 129, 0.3)" : "#27272a",
                        border: selectedSegIndex === s.seg_index ? "1px solid #10b981" : "1px solid #3f3f46",
                        borderRadius: "4px", padding: "2px 6px", fontSize: "10px", color: "#fff",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer"
                      }}
                      title={`#${s.seg_index}: ${s.translated_text || s.original_text}`}
                    >
                      {s.seg_index}. {s.original_text?.slice(0, 15)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: 5 STUDIO TAB PANELS */}
        <div style={{ flex: "0 0 45%", width: "45%", maxWidth: "45%", minWidth: 0, display: "flex", flexDirection: "column", background: "#121215", overflowY: "auto", overflowX: "hidden" }}>
          
          {/* TAB 1: LỜI THOẠI (TRANSCRIPT) */}
          {activeTab === "transcript" && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "600" }}>LỜI THOẠI</h3>
                  <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#a1a1aa" }}>
                    Nhận diện giọng nói bằng AI Whisper hoặc đọc chữ phụ đề bằng OCR.
                  </p>
                </div>
                <button 
                  onClick={handleRunAutoPipeline}
                  disabled={isAutoProcessing}
                  style={{
                    background: isAutoProcessing ? "#059669" : "#18181b",
                    border: "1px solid #27272a",
                    color: isAutoProcessing ? "#fff" : "#f59e0b",
                    padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
                    cursor: isAutoProcessing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px"
                  }}
                >
                  {isAutoProcessing ? "Đang xử lý AI..." : "✨ Tạo lại • 1968 credit"}
                </button>
              </div>

              {/* Progress indicator during Auto Pipeline */}
              {isAutoProcessing && (
                <div style={{
                  padding: "12px 14px", borderRadius: "8px",
                  background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)",
                  display: "flex", alignItems: "center", gap: "10px", color: "#10b981", fontSize: "12px"
                }}>
                  <div style={{
                    width: "14px", height: "14px", border: "2px solid #10b981",
                    borderTopColor: "transparent", borderRadius: "50%",
                    animation: "spin 0.8s linear infinite"
                  }} />
                  <span style={{ fontWeight: "600" }}>{autoProcessStep || "Đang nhận diện ngôn ngữ và xử lý video..."}</span>
                </div>
              )}

              {/* Mode switch */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button 
                  onClick={() => setOcrMode("SPEECH")}
                  disabled={isAutoProcessing}
                  style={{
                    flex: 1, padding: "8px",
                    background: ocrMode === "SPEECH" ? "#27272a" : "#18181b",
                    border: ocrMode === "SPEECH" ? "1px solid #10b981" : "1px solid #27272a",
                    borderRadius: "6px", color: ocrMode === "SPEECH" ? "#fff" : "#a1a1aa",
                    fontWeight: ocrMode === "SPEECH" ? "600" : "400",
                    fontSize: "12px", cursor: isAutoProcessing ? "not-allowed" : "pointer"
                  }}
                >
                  Nghe giọng nói (Whisper)
                </button>
                <button 
                  onClick={() => setOcrMode("OCR")}
                  disabled={isAutoProcessing}
                  style={{
                    flex: 1, padding: "8px",
                    background: ocrMode === "OCR" ? "#27272a" : "#18181b",
                    border: ocrMode === "OCR" ? "1px solid #10b981" : "1px solid #27272a",
                    borderRadius: "6px", color: ocrMode === "OCR" ? "#fff" : "#a1a1aa",
                    fontWeight: ocrMode === "OCR" ? "600" : "400",
                    fontSize: "12px", cursor: isAutoProcessing ? "not-allowed" : "pointer"
                  }}
                >
                  Quét phụ đề trên màn hình (OCR)
                </button>
              </div>

              {/* Language selection */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Ngôn ngữ nguồn</label>
                <select 
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  disabled={isAutoProcessing}
                  style={{
                    width: "100%", padding: "8px 10px", background: "#18181b", border: "1px solid #27272a",
                    borderRadius: "6px", color: "#fff", fontSize: "12px", outline: "none"
                  }}
                >
                  <option value="auto">Tự động nhận diện {project?.language_name ? `(✓ Đã nhận: ${project.language_name})` : "(Khuyên dùng)"}</option>
                  <option value="zh">Tiếng Trung(中文)</option>
                  <option value="en">Tiếng Anh(en)</option>
                  <option value="ko">Tiếng Hàn(ko)</option>
                  <option value="ja">Tiếng Nhật(ja)</option>
                </select>
              </div>

              {/* Status Bar */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: "#18181b", borderRadius: "6px", fontSize: "12px"
              }}>
                <span style={{ color: "#10b981", fontWeight: "600" }}>✓ Sẵn sàng</span>
                <span style={{ color: "#a1a1aa" }}>{segments.length} câu • {formatTimecode(durationMs)}</span>
                <button 
                  onClick={() => {
                    const newIdx = segments.length + 1;
                    const newSeg = {
                      id: `seg_${projectId}_${newIdx}`,
                      project_id: projectId,
                      seg_index: newIdx,
                      start_ms: currentTimeMs,
                      end_ms: currentTimeMs + 3000,
                      duration_ms: 3000,
                      original_text: "Câu thoại mới",
                      translated_text: "Câu thoại mới dịch",
                      voice_id: "HN - Ngoc Huyen",
                      tts_speed: 1.0,
                      audio_duration_ms: 3000
                    };
                    setSegments([...segments, newSeg]);
                  }}
                  style={{
                    background: "#10b981", color: "#000", border: "none", padding: "4px 10px",
                    borderRadius: "4px", fontSize: "11px", fontWeight: "600", cursor: "pointer"
                  }}
                >
                  + Thêm đoạn
                </button>
              </div>

              {/* Segments Transcript list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {segments.map((seg) => (
                  <div key={seg.id || seg.seg_index} style={{
                    padding: "12px", background: "#18181b", borderRadius: "8px",
                    border: selectedSegIndex === seg.seg_index ? "1px solid #10b981" : "1px solid #27272a"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", fontSize: "11px", color: "#a1a1aa" }}>
                      <span>#{seg.seg_index} • {formatTimecode(seg.start_ms)} → {formatTimecode(seg.end_ms)} • {seg.duration_ms}ms</span>
                      <span>Ký tự: {seg.original_char_count} • Tốc độ: {seg.original_char_speed} c/s</span>
                    </div>
                    <textarea 
                      rows={2}
                      value={seg.original_text}
                      onChange={(e) => handleUpdateSegmentText(seg.seg_index, "original_text", e.target.value)}
                      style={{
                        width: "100%", background: "#27272a", border: "1px solid #3f3f46",
                        borderRadius: "6px", padding: "8px", color: "#fff", fontSize: "13px", resize: "none"
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: DỊCH & LỒNG TIẾNG (TRANSLATION & DUBBING) */}
          {activeTab === "translate" && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {/* Sub-tab toggle: Dịch vs Lồng tiếng */}
              <div style={{
                display: "flex", background: "#18181b", padding: "3px", borderRadius: "8px", border: "1px solid #27272a"
              }}>
                <button
                  onClick={() => setSubTab("translate")}
                  style={{
                    flex: 1, padding: "6px", borderRadius: "6px", border: "none",
                    background: subTab === "translate" ? "#27272a" : "transparent",
                    color: subTab === "translate" ? "#fff" : "#a1a1aa",
                    fontWeight: "600", fontSize: "12px", cursor: "pointer"
                  }}
                >
                  Dịch
                </button>
                <button
                  onClick={() => setSubTab("dubbing")}
                  style={{
                    flex: 1, padding: "6px", borderRadius: "6px", border: "none",
                    background: subTab === "dubbing" ? "#27272a" : "transparent",
                    color: subTab === "dubbing" ? "#fff" : "#a1a1aa",
                    fontWeight: "600", fontSize: "12px", cursor: "pointer"
                  }}
                >
                  Lồng tiếng
                </button>
              </div>

              {subTab === "translate" ? (
                <>
                  <button 
                    onClick={handleRetranslate}
                    disabled={isRetranslating}
                    style={{
                      width: "100%", padding: "8px", background: "#18181b", border: "1px solid #27272a",
                      borderRadius: "8px", color: "#10b981", fontWeight: "600", fontSize: "12px", cursor: isRetranslating ? "not-allowed" : "pointer"
                    }}
                  >
                    {isRetranslating ? "Đang dịch tự động..." : "✨ Dịch lại • 292 credit"}
                  </button>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Phong cách dịch</label>
                      <select style={{ width: "100%", padding: "6px 8px", background: "#18181b", border: "1px solid #27272a", borderRadius: "6px", color: "#fff", fontSize: "12px" }}>
                        <option>Dịch ngắn gọn, súc tích (Mặc định)</option>
                        <option>Dịch chi tiết, chuẩn xác</option>
                        <option>Dịch thân mật, dí dỏm</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Ngôn ngữ dịch</label>
                      <select style={{ width: "100%", padding: "6px 8px", background: "#18181b", border: "1px solid #27272a", borderRadius: "6px", color: "#fff", fontSize: "12px" }}>
                        <option>Tiếng Việt (vi)</option>
                        <option>Tiếng Anh (en)</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <button 
                      onClick={handleAutoFitSync}
                      disabled={isAutoFitting}
                      style={{
                        width: "100%", padding: "10px 14px",
                        background: isAutoFitting ? "#3f3f46" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none", borderRadius: "8px", color: "#fff", fontWeight: "700", fontSize: "12px",
                        cursor: isAutoFitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                        boxShadow: "0 2px 10px rgba(16, 185, 129, 0.3)"
                      }}
                      title="Tự động căn chỉnh giọng đọc AI khớp từng miligiây với video gốc, loại bỏ hoàn toàn tình trạng tràn khung"
                    >
                      <span style={{ fontSize: "15px" }}>⚡</span>
                      <span>{isAutoFitting ? "Đang đồng bộ & nén tốc độ khớp video gốc..." : "Khớp chuẩn 100% với giọng đọc video gốc (Auto-Fit Sync)"}</span>
                    </button>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button 
                        onClick={handleGenerateTTS}
                        disabled={isGeneratingTTS}
                        style={{
                          flex: 1, padding: "7px 10px", background: "#1f1f23", border: "1px solid #333338",
                          borderRadius: "6px", color: isGeneratingTTS ? "#71717a" : "#e4e4e7", fontWeight: "600", fontSize: "11px", cursor: isGeneratingTTS ? "not-allowed" : "pointer"
                        }}
                      >
                        {isGeneratingTTS ? "Đang sinh TTS..." : "🎙️ Tạo lại giọng đọc AI"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Nhà cung cấp</label>
                      <select style={{ width: "100%", padding: "6px 8px", background: "#18181b", border: "1px solid #27272a", borderRadius: "6px", color: "#fff", fontSize: "12px" }}>
                        <option>Phổ Biến (EdgeTTS / Azure)</option>
                        <option>ElevenLabs AI</option>
                        <option>OpenAI TTS</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Giọng (30 giọng)</label>
                      <select style={{ width: "100%", padding: "6px 8px", background: "#18181b", border: "1px solid #27272a", borderRadius: "6px", color: "#fff", fontSize: "12px" }}>
                        <option>HN - Ngọc Huyền (Nữ trẻ trung)</option>
                        <option>SG - Minh Hoàng (Nam truyền cảm)</option>
                        <option>HN - Nam Khánh (Nam ấm áp)</option>
                      </select>
                    </div>
                  </div>

                  {/* BỘ TRỘN ÂM THANH STUDIO (AUDIO MIXER CONSOLE) */}
                  <div style={{
                    background: "#18181b", borderRadius: "8px", border: "1px solid #27272a", padding: "14px",
                    display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "15px" }}>🎛️</span>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: "#f4f4f5" }}>BỘ TRỘN ÂM THANH (AUDIO MIXER)</div>
                          <div style={{ fontSize: "10px", color: "#a1a1aa" }}>Điều chỉnh tỉ lệ âm thanh video gốc & lồng tiếng AI</div>
                        </div>
                      </div>
                      <span style={{
                        fontSize: "10px", padding: "2px 8px", borderRadius: "12px", fontWeight: "600",
                        background: hasVoiceover ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                        color: hasVoiceover ? "#10b981" : "#f59e0b",
                        border: hasVoiceover ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)"
                      }}>
                        {hasVoiceover ? "🟢 Lồng tiếng đã sẵn sàng" : "🟡 Đang đồng bộ voiceover..."}
                      </span>
                    </div>

                    {/* Presets 1-Click */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "11px", color: "#a1a1aa", fontWeight: "600" }}>Cấu hình âm thanh nhanh:</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                        <button
                          onClick={() => {
                            setOriginalVolume(0);
                            setIsOriginalMuted(true);
                            setVoiceoverVolume(100);
                            setIsVoiceoverMuted(false);
                          }}
                          style={{
                            padding: "6px 4px", borderRadius: "6px", fontSize: "11px", fontWeight: "600",
                            background: (isOriginalMuted || originalVolume === 0) && voiceoverVolume === 100 && !isVoiceoverMuted ? "rgba(16, 185, 129, 0.25)" : "#202024",
                            border: (isOriginalMuted || originalVolume === 0) && voiceoverVolume === 100 && !isVoiceoverMuted ? "1px solid #10b981" : "1px solid #2e2e33",
                            color: (isOriginalMuted || originalVolume === 0) && voiceoverVolume === 100 && !isVoiceoverMuted ? "#10b981" : "#d4d4d8",
                            cursor: "pointer", textAlign: "center"
                          }}
                        >
                          🎧 Chuẩn Studio
                          <div style={{ fontSize: "9px", opacity: 0.8, marginTop: "2px" }}>0% gốc • 100% Việt</div>
                        </button>

                        <button
                          onClick={() => {
                            setOriginalVolume(12);
                            setIsOriginalMuted(false);
                            setVoiceoverVolume(100);
                            setIsVoiceoverMuted(false);
                          }}
                          style={{
                            padding: "6px 4px", borderRadius: "6px", fontSize: "11px", fontWeight: "600",
                            background: originalVolume > 0 && originalVolume <= 25 && voiceoverVolume === 100 ? "rgba(59, 130, 246, 0.25)" : "#202024",
                            border: originalVolume > 0 && originalVolume <= 25 && voiceoverVolume === 100 ? "1px solid #3b82f6" : "1px solid #2e2e33",
                            color: originalVolume > 0 && originalVolume <= 25 && voiceoverVolume === 100 ? "#60a5fa" : "#d4d4d8",
                            cursor: "pointer", textAlign: "center"
                          }}
                        >
                          🎬 Giữ nền nhẹ
                          <div style={{ fontSize: "9px", opacity: 0.8, marginTop: "2px" }}>12% gốc • 100% Việt</div>
                        </button>

                        <button
                          onClick={() => {
                            setOriginalVolume(100);
                            setIsOriginalMuted(false);
                            setVoiceoverVolume(0);
                            setIsVoiceoverMuted(true);
                          }}
                          style={{
                            padding: "6px 4px", borderRadius: "6px", fontSize: "11px", fontWeight: "600",
                            background: originalVolume === 100 && (isVoiceoverMuted || voiceoverVolume === 0) ? "rgba(245, 158, 11, 0.25)" : "#202024",
                            border: originalVolume === 100 && (isVoiceoverMuted || voiceoverVolume === 0) ? "1px solid #f59e0b" : "1px solid #2e2e33",
                            color: originalVolume === 100 && (isVoiceoverMuted || voiceoverVolume === 0) ? "#fbbf24" : "#d4d4d8",
                            cursor: "pointer", textAlign: "center"
                          }}
                        >
                          👂 Nghe tiếng gốc
                          <div style={{ fontSize: "9px", opacity: 0.8, marginTop: "2px" }}>100% gốc • 0% Việt</div>
                        </button>
                      </div>
                    </div>

                    {/* Slider Kênh 1: Âm thanh video gốc */}
                    <div style={{
                      background: "#202024", padding: "10px 12px", borderRadius: "6px", border: "1px solid #2e2e33",
                      display: "flex", flexDirection: "column", gap: "8px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => setIsOriginalMuted(!isOriginalMuted)}
                            style={{
                              background: isOriginalMuted || originalVolume === 0 ? "rgba(239, 68, 68, 0.2)" : "rgba(161, 161, 170, 0.2)",
                              border: isOriginalMuted || originalVolume === 0 ? "1px solid #ef4444" : "1px solid #52525b",
                              color: isOriginalMuted || originalVolume === 0 ? "#ef4444" : "#e4e4e7",
                              borderRadius: "4px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", fontWeight: "600"
                            }}
                            title={isOriginalMuted ? "Bật lại tiếng gốc" : "Tắt tiếng gốc"}
                          >
                            {isOriginalMuted || originalVolume === 0 ? "🔇 Đã tắt gốc" : "🔊 Tiếng gốc"}
                          </button>
                          <span style={{ fontSize: "12px", color: "#e4e4e7", fontWeight: "600" }}>Âm thanh video gốc (Tiếng Trung)</span>
                        </div>
                        <span style={{ fontSize: "13px", fontFamily: "monospace", fontWeight: "700", color: isOriginalMuted || originalVolume === 0 ? "#ef4444" : "#fff" }}>
                          {isOriginalMuted ? 0 : originalVolume}%
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "10px", color: "#71717a", width: "20px" }}>0%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={isOriginalMuted ? 0 : originalVolume}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setOriginalVolume(val);
                            if (val > 0) setIsOriginalMuted(false);
                            else setIsOriginalMuted(true);
                          }}
                          style={{
                            flex: 1, accentColor: isOriginalMuted ? "#71717a" : "#ef4444", height: "5px", cursor: "pointer"
                          }}
                        />
                        <span style={{ fontSize: "10px", color: "#71717a", width: "28px", textAlign: "right" }}>100%</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#a1a1aa" }}>
                        💡 Đang để <strong style={{ color: "#ef4444" }}>{isOriginalMuted ? 0 : originalVolume}%</strong>: Khuyên dùng <strong>0%</strong> để triệt tiêu hoàn toàn tiếng Trung, chỉ nghe lời dịch tiếng Việt.
                      </div>
                    </div>

                    {/* Slider Kênh 2: Giọng lồng tiếng AI Tiếng Việt */}
                    <div style={{
                      background: "#202024", padding: "10px 12px", borderRadius: "6px", border: "1px solid #2e2e33",
                      display: "flex", flexDirection: "column", gap: "8px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => setIsVoiceoverMuted(!isVoiceoverMuted)}
                            style={{
                              background: isVoiceoverMuted || voiceoverVolume === 0 ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)",
                              border: isVoiceoverMuted || voiceoverVolume === 0 ? "1px solid #ef4444" : "1px solid #10b981",
                              color: isVoiceoverMuted || voiceoverVolume === 0 ? "#ef4444" : "#10b981",
                              borderRadius: "4px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", fontWeight: "600"
                            }}
                            title={isVoiceoverMuted ? "Bật lồng tiếng AI" : "Tắt lồng tiếng AI"}
                          >
                            {isVoiceoverMuted || voiceoverVolume === 0 ? "🔇 Tắt AI" : "🎙️ Lồng tiếng AI"}
                          </button>
                          <span style={{ fontSize: "12px", color: "#10b981", fontWeight: "600" }}>Giọng lồng tiếng AI Tiếng Việt</span>
                        </div>
                        <span style={{ fontSize: "13px", fontFamily: "monospace", fontWeight: "700", color: isVoiceoverMuted ? "#71717a" : "#10b981" }}>
                          {isVoiceoverMuted ? 0 : voiceoverVolume}%
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "10px", color: "#71717a", width: "20px" }}>0%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={isVoiceoverMuted ? 0 : voiceoverVolume}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setVoiceoverVolume(val);
                            if (val > 0) setIsVoiceoverMuted(false);
                            else setIsVoiceoverMuted(true);
                          }}
                          style={{
                            flex: 1, accentColor: "#10b981", height: "5px", cursor: "pointer"
                          }}
                        />
                        <span style={{ fontSize: "10px", color: "#71717a", width: "28px", textAlign: "right" }}>100%</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "10px", color: "#a1a1aa" }}>
                        <span>Đã tạo {segments.length} câu giọng đọc AI</span>
                        <button
                          onClick={() => {
                            if (voiceoverRef.current) {
                              voiceoverRef.current.currentTime = currentTimeMs / 1000;
                              voiceoverRef.current.play().catch(e => alert("Không thể phát: " + e.message));
                            }
                          }}
                          style={{
                            background: "transparent", border: "none", color: "#10b981", cursor: "pointer",
                            fontWeight: "600", textDecoration: "underline", fontSize: "10px"
                          }}
                        >
                          ▶ Nghe thử audio lồng tiếng tại đây
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* TIMING AUDIT BOXES matching 4KStudio (Tràn khung & Đọc quá nhanh) */}
              <div style={{
                background: "#18181b", borderRadius: "8px", border: "1px solid #27272a", padding: "12px",
                display: "flex", flexDirection: "column", gap: "10px"
              }}>
                {/* Giọng tràn khung */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#ef4444", fontWeight: "600" }}>
                      Giọng tràn khung ({audits.overflow_indices?.length || 28})
                    </span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button style={{ background: "#27272a", border: "none", color: "#a1a1aa", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}>&lt;</button>
                      <button style={{ background: "#27272a", border: "none", color: "#a1a1aa", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}>&gt;</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {audits.overflow_indices?.map(idx => (
                      <span 
                        key={idx}
                        onClick={() => jumpToSegment(idx)}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)", color: "#ef4444",
                          border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "4px",
                          fontSize: "10px", padding: "1px 6px", cursor: "pointer"
                        }}
                      >
                        #{idx}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Đọc quá nhanh */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#f59e0b", fontWeight: "600" }}>
                      Đọc quá nhanh ({audits.too_fast_indices?.length || 5})
                    </span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button style={{ background: "#27272a", border: "none", color: "#a1a1aa", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}>&lt;</button>
                      <button style={{ background: "#27272a", border: "none", color: "#a1a1aa", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}>&gt;</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {audits.too_fast_indices?.map(idx => (
                      <span 
                        key={idx}
                        onClick={() => jumpToSegment(idx)}
                        style={{
                          background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b",
                          border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "4px",
                          fontSize: "10px", padding: "1px 6px", cursor: "pointer"
                        }}
                      >
                        #{idx}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Segment Cards List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {segments.map((seg) => (
                  <div 
                    key={seg.id || seg.seg_index}
                    style={{
                      padding: "14px", background: "#18181b", borderRadius: "8px",
                      border: selectedSegIndex === seg.seg_index ? "1px solid #10b981" : "1px solid #27272a"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", fontSize: "11px", color: "#a1a1aa" }}>
                      <span>#{seg.seg_index} • {formatTimecode(seg.start_ms)} → {formatTimecode(seg.end_ms)} • {seg.duration_ms}ms</span>
                    </div>

                    {/* Bản gốc */}
                    <div style={{ marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#71717a", marginBottom: "2px" }}>
                        <span>BẢN GỐC</span>
                        <span>Ký tự: {seg.original_char_count} • {seg.original_char_speed} c/s</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#d4d4d8", background: "#202023", padding: "6px 8px", borderRadius: "4px" }}>
                        {seg.original_text}
                      </div>
                    </div>

                    {/* Bản dịch */}
                    <div style={{ marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#71717a", marginBottom: "2px" }}>
                        <span>BẢN DỊCH</span>
                        <span>Ký tự: {seg.translated_char_count} • {seg.translated_char_speed} c/s • {seg.translated_word_count}/43 từ</span>
                      </div>
                      <textarea 
                        rows={2}
                        value={seg.translated_text}
                        onChange={(e) => handleUpdateSegmentText(seg.seg_index, "translated_text", e.target.value)}
                        style={{
                          width: "100%", background: "#27272a", border: "1px solid #3f3f46",
                          borderRadius: "4px", padding: "6px 8px", color: "#fff", fontSize: "12px", resize: "none"
                        }}
                      />
                    </div>

                    {/* TTS Speed & Status matching 4KStudio */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ color: "#71717a" }}>Tốc độ:</span>
                        <button 
                          onClick={() => handleUpdateSegmentSpeed(seg.seg_index, -0.1)}
                          style={{ background: "#27272a", border: "none", color: "#fff", padding: "2px 6px", borderRadius: "3px", cursor: "pointer" }}
                        >
                          -
                        </button>
                        <span style={{ fontFamily: "monospace" }}>{seg.tts_speed || 1.0}x</span>
                        <button 
                          onClick={() => handleUpdateSegmentSpeed(seg.seg_index, 0.1)}
                          style={{ background: "#27272a", border: "none", color: "#fff", padding: "2px 6px", borderRadius: "3px", cursor: "pointer" }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const a = new Audio(`/api/dubbing/assets/download/${projectId}/tts_seg_${seg.seg_index}`);
                            a.play().catch(e => console.log("Play audio error:", e));
                          }}
                          style={{
                            background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)",
                            color: "#10b981", padding: "2px 8px", borderRadius: "4px", fontSize: "10px",
                            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", marginLeft: "6px"
                          }}
                          title="Nghe thử giọng lồng tiếng của câu này"
                        >
                          ▶ Nghe thử
                        </button>
                        <span style={{ color: "#71717a", marginLeft: "6px" }}>segment_{seg.seg_index.toString().padStart(4, "0")}.wav</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ color: "#10b981", fontSize: "10px" }}>Sẵn sàng</span>
                        <span style={{
                          background: seg.is_overflow ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)",
                          color: seg.is_overflow ? "#ef4444" : "#10b981",
                          padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "600"
                        }}>
                          {seg.is_overflow ? "Tràn khung" : "Khớp tốt"}
                        </span>
                      </div>
                    </div>

                  </div>
                ))}
              </div>

            </div>
          )}

          {/* TAB 3: PHỤ ĐỀ (SUBTITLE STYLING) */}
          {activeTab === "subtitle" && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "600" }}>PHỤ ĐỀ</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#a1a1aa" }}>
                  Tùy chỉnh kiểu hiển thị phụ đề. Xuất file ASS hoặc Video từ mục Export.
                </p>
              </div>

              {/* Subtitle toggle */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", background: "#18181b", borderRadius: "8px", border: "1px solid #27272a"
              }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "600" }}>Phụ đề video</div>
                  <div style={{ fontSize: "11px", color: "#71717a" }}>Hiển thị và in chữ phụ đề lên video khi xuất.</div>
                </div>
                <input 
                  type="checkbox"
                  checked={Boolean(subStyle.is_enabled)}
                  onChange={(e) => setSubStyle({ ...subStyle, is_enabled: e.target.checked ? 1 : 0 })}
                  style={{ width: "18px", height: "18px", accentColor: "#10b981" }}
                />
              </div>

              {/* Preview text input */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Chữ xem trước</label>
                <input 
                  type="text"
                  value="kéo tài liệu vào đây bắt đầu tác phẩm nào"
                  readOnly
                  style={{
                    width: "100%", padding: "8px 12px", background: "#18181b", border: "1px solid #27272a",
                    borderRadius: "6px", color: "#fff", fontSize: "13px"
                  }}
                />
              </div>

              {/* Mẫu có sẵn (8 Presets) */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "6px" }}>MẪU CÓ SẴN</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                  {[
                    { name: "White/Black", primary: "#FFFFFF", bg: "#000000", border: "#000000" },
                    { name: "Yellow/Black", primary: "#FFEE00", bg: "#000000", border: "#000000" },
                    { name: "White Outline", primary: "#FFFFFF", bg: "transparent", border: "#000000" },
                    { name: "Neon Blue", primary: "#38bdf8", bg: "#000000", border: "#0284c7" },
                    { name: "Red Warning", primary: "#ef4444", bg: "#000000", border: "#7f1d1d" },
                    { name: "Yellow Pill", primary: "#facc15", bg: "rgba(0,0,0,0.8)", border: "#000" }
                  ].map((p, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setSubStyle({ ...subStyle, primary_color: p.primary, box_bg_color: p.bg })}
                      style={{
                        height: "44px", background: "#18181b", border: "1px solid #27272a",
                        borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", color: p.primary, fontWeight: "700", fontSize: "14px"
                      }}
                    >
                      Aa
                    </div>
                  ))}
                </div>
              </div>

              {/* Font chữ & Cỡ chữ */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Font chữ</label>
                  <select 
                    value={subStyle.font_family}
                    onChange={(e) => setSubStyle({ ...subStyle, font_family: e.target.value })}
                    style={{ width: "100%", padding: "6px 8px", background: "#18181b", border: "1px solid #27272a", borderRadius: "6px", color: "#fff", fontSize: "12px" }}
                  >
                    <option value="Montserrat">Montserrat</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Inter">Inter</option>
                    <option value="Arial">Arial</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>
                    Cỡ chữ: {subStyle.font_size} px
                  </label>
                  <input 
                    type="range" min="14" max="42" step="1"
                    value={subStyle.font_size}
                    onChange={(e) => setSubStyle({ ...subStyle, font_size: parseInt(e.target.value) })}
                    style={{ width: "100%", accentColor: "#10b981", marginTop: "8px" }}
                  />
                </div>
              </div>

              {/* Định dạng B, U, I, Case */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>ĐỊNH DẠNG</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button 
                    onClick={() => setSubStyle({ ...subStyle, bold: subStyle.bold ? 0 : 1 })}
                    style={{
                      padding: "6px 12px", borderRadius: "4px", border: "1px solid #27272a",
                      background: subStyle.bold ? "#10b981" : "#18181b", color: subStyle.bold ? "#000" : "#fff",
                      fontWeight: "bold", cursor: "pointer"
                    }}
                  >
                    B
                  </button>
                  <button 
                    onClick={() => setSubStyle({ ...subStyle, italic: subStyle.italic ? 0 : 1 })}
                    style={{
                      padding: "6px 12px", borderRadius: "4px", border: "1px solid #27272a",
                      background: subStyle.italic ? "#10b981" : "#18181b", color: subStyle.italic ? "#000" : "#fff",
                      fontStyle: "italic", cursor: "pointer"
                    }}
                  >
                    I
                  </button>
                  <button 
                    onClick={() => setSubStyle({ ...subStyle, underline: subStyle.underline ? 0 : 1 })}
                    style={{
                      padding: "6px 12px", borderRadius: "4px", border: "1px solid #27272a",
                      background: subStyle.underline ? "#10b981" : "#18181b", color: subStyle.underline ? "#000" : "#fff",
                      textDecoration: "underline", cursor: "pointer"
                    }}
                  >
                    U
                  </button>
                  <button 
                    onClick={() => setSubStyle({ ...subStyle, text_case: subStyle.text_case === "UPPERCASE" ? "DEFAULT" : "UPPERCASE" })}
                    style={{
                      padding: "6px 12px", borderRadius: "4px", border: "1px solid #27272a",
                      background: subStyle.text_case === "UPPERCASE" ? "#10b981" : "#18181b", color: subStyle.text_case === "UPPERCASE" ? "#000" : "#fff",
                      fontWeight: "bold", cursor: "pointer"
                    }}
                  >
                    TT
                  </button>
                </div>
              </div>

              {/* Màu sắc & Hiệu ứng */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "11px", color: "#a1a1aa" }}>MÀU SẮC & HIỆU ỨNG</label>
                
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px" }}>Màu chữ</span>
                  <input 
                    type="color" 
                    value={subStyle.primary_color}
                    onChange={(e) => setSubStyle({ ...subStyle, primary_color: e.target.value })}
                    style={{ background: "transparent", border: "none", width: "32px", height: "24px", cursor: "pointer" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px" }}>Màu viền & Độ dày</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input 
                      type="color" 
                      value={subStyle.outline_color}
                      onChange={(e) => setSubStyle({ ...subStyle, outline_color: e.target.value })}
                      style={{ background: "transparent", border: "none", width: "32px", height: "24px", cursor: "pointer" }}
                    />
                    <input 
                      type="range" min="0" max="6" step="0.5"
                      value={subStyle.outline_width}
                      onChange={(e) => setSubStyle({ ...subStyle, outline_width: parseFloat(e.target.value) })}
                      style={{ width: "80px", accentColor: "#10b981" }}
                    />
                    <span style={{ fontSize: "11px", width: "25px" }}>{subStyle.outline_width}px</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px" }}>Nền chữ & Độ mờ</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input 
                      type="checkbox"
                      checked={Boolean(subStyle.box_bg_enabled)}
                      onChange={(e) => setSubStyle({ ...subStyle, box_bg_enabled: e.target.checked ? 1 : 0 })}
                      style={{ accentColor: "#10b981" }}
                    />
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={subStyle.box_bg_opacity}
                      onChange={(e) => setSubStyle({ ...subStyle, box_bg_opacity: parseFloat(e.target.value) })}
                      style={{ width: "80px", accentColor: "#10b981" }}
                    />
                    <span style={{ fontSize: "11px", width: "35px" }}>{Math.round(subStyle.box_bg_opacity * 100)}%</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px" }}>Khoảng cách đáy (Margin V)</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input 
                      type="range" min="20" max="200" step="5"
                      value={subStyle.margin_v}
                      onChange={(e) => setSubStyle({ ...subStyle, margin_v: parseInt(e.target.value) })}
                      style={{ width: "100px", accentColor: "#10b981" }}
                    />
                    <span style={{ fontSize: "11px", width: "35px" }}>{subStyle.margin_v}px</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: LÀM MỜ (BLUR & DELOGO) */}
          {activeTab === "blur" && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "600" }}>LÀM MỜ ({blurRegions.length})</h3>
                </div>
                <button 
                  onClick={handleAddBlurRegion}
                  style={{
                    background: "#10b981", color: "#000", border: "none", padding: "6px 12px",
                    borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer"
                  }}
                >
                  + Thêm vùng
                </button>
              </div>

              {/* Blur Mode Switch matching 4KStudio */}
              <div style={{
                background: "#18181b", padding: "12px", borderRadius: "8px", border: "1px solid #27272a"
              }}>
                <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px" }}>LÀM MỜ PHỤ ĐỀ GỐC</div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <button 
                    onClick={() => setBlurMode("WHEN_SUBTITLE_ACTIVE")}
                    style={{
                      flex: 1, padding: "8px", borderRadius: "6px", border: "none",
                      background: blurMode === "WHEN_SUBTITLE_ACTIVE" ? "#27272a" : "transparent",
                      color: blurMode === "WHEN_SUBTITLE_ACTIVE" ? "#fff" : "#a1a1aa",
                      fontSize: "12px", fontWeight: "600", cursor: "pointer"
                    }}
                  >
                    Khi phụ đề hiện
                  </button>
                  <button 
                    onClick={() => setBlurMode("ALWAYS")}
                    style={{
                      flex: 1, padding: "8px", borderRadius: "6px", border: "none",
                      background: blurMode === "ALWAYS" ? "#27272a" : "transparent",
                      color: blurMode === "ALWAYS" ? "#fff" : "#a1a1aa",
                      fontSize: "12px", fontWeight: "600", cursor: "pointer"
                    }}
                  >
                    Suốt video
                  </button>
                </div>
                <div style={{ fontSize: "11px", color: "#71717a" }}>
                  Chỉ làm mờ lúc phụ đề gốc xuất hiện (sớm/muộn 0,5 giây). Đổi chế độ sẽ thay các vùng phụ đề tự động; vùng bạn tự vẽ được giữ nguyên.
                </div>
              </div>

              {/* Blur Regions list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {blurRegions.map((region, idx) => (
                  <div key={region.id || idx} style={{
                    padding: "12px", background: "#18181b", borderRadius: "8px", border: "1px solid #27272a"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "600", color: "#84cc16" }}>
                        #{idx + 1} • {formatTimecode(region.start_sec * 1000)} → {formatTimecode(region.end_sec * 1000)}
                      </span>
                      <button 
                        onClick={() => handleDeleteBlurRegion(idx)}
                        style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", fontSize: "11px" }}>
                      <span>Độ mờ (Blur Strength)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input 
                          type="range" min="5" max="40" step="1"
                          value={region.blur_strength || 15}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setBlurRegions(blurRegions.map((r, i) => i === idx ? { ...r, blur_strength: val } : r));
                          }}
                          style={{ width: "80px", accentColor: "#84cc16" }}
                        />
                        <span>{region.blur_strength || 15} px</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                      <div>
                        <span style={{ color: "#71717a" }}>Bắt đầu (giây)</span>
                        <input 
                          type="number" step="0.1"
                          value={region.start_sec}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setBlurRegions(blurRegions.map((r, i) => i === idx ? { ...r, start_sec: val } : r));
                          }}
                          style={{ width: "100%", padding: "4px 8px", background: "#27272a", border: "1px solid #3f3f46", borderRadius: "4px", color: "#fff", marginTop: "2px" }}
                        />
                      </div>
                      <div>
                        <span style={{ color: "#71717a" }}>Kết thúc (giây)</span>
                        <input 
                          type="number" step="0.1"
                          value={region.end_sec}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setBlurRegions(blurRegions.map((r, i) => i === idx ? { ...r, end_sec: val } : r));
                          }}
                          style={{ width: "100%", padding: "4px 8px", background: "#27272a", border: "1px solid #3f3f46", borderRadius: "4px", color: "#fff", marginTop: "2px" }}
                        />
                      </div>
                    </div>

                  </div>
                ))}
              </div>

            </div>
          )}

          {/* TAB 5: LOGO */}
          {activeTab === "logo" && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "600" }}>LOGO</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#a1a1aa" }}>
                  Chưa có Logo nào. Thêm logo chữ hoặc tải ảnh lên để gắn nhận diện kênh của bạn lên video.
                </p>
              </div>

              <div style={{
                background: "#18181b", padding: "16px", borderRadius: "8px", border: "1px solid #27272a",
                display: "flex", flexDirection: "column", gap: "12px"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>Bật Watermark Logo</span>
                  <input 
                    type="checkbox"
                    checked={Boolean(logoSettings.is_enabled)}
                    onChange={(e) => setLogoSettings({ ...logoSettings, is_enabled: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: "#10b981" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Nội dung Logo Chữ</label>
                  <input 
                    type="text"
                    placeholder="vd: @KenhCuaToi"
                    value={logoSettings.text_content}
                    onChange={(e) => setLogoSettings({ ...logoSettings, text_content: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", background: "#27272a", border: "1px solid #3f3f46", borderRadius: "6px", color: "#fff" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Độ mờ (Opacity)</label>
                  <input 
                    type="range" min="0.2" max="1" step="0.05"
                    value={logoSettings.opacity}
                    onChange={(e) => setLogoSettings({ ...logoSettings, opacity: parseFloat(e.target.value) })}
                    style={{ width: "100%", accentColor: "#10b981" }}
                  />
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Export & Asset Download Modal */}
      <DubbingExportModal 
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        project={project}
        onProjectUpdated={loadProjectData}
      />

    </div>
  );
}
