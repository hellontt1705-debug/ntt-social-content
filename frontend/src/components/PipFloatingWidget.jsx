import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import { getThumbnailSrc } from "../api";

export default function PipFloatingWidget({
  isOpen,
  onClose,
  categories = [],
  activeTasks = [],
  recentVideos = [],
  onStartSingleDownload,
  onClearCompleted,
}) {
  const [pipWindow, setPipWindow] = useState(null);
  const [url, setUrl] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [syncToDrive, setSyncToDrive] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState("");
  const [detectedPlatform, setDetectedPlatform] = useState("web");
  const [activeTab, setActiveTab] = useState("download"); // "download" | "progress" | "history"
  const [isCompact, setIsCompact] = useState(false);
  const [windowHeight, setWindowHeight] = useState(600);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // References to track download initiated from this PiP instance
  const mySubmittedTaskId = useRef(null);
  const mySubmittedUrl = useRef("");
  const lastClipboardText = useRef("");
  const progressBoxRef = useRef(null);

  // Detect platform dynamically from URL
  useEffect(() => {
    const u = (url || "").toLowerCase();
    if (u.includes("tiktok.com")) setDetectedPlatform("tiktok");
    else if (u.includes("x.com") || u.includes("twitter.com")) setDetectedPlatform("x");
    else if (u.includes("douyin.com")) setDetectedPlatform("douyin");
    else if (u.includes("youtube.com") || u.includes("youtu.be")) setDetectedPlatform("youtube");
    else if (u.includes("facebook.com") || u.includes("fb.watch")) setDetectedPlatform("facebook");
    else if (u.includes("instagram.com")) setDetectedPlatform("instagram");
    else setDetectedPlatform("web");
  }, [url]);

  // Derived Task States (Reactive to all activeTasks from WebSocket)
  const totalTasks = activeTasks.length;
  const completedTasks = useMemo(
    () => activeTasks.filter((t) => t.isCompleted || (t.percent || 0) >= 100),
    [activeTasks]
  );
  const errorTasks = useMemo(() => activeTasks.filter((t) => t.isError), [activeTasks]);
  const runningTasks = useMemo(
    () => activeTasks.filter((t) => !t.isCompleted && !t.isError && (t.percent || 0) < 100),
    [activeTasks]
  );
  const downloadingTasks = useMemo(
    () => runningTasks.filter((t) => (t.percent || 0) > 0 && !t.status?.toLowerCase().includes("chờ")),
    [runningTasks]
  );
  const waitingTasks = useMemo(
    () => runningTasks.filter((t) => (t.percent || 0) === 0 || t.status?.toLowerCase().includes("chờ")),
    [runningTasks]
  );

  const totalPercent = totalTasks > 0
    ? Math.round(activeTasks.reduce((sum, t) => sum + (t.percent || 0), 0) / totalTasks)
    : 0;

  // Identify which task to display in the primary progress card
  const myActiveTask = mySubmittedTaskId.current
    ? activeTasks.find((t) => t.task_id === mySubmittedTaskId.current)
    : null;

  const activelyDownloadingTask = downloadingTasks[0] || runningTasks[0] || null;

  const displayTask =
    myActiveTask ||
    activelyDownloadingTask ||
    (completedTasks.length > 0 ? completedTasks[completedTasks.length - 1] : null) ||
    (errorTasks.length > 0 ? errorTasks[errorTasks.length - 1] : null);

  const hasRunningTasks = runningTasks.length > 0;
  const isAllBatchCompleted = totalTasks > 0 && runningTasks.length === 0 && completedTasks.length === totalTasks;

  // Read Clipboard with user-friendly feedback
  const readClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setClipboardNotice("Trình duyệt chưa hỗ trợ đọc Clipboard.");
        setTimeout(() => setClipboardNotice(""), 3000);
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const clean = text.trim();
        if (clean.startsWith("http://") || clean.startsWith("https://")) {
          lastClipboardText.current = clean;
          setUrl(clean);
          let platName = "video";
          if (clean.includes("tiktok.com")) platName = "TikTok";
          else if (clean.includes("douyin.com")) platName = "Douyin";
          else if (clean.includes("x.com") || clean.includes("twitter.com")) platName = "X / Twitter";
          else if (clean.includes("youtube.com") || clean.includes("youtu.be")) platName = "YouTube";
          else if (clean.includes("facebook.com")) platName = "Facebook";
          else if (clean.includes("instagram.com")) platName = "Instagram";

          setClipboardNotice(`✓ Đã nhận link ${platName}!`);
          setTimeout(() => setClipboardNotice(""), 3000);
        } else {
          setClipboardNotice("⚠️ Clipboard không chứa liên kết http/https!");
          setTimeout(() => setClipboardNotice(""), 3000);
        }
      } else {
        setClipboardNotice("⚠️ Clipboard hiện đang trống!");
        setTimeout(() => setClipboardNotice(""), 3000);
      }
    } catch (e) {
      setClipboardNotice("⚠️ Vui lòng cấp quyền đọc Clipboard khi trình duyệt hỏi.");
      setTimeout(() => setClipboardNotice(""), 4000);
    }
  };

  // Open Document Picture-in-Picture window with Responsive handlers
  useEffect(() => {
    let currentWin = null;

    async function initPip() {
      if (!isOpen) {
        if (pipWindow) {
          try {
            pipWindow.close();
          } catch (e) {}
          setPipWindow(null);
        }
        return;
      }

      if (pipWindow && !pipWindow.closed) return;

      try {
        if ("documentPictureInPicture" in window) {
          const win = await window.documentPictureInPicture.requestWindow({
            width: 410,
            height: 590,
          });
          currentWin = win;

          // Copy styles from main window to PiP window
          [...document.styleSheets].forEach((sheet) => {
            try {
              const cssRules = [...sheet.cssRules].map((r) => r.cssText).join("\n");
              const styleEl = win.document.createElement("style");
              styleEl.textContent = cssRules;
              win.document.head.appendChild(styleEl);
            } catch (err) {
              if (sheet.href) {
                const linkEl = win.document.createElement("link");
                linkEl.rel = "stylesheet";
                linkEl.href = sheet.href;
                win.document.head.appendChild(linkEl);
              }
            }
          });

          // Custom responsive styles
          const customStyle = win.document.createElement("style");
          customStyle.textContent = `
            html, body {
              margin: 0;
              padding: 0;
              height: 100%;
              width: 100%;
              background: #0d0f17;
              color: #ffffff;
              overflow-x: hidden;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            ::-webkit-scrollbar {
              width: 5px;
            }
            ::-webkit-scrollbar-track {
              background: rgba(0, 0, 0, 0.25);
            }
            ::-webkit-scrollbar-thumb {
              background: rgba(139, 92, 246, 0.45);
              border-radius: 4px;
            }
            ::-webkit-scrollbar-thumb:hover {
              background: rgba(139, 92, 246, 0.75);
            }
            @keyframes pulseGlow {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.75; transform: scale(1.04); }
            }
            @keyframes spinSlow {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `;
          win.document.head.appendChild(customStyle);

          // Listen for resize to adjust compact mode
          const handleResize = () => {
            const h = win.innerHeight;
            const w = win.innerWidth;
            setWindowHeight(h);
            setIsCompact(h < 490 || w < 350);
          };
          win.addEventListener("resize", handleResize);
          handleResize();

          // Listen for close
          win.addEventListener("pagehide", () => {
            setPipWindow(null);
            onClose();
          });

          // Focus listener
          win.addEventListener("focus", () => {
            // Auto check clipboard if input is empty
            if (!url) {
              readClipboard();
            }
          });

          setPipWindow(win);
        } else {
          // Fallback popup window
          const win = window.open(
            "",
            "SocialContentPiP",
            "width=410,height=590,menubar=no,toolbar=no,location=no,status=no"
          );
          if (win) {
            currentWin = win;
            win.document.body.style.margin = "0";
            win.document.body.style.background = "#0d0f17";
            win.document.body.style.color = "#ffffff";
            win.addEventListener("beforeunload", () => {
              setPipWindow(null);
              onClose();
            });
            setPipWindow(win);
          }
        }
      } catch (err) {
        console.error("Lỗi khi mở Document PiP:", err);
        alert("Không thể mở cửa sổ nổi PiP. Vui lòng thử lại!");
        onClose();
      }
    }

    initPip();

    return () => {
      if (currentWin && !currentWin.closed) {
        try {
          currentWin.close();
        } catch (e) {}
      }
    };
  }, [isOpen]);

  if (!isOpen || !pipWindow) return null;

  // Handle Download Request
  const handleDownload = async () => {
    if (!url || !url.trim()) {
      setClipboardNotice("⚠️ Vui lòng dán hoặc nhập liên kết video!");
      setTimeout(() => setClipboardNotice(""), 3000);
      return;
    }

    const cleanUrl = url.trim();
    mySubmittedUrl.current = cleanUrl;
    setIsSubmitting(true);

    try {
      if (onStartSingleDownload) {
        const res = await onStartSingleDownload(cleanUrl, categoryId, syncToDrive, isPrivate);
        if (res && res.task_id) {
          mySubmittedTaskId.current = res.task_id;
        }
      }

      // Clear input so user is ready to paste the next video immediately
      setUrl("");
      setClipboardNotice("🚀 Đã thêm video vào hàng đợi tải thành công!");
      setTimeout(() => setClipboardNotice(""), 3500);

      // Scroll progress card into view
      setTimeout(() => {
        if (progressBoxRef.current) {
          progressBoxRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 150);
    } catch (err) {
      setClipboardNotice(`❌ Lỗi gửi yêu cầu: ${err.message || "Thất bại"}`);
      setTimeout(() => setClipboardNotice(""), 4000);
    } finally {
      setTimeout(() => setIsSubmitting(false), 800);
    }
  };

  const content = (
    <div
      style={{
        padding: isCompact ? "10px 12px" : "14px 16px",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        background: "linear-gradient(180deg, #131522 0%, #0d0f17 100%)",
      }}
    >
      {/* 1. Header Bar (Always pinned at top) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isCompact ? "8px" : "12px",
          paddingBottom: isCompact ? "6px" : "8px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: isCompact ? "24px" : "28px",
              height: isCompact ? "24px" : "28px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 10px rgba(139, 92, 246, 0.6)",
              flexShrink: 0,
            }}
          >
            <Icon name="sparkles" size={isCompact ? 12 : 14} color="#fff" />
          </div>
          <div>
            <div
              style={{
                fontSize: isCompact ? "9px" : "10px",
                fontWeight: 800,
                color: "#c084fc",
                letterSpacing: "0.5px",
              }}
            >
              ALWAYS-ON-TOP
            </div>
            <div
              style={{
                fontSize: isCompact ? "12px" : "13.5px",
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.2,
              }}
            >
              SocialContent OS Mini
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Header Status Badge */}
          {hasRunningTasks ? (
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: "#38bdf8",
                background: "rgba(56, 189, 248, 0.15)",
                padding: "3px 7px",
                borderRadius: "6px",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                animation: "pulseGlow 2s infinite ease-in-out",
              }}
              title={totalTasks > 1 ? `Đang tải ${completedTasks.length}/${totalTasks} video` : "Đang tải video..."}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#38bdf8",
                  boxShadow: "0 0 6px #38bdf8",
                }}
              />
              {totalTasks > 1
                ? `${completedTasks.length}/${totalTasks} (${totalPercent}%)`
                : `${displayTask?.percent || 0}%`}
            </span>
          ) : isAllBatchCompleted ? (
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.15)",
                padding: "3px 7px",
                borderRadius: "6px",
                border: "1px solid rgba(16, 185, 129, 0.3)",
              }}
            >
              ✓ Đã xong ({totalTasks})
            </span>
          ) : null}

          <button
            onClick={() => {
              if (pipWindow) pipWindow.close();
              onClose();
            }}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "rgba(255, 255, 255, 0.7)",
              width: isCompact ? "22px" : "26px",
              height: isCompact ? "22px" : "26px",
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
            }}
            title="Đóng cửa sổ nổi"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 2. Responsive Tabs (Tải Video | Tiến Trình | Lịch Sử) */}
      <div
        style={{
          display: "flex",
          background: "rgba(0, 0, 0, 0.35)",
          padding: "3px",
          borderRadius: "10px",
          marginBottom: isCompact ? "8px" : "12px",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setActiveTab("download")}
          style={{
            flex: 1,
            padding: isCompact ? "5px 6px" : "6px 8px",
            border: "none",
            borderRadius: "7px",
            background: activeTab === "download" ? "rgba(139, 92, 246, 0.3)" : "transparent",
            color: activeTab === "download" ? "#fff" : "rgba(255, 255, 255, 0.6)",
            fontWeight: activeTab === "download" ? 700 : 500,
            fontSize: isCompact ? "11px" : "11.5px",
            cursor: "pointer",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
          }}
        >
          <span>⚡ Tải Video</span>
        </button>

        <button
          onClick={() => setActiveTab("progress")}
          style={{
            flex: 1.2,
            padding: isCompact ? "5px 6px" : "6px 8px",
            border: "none",
            borderRadius: "7px",
            background: activeTab === "progress" ? "rgba(56, 189, 248, 0.3)" : "transparent",
            color: activeTab === "progress" ? "#38bdf8" : hasRunningTasks ? "#38bdf8" : "rgba(255, 255, 255, 0.6)",
            fontWeight: activeTab === "progress" ? 700 : 500,
            fontSize: isCompact ? "11px" : "11.5px",
            cursor: "pointer",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
          }}
        >
          <span>📊 Tiến Trình</span>
          {hasRunningTasks && (
            <span
              style={{
                background: "#38bdf8",
                color: "#0f172a",
                borderRadius: "10px",
                fontSize: "10px",
                fontWeight: 800,
                padding: "0 5px",
                lineHeight: "15px",
                height: "15px",
              }}
            >
              {runningTasks.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("history")}
          style={{
            flex: 1,
            padding: isCompact ? "5px 6px" : "6px 8px",
            border: "none",
            borderRadius: "7px",
            background: activeTab === "history" ? "rgba(236, 72, 153, 0.3)" : "transparent",
            color: activeTab === "history" ? "#fff" : "rgba(255, 255, 255, 0.6)",
            fontWeight: activeTab === "history" ? 700 : 500,
            fontSize: isCompact ? "11px" : "11.5px",
            cursor: "pointer",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
          }}
        >
          <span>🕒 Lịch Sử</span>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>({Math.min(recentVideos.length, 99)})</span>
        </button>
      </div>

      {/* 3. Scrollable Main Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: isCompact ? "8px" : "12px",
          paddingRight: "2px",
        }}
      >
        {/* --- TAB 1: DOWNLOAD FORM --- */}
        {activeTab === "download" && (
          <>
            {/* URL Input Box */}
            <div
              style={{
                background: "rgba(18, 20, 30, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "12px",
                padding: isCompact ? "8px 10px" : "10px 12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: isCompact ? "9.5px" : "10.5px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 6px",
                    borderRadius: "5px",
                    background:
                      detectedPlatform === "tiktok"
                        ? "rgba(255, 0, 80, 0.25)"
                        : detectedPlatform === "x"
                        ? "rgba(29, 155, 240, 0.25)"
                        : detectedPlatform === "douyin"
                        ? "rgba(244, 63, 94, 0.25)"
                        : detectedPlatform === "youtube"
                        ? "rgba(239, 68, 68, 0.25)"
                        : "rgba(139, 92, 246, 0.25)",
                    color:
                      detectedPlatform === "tiktok"
                        ? "#ff3b6c"
                        : detectedPlatform === "x"
                        ? "#38bdf8"
                        : detectedPlatform === "douyin"
                        ? "#fb7185"
                        : detectedPlatform === "youtube"
                        ? "#f87171"
                        : "#c084fc",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  {detectedPlatform.toUpperCase()}
                </span>

                <div style={{ display: "flex", gap: "6px" }}>
                  {url && (
                    <button
                      onClick={() => setUrl("")}
                      style={{
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "rgba(255, 255, 255, 0.7)",
                        fontSize: isCompact ? "10px" : "11px",
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: "5px",
                        cursor: "pointer",
                      }}
                      title="Xóa link đang nhập"
                    >
                      ✕ Xóa
                    </button>
                  )}
                  <button
                    onClick={readClipboard}
                    style={{
                      background: "rgba(139, 92, 246, 0.25)",
                      border: "1px solid rgba(139, 92, 246, 0.45)",
                      color: "#c084fc",
                      fontSize: isCompact ? "10px" : "11px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    📋 Dán Clipboard
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleDownload();
                }}
                placeholder="Dán link TikTok, Douyin, X, YouTube, Instagram..."
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  fontSize: isCompact ? "11.5px" : "12.5px",
                  outline: "none",
                }}
              />

              {clipboardNotice && (
                <div
                  style={{
                    fontSize: "10.5px",
                    color: clipboardNotice.startsWith("✓")
                      ? "#10b981"
                      : clipboardNotice.startsWith("🚀")
                      ? "#38bdf8"
                      : "#fbbf24",
                    marginTop: "5px",
                    fontWeight: 600,
                  }}
                >
                  {clipboardNotice}
                </div>
              )}
            </div>

            {/* Category Dropdown */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: isCompact ? "9.5px" : "10px",
                  fontWeight: 700,
                  color: "rgba(255, 255, 255, 0.6)",
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                LƯU VÀO DANH MỤC
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(18, 20, 30, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "9px",
                  color: "#ffffff",
                  padding: isCompact ? "6px 8px" : "8px 10px",
                  fontSize: isCompact ? "12px" : "12.5px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="all">📂 Tất cả video (Mặc định)</option>
                {categories
                  .filter((c) => c.id !== "all")
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name || cat.id}
                    </option>
                  ))}
              </select>
            </div>

            {/* Options Row */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: isCompact ? "11px" : "11.5px",
                  color: "rgba(255, 255, 255, 0.8)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={syncToDrive}
                  onChange={(e) => setSyncToDrive(e.target.checked)}
                  style={{ accentColor: "#8b5cf6" }}
                />
                <span>Đồng bộ Drive</span>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: isCompact ? "11px" : "11.5px",
                  color: "rgba(255, 255, 255, 0.8)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  style={{ accentColor: "#8b5cf6" }}
                />
                <span>Kho riêng tư</span>
              </label>
            </div>

            {/* Action Button (Always reactive, supports queueing) */}
            <button
              onClick={handleDownload}
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: isCompact ? "10px" : "12px",
                borderRadius: "10px",
                background: isSubmitting
                  ? "rgba(139, 92, 246, 0.35)"
                  : "linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: isCompact ? "12.5px" : "13.5px",
                border: "none",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                boxShadow: isSubmitting ? "none" : "0 4px 16px rgba(139, 92, 246, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s ease",
              }}
            >
              <span>
                {isSubmitting
                  ? "⏳ Đang gửi yêu cầu tải..."
                  : hasRunningTasks
                  ? `⚡ THÊM VÀO HÀNG ĐỢI TẢI (${runningTasks.length} đang xử lý)`
                  : "⚡ TẢI VỀ KHO NGAY"}
              </span>
            </button>

            {/* Realtime Progress Card (Multi-task aware, never stuck!) */}
            {(hasRunningTasks || displayTask || totalTasks > 0) && (
              <div
                ref={progressBoxRef}
                style={{
                  background: isAllBatchCompleted
                    ? "rgba(16, 185, 129, 0.12)"
                    : displayTask?.isError
                    ? "rgba(239, 68, 68, 0.12)"
                    : "rgba(25, 28, 42, 0.95)",
                  border: `1px solid ${
                    isAllBatchCompleted
                      ? "rgba(16, 185, 129, 0.4)"
                      : displayTask?.isError
                      ? "rgba(239, 68, 68, 0.4)"
                      : "rgba(139, 92, 246, 0.35)"
                  }`,
                  borderRadius: "12px",
                  padding: isCompact ? "8px 10px" : "11px 13px",
                  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
                  marginTop: "2px",
                }}
              >
                {/* Batch Overview Header if multiple tasks */}
                {totalTasks > 1 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                      paddingBottom: "6px",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#c084fc" }}>
                      📦 TIẾN ĐỘ HÀNG LOẠT: {completedTasks.length}/{totalTasks} video ({totalPercent}%)
                    </span>
                    <span style={{ fontSize: "10.5px", color: "#38bdf8", fontWeight: 600 }}>
                      {hasRunningTasks ? `⚡ Đang tải: ${runningTasks.length}` : "✓ Hoàn thành"}
                    </span>
                  </div>
                )}

                {/* Status line */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: isCompact ? "11px" : "12px",
                      fontWeight: 600,
                      color: isAllBatchCompleted
                        ? "#10b981"
                        : displayTask?.isError
                        ? "#ef4444"
                        : "#ffffff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "260px",
                    }}
                  >
                    {isAllBatchCompleted
                      ? `✅ Đã tải xong ${completedTasks.length}/${totalTasks} video vào kho!`
                      : displayTask?.isError
                      ? `❌ ${displayTask.error || "Tải video thất bại"}`
                      : displayTask?.title && displayTask.title !== "Đang chuẩn bị..." && displayTask.title !== "Đang kết nối..."
                      ? displayTask.title
                      : displayTask?.status || "Đang tải video..."}
                  </span>
                  <span
                    style={{
                      fontSize: isCompact ? "12px" : "13px",
                      fontWeight: 700,
                      color: isAllBatchCompleted
                        ? "#10b981"
                        : displayTask?.isError
                        ? "#ef4444"
                        : "#38bdf8",
                    }}
                  >
                    {isAllBatchCompleted ? "100%" : `${totalTasks > 1 ? totalPercent : displayTask?.percent || 0}%`}
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    width: "100%",
                    height: isCompact ? "6px" : "7px",
                    background: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "9999px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${isAllBatchCompleted ? 100 : totalTasks > 1 ? totalPercent : displayTask?.percent || 0}%`,
                      height: "100%",
                      background: isAllBatchCompleted
                        ? "#10b981"
                        : displayTask?.isError
                        ? "#ef4444"
                        : "linear-gradient(90deg, #8b5cf6, #ec4899, #38bdf8)",
                      borderRadius: "9999px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                {/* Sub status row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "rgba(255, 255, 255, 0.55)",
                    marginTop: "5px",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>
                    {displayTask?.status || (isAllBatchCompleted ? "Đã lưu vào Kho Video" : "Đang xử lý...")}
                  </span>
                  <span>
                    {displayTask?.speed ? `Tốc độ: ${displayTask.speed}` : displayTask?.eta ? `Còn lại: ${displayTask.eta}` : ""}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- TAB 2: DETAILED PROGRESS TAB --- */}
        {activeTab === "progress" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Batch / Single Progress Header */}
            {totalTasks > 0 ? (
              <>
                <div
                  style={{
                    background: "rgba(25, 28, 42, 0.95)",
                    border: "1px solid rgba(139, 92, 246, 0.35)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#fff" }}>
                      TIẾN ĐỘ TẢI XUỐNG: {completedTasks.length}/{totalTasks} Video
                    </div>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 800,
                        color: isAllBatchCompleted ? "#10b981" : "#38bdf8",
                      }}
                    >
                      {totalPercent}%
                    </div>
                  </div>

                  {/* Overall bar */}
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      background: "rgba(255, 255, 255, 0.12)",
                      borderRadius: "9999px",
                      overflow: "hidden",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: `${totalPercent}%`,
                        height: "100%",
                        background: isAllBatchCompleted
                          ? "#10b981"
                          : "linear-gradient(90deg, #8b5cf6, #ec4899, #38bdf8)",
                        borderRadius: "9999px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "10.5px",
                      color: "rgba(255, 255, 255, 0.65)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "#38bdf8" }}>⚡ {runningTasks.length} đang tải</span>
                      <span>•</span>
                      <span style={{ color: "#fbbf24" }}>⏳ {waitingTasks.length} chờ</span>
                      <span>•</span>
                      <span style={{ color: "#34d399" }}>✅ {completedTasks.length} xong</span>
                    </div>

                    {completedTasks.length > 0 && onClearCompleted && (
                      <button
                        onClick={onClearCompleted}
                        style={{
                          background: "rgba(255, 255, 255, 0.08)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          color: "rgba(255, 255, 255, 0.7)",
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "2px 7px",
                          borderRadius: "5px",
                          cursor: "pointer",
                        }}
                        title="Xóa các mục đã xong khỏi danh sách"
                      >
                        🗑️ Xóa đã xong
                      </button>
                    )}
                  </div>
                </div>

                {/* Individual Task List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "rgba(255, 255, 255, 0.5)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    DANH SÁCH CHI TIẾT TỪNG VIDEO ({activeTasks.length})
                  </div>

                  {activeTasks.map((t, idx) => {
                    const isDone = t.isCompleted || (t.percent || 0) >= 100;
                    const isErr = t.isError;
                    const isRunning = !isDone && !isErr;

                    return (
                      <div
                        key={t.task_id || idx}
                        style={{
                          background: isDone
                            ? "rgba(16, 185, 129, 0.08)"
                            : isErr
                            ? "rgba(239, 68, 68, 0.08)"
                            : "rgba(255, 255, 255, 0.04)",
                          border: `1px solid ${
                            isDone
                              ? "rgba(16, 185, 129, 0.25)"
                              : isErr
                              ? "rgba(239, 68, 68, 0.25)"
                              : isRunning
                              ? "rgba(56, 189, 248, 0.35)"
                              : "rgba(255, 255, 255, 0.08)"
                          }`,
                          borderRadius: "9px",
                          padding: "8px 10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "4px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "11.5px",
                              fontWeight: 600,
                              color: "#ffffff",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "250px",
                            }}
                          >
                            <span style={{ color: "rgba(255,255,255,0.45)", marginRight: "4px" }}>#{idx + 1}</span>
                            {t.title || t.url || `Video #${idx + 1}`}
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: isDone ? "#10b981" : isErr ? "#ef4444" : "#38bdf8",
                            }}
                          >
                            {isDone ? "✓ Xong" : isErr ? "✕ Lỗi" : `${t.percent || 0}%`}
                          </span>
                        </div>

                        {/* Task Mini Progress Bar */}
                        {isRunning && (
                          <div
                            style={{
                              width: "100%",
                              height: "4px",
                              background: "rgba(255, 255, 255, 0.1)",
                              borderRadius: "9999px",
                              overflow: "hidden",
                              margin: "4px 0",
                            }}
                          >
                            <div
                              style={{
                                width: `${t.percent || 10}%`,
                                height: "100%",
                                background: "linear-gradient(90deg, #8b5cf6, #38bdf8)",
                                borderRadius: "9999px",
                              }}
                            />
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "10px",
                            color: "rgba(255, 255, 255, 0.5)",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "210px" }}>
                            {t.status || (isDone ? "Đã lưu vào Kho Video" : "Đang xử lý...")}
                          </span>
                          <span>
                            {t.speed ? `${t.speed}` : t.eta ? `Còn ${t.eta}` : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "rgba(255, 255, 255, 0.45)",
                  padding: "40px 10px",
                  fontSize: "12px",
                }}
              >
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>📥</div>
                Hiện chưa có tiến trình tải nào đang chạy.<br />
                Chuyển sang tab <b>⚡ Tải Video</b> và dán link để tải!
              </div>
            )}
          </div>
        )}

        {/* --- TAB 3: HISTORY TAB --- */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: "rgba(255, 255, 255, 0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              VIDEO TRONG KHO GẦN ĐÂY ({recentVideos.length})
            </div>

            {recentVideos.slice(0, 25).map((vid) => (
              <div
                key={vid.id}
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "10px",
                  padding: "7px 9px",
                }}
              >
                <img
                  src={getThumbnailSrc(vid)}
                  alt=""
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "7px",
                    objectFit: "cover",
                    background: "#1f2230",
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    e.target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100";
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {vid.title || "Video"}
                  </div>
                  <div
                    style={{
                      fontSize: "10.5px",
                      color: "rgba(255, 255, 255, 0.45)",
                      marginTop: "2px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        color: vid.platform === "tiktok" ? "#ff3b6c" : vid.platform === "x" ? "#38bdf8" : "#a855f7",
                        textTransform: "capitalize",
                        fontWeight: 600,
                      }}
                    >
                      {vid.platform || "Video"}
                    </span>
                    <span>•</span>
                    <span>{vid.created_at ? vid.created_at.split("T")[0] : "Vừa tải xong"}</span>
                  </div>
                </div>
              </div>
            ))}

            {(!recentVideos || recentVideos.length === 0) && (
              <div
                style={{
                  textAlign: "center",
                  color: "rgba(255, 255, 255, 0.4)",
                  fontSize: "11.5px",
                  padding: "30px 10px",
                }}
              >
                Chưa có video nào trong kho.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, pipWindow.document.body);
}
