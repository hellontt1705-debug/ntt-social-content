import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import {
  scrapeUrl,
  scanDriveSource,
  checkDeduplication,
  fetchGasCode,
  scanTikTokChannel,
  ingestTikTokChannelVideos,
  fetchTikTokBookmarklet,
  scanDouyinChannel,
  ingestDouyinChannelVideos,
  fetchDouyinBookmarklet,
  fetchLatestChannelIngest
} from "../api";
import { useLanguage } from "../i18n";
import { extractCleanUrl, extractBatchUrls } from "../utils/urlHelper";
import { renderCategorySelectOptions } from "../utils/categoryHelper";

const cleanDisplayStr = (str) => {
  if (!str) return "";
  let s = String(str);
  s = s.replace(/(\x1b|\033)\[[0-9;]*[a-zA-Z]?/g, "");
  s = s.replace(/\[[0-9;]+m/g, "");
  s = s.replace(/^--.*$/, "");
  return s.trim();
};

export default function DownloaderModal({
  isOpen,
  onClose,
  initialTab = "single",
  initialChannelUrl = "",
  initialChannelPlatform = "douyin",
  latestIngestedChannel = null,
  categories,
  onStartSingleDownload,
  onStartBatchDownload,
  activeTasks,
  driveStatus
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState(initialTab || "single");
  const [singleUrl, setSingleUrl] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Channel tab state
  const [channelPlatform, setChannelPlatform] = useState(initialChannelPlatform || "douyin");
  const [channelUrl, setChannelUrl] = useState(initialChannelUrl || "");
  const [channelDateMode, setChannelDateMode] = useState("all"); // "24h", "7_days", "30_days", "custom", "all"
  const [channelStartDate, setChannelStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [channelEndDate, setChannelEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [channelScanning, setChannelScanning] = useState(false);
  const [channelScannedData, setChannelScannedData] = useState(null);
  const [channelError, setChannelError] = useState(null);
  const [selectedChannelUrls, setSelectedChannelUrls] = useState([]);
  const [channelSearchFilter, setChannelSearchFilter] = useState("");
  const [isCopyingBookmarklet, setIsCopyingBookmarklet] = useState(false);
  const [bookmarkletCode, setBookmarkletCode] = useState("");
  const [channelManualPasteOpen, setChannelManualPasteOpen] = useState(false);
  const [channelManualPasteText, setChannelManualPasteText] = useState("");
  const [recentIngestAvailable, setRecentIngestAvailable] = useState(null);
  const [scanGuideModal, setScanGuideModal] = useState(null);
  const [guideCopied, setGuideCopied] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Check recent ingest on modal open & auto-apply if empty
  useEffect(() => {
    if (isOpen) {
      if (initialTab) setTab(initialTab);
      if (initialChannelUrl) {
        setChannelUrl(initialChannelUrl);
        const lower = initialChannelUrl.toLowerCase();
        if (lower.includes("douyin.com") || lower.includes("iesdouyin.com")) {
          setChannelPlatform("douyin");
        } else if (lower.includes("tiktok.com")) {
          setChannelPlatform("tiktok");
        } else if (initialChannelPlatform) {
          setChannelPlatform(initialChannelPlatform);
        }
      }

      fetchLatestChannelIngest().then(res => {
        if (res && res.data && res.data.videos && res.data.videos.length > 0) {
          setRecentIngestAvailable(res.data);
          // If no videos currently loaded, auto-load immediately!
          setChannelScannedData(prev => {
            if (!prev || !prev.videos || prev.videos.length === 0) {
              setSelectedChannelUrls(res.data.videos.map(v => v.url));
              setChannelDateMode("all");
              if (res.data.channel_info?.profile_url) {
                setChannelUrl(res.data.channel_info.profile_url);
              }
              return res.data;
            }
            return prev;
          });
        }
      }).catch(() => {});
    }
  }, [isOpen, initialTab, initialChannelUrl, initialChannelPlatform]);

  // When latestIngestedChannel prop arrives via WebSocket (Realtime broadcast from Douyin/TikTok tab!)
  useEffect(() => {
    if (latestIngestedChannel && latestIngestedChannel.videos && latestIngestedChannel.videos.length > 0) {
      setChannelScannedData(latestIngestedChannel);
      setSelectedChannelUrls(latestIngestedChannel.videos.map(v => v.url));
      setChannelDateMode("all");
      setTab("channel");
      setChannelError(null);
      setScanGuideModal(null);
      if (latestIngestedChannel.channel_info?.profile_url) {
        setChannelUrl(latestIngestedChannel.channel_info.profile_url);
      }
    }
  }, [latestIngestedChannel]);


  // Google Drive tab state
  const [driveUrl, setDriveUrl] = useState("");
  const [driveScraping, setDriveScraping] = useState(false);
  const [driveScrapedData, setDriveScrapedData] = useState(null);
  const [driveError, setDriveError] = useState(null);
  const [selectedDriveUrls, setSelectedDriveUrls] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [isCopyingGas, setIsCopyingGas] = useState(false);
  const driveFileInputRef = useRef(null);

  // Scraped preview state (Single tab)
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState(null);
  const [scrapeError, setScrapeError] = useState(null);

  // Batch URLs state
  const [batchText, setBatchText] = useState("");
  const [syncToDrive, setSyncToDrive] = useState(() => {
    const saved = localStorage.getItem("sync_to_drive_default");
    return saved !== null ? saved === "true" : true;
  });
  const [saveToVault, setSaveToVault] = useState(false);
  const [isCheckingBatchDedup, setIsCheckingBatchDedup] = useState(false);
  const [batchDedupResult, setBatchDedupResult] = useState(null);

  // Single tab analyze
  const handleAnalyze = async () => {
    const clean = extractCleanUrl(singleUrl);
    if (!clean.trim()) return;
    setSingleUrl(clean);
    setIsScraping(true);
    setScrapeError(null);
    try {
      const data = await scrapeUrl(clean.trim());
      setScrapedData(data);
    } catch (err) {
      setScrapeError(err.message || "Lỗi khi phân tích video. Vui lòng kiểm tra lại URL.");
    } finally {
      setIsScraping(false);
    }
  };

  const handleDownloadSingle = () => {
    const clean = extractCleanUrl(singleUrl);
    if (!clean.trim()) return;
    if (scrapedData?.is_folder && scrapedData?.folder_entries?.length > 0) {
      const urls = scrapedData.folder_entries.map((e) => e.url);
      onStartBatchDownload(urls, selectedCategory, syncToDrive, saveToVault);
    } else {
      onStartSingleDownload(clean.trim(), selectedCategory, syncToDrive, saveToVault);
    }
    setSingleUrl("");
    setScrapedData(null);
    onClose();
  };

  // Batch tab download
  const handleDownloadBatch = () => {
    const urls = extractBatchUrls(batchText);

    if (urls.length === 0) return;
    onStartBatchDownload(urls, selectedCategory, syncToDrive, saveToVault);
    setBatchText("");
    setBatchDedupResult(null);
    onClose();
  };

  // Dedicated Google Drive tab analyze
  const handleAnalyzeDrive = async () => {
    if (!driveUrl.trim()) return;
    setDriveScraping(true);
    setDriveError(null);
    setDriveScrapedData(null);
    try {
      const data = await scanDriveSource(driveUrl.trim());
      setDriveScrapedData(data);
      if (data.new_urls && Array.isArray(data.new_urls)) {
        setSelectedDriveUrls(data.new_urls);
      }
    } catch (err) {
      setDriveError(err.message || "Không thể lấy dữ liệu từ link Google Drive này. Hãy đảm bảo link đã được mở quyền xem công khai (Anyone with the link).");
    } finally {
      setDriveScraping(false);
    }
  };

  const handleCopyGasCode = async () => {
    setIsCopyingGas(true);
    try {
      const res = await fetchGasCode();
      if (res.code) {
        await navigator.clipboard.writeText(res.code);
        setScanGuideModal({
          platform: "gas",
          title: "ĐÃ SAO CHÉP MÃ GOOGLE APPS SCRIPT!",
          targetName: "Google Apps Script",
          code: res.code,
          customSteps: [
            { step: 1, gradient: "linear-gradient(135deg, #3b82f6, #6366f1)", title: "Mở tab Google Apps Script", desc: "Chuyển sang tab dự án Google Apps Script của bạn trên trình duyệt." },
            { step: 2, gradient: "linear-gradient(135deg, #ec4899, #8b5cf6)", title: "Dán đè toàn bộ mã mới", desc: "Chọn toàn bộ mã cũ (Ctrl + A) và dán đè mã mới vào (Ctrl + V)." },
            { step: 3, gradient: "linear-gradient(135deg, #10b981, #06b6d4)", title: "Nhấn 'Triển khai mới' (New deployment)", desc: "Chọn loại Ứng dụng web, quyền truy cập 'Bất kỳ ai' rồi lưu lại URL Webhook." }
          ]
        });
      }
    } catch (err) {
      showToast("Lỗi khi lấy mã: " + err.message, "error");
    } finally {
      setIsCopyingGas(false);
    }
  };

  const handleDriveFileUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const regex = /https?:\/\/[^\s<>"'\]\[\}]+/g;
        const matches = text.match(regex) || [];
        const cleanList = matches.map(u => u.replace(/[.,;!?'")]+$/, "")).filter(u => u.includes("."));
        const unique = Array.from(new Set(cleanList));
        if (unique.length === 0) {
          showToast("Không tìm thấy đường dẫn video nào trong file này.", "error");
          return;
        }
        setDriveScraping(true);
        const dedupRes = await checkDeduplication(unique);
        setDriveScrapedData({
          success: true,
          is_drive_source: false,
          folder_name: file.name,
          files_scanned: [{ name: file.name, urls_count: unique.length }],
          total_found: dedupRes.total_scanned,
          new_count: dedupRes.new_count,
          duplicate_count: dedupRes.duplicate_count,
          new_urls: dedupRes.new_urls,
          duplicate_items: dedupRes.duplicate_items,
          message: `Đã đọc file "${file.name}": Tìm thấy ${dedupRes.total_scanned} link video. Lọc được ${dedupRes.new_count} link mới và ${dedupRes.duplicate_count} link đã có trong kho.`
        });
        setSelectedDriveUrls(dedupRes.new_urls);
      } catch (err) {
        showToast("Lỗi khi đọc file: " + err.message, "error");
      } finally {
        setDriveScraping(false);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const toggleSelectDriveUrl = (u) => {
    if (selectedDriveUrls.includes(u)) {
      setSelectedDriveUrls(selectedDriveUrls.filter(item => item !== u));
    } else {
      setSelectedDriveUrls([...selectedDriveUrls, u]);
    }
  };

  const handleDownloadFromDrive = () => {
    if (!driveScrapedData) return;
    const urlsToDownload = selectedDriveUrls.length > 0 ? selectedDriveUrls : (driveScrapedData.new_urls || []);
    if (urlsToDownload.length === 0) {
      showToast("Không có video mới nào được chọn để tải!", "error");
      return;
    }
    onStartBatchDownload(urlsToDownload, selectedCategory, syncToDrive, saveToVault);
    setDriveUrl("");
    setDriveScrapedData(null);
    setSelectedDriveUrls([]);
    onClose();
  };

  // Channel Scan Handler (Douyin & TikTok)
  const handleScanChannel = async () => {
    if (!channelUrl.trim()) return;
    
    // Nếu là Bộ sưu tập TikTok (Collection / Favorites), đây là mục riêng tư bảo mật theo tài khoản.
    // Tự động sao chép mã 1-Click và bật ngay trang Hướng dẫn 3 bước trực quan!
    if (channelUrl.toLowerCase().includes("/collection/")) {
      setChannelError(null);
      setRecentIngestAvailable(null);
      await handleCopyBookmarklet();
      return;
    }

    setChannelScanning(true);
    setChannelError(null);
    setChannelScannedData(null);
    try {
      const isDouyin = channelPlatform === "douyin" || channelUrl.toLowerCase().includes("douyin.com") || channelUrl.toLowerCase().includes("iesdouyin.com");
      const days = channelDateMode === "24h" ? 1 : channelDateMode === "7_days" ? 7 : 30;
      let data;
      if (isDouyin) {
        data = await scanDouyinChannel(
          channelUrl.trim(),
          channelDateMode,
          days,
          channelDateMode === "custom" ? channelStartDate : null,
          channelDateMode === "custom" ? channelEndDate : null
        );
      } else {
        data = await scanTikTokChannel(
          channelUrl.trim(),
          channelDateMode,
          days,
          channelDateMode === "custom" ? channelStartDate : null,
          channelDateMode === "custom" ? channelEndDate : null
        );
      }
      setChannelScannedData(data);
      if (data.videos && Array.isArray(data.videos)) {
        setSelectedChannelUrls(data.videos.map(v => v.url));
      }
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("Bộ sưu tập") || msg.includes("Sao chép mã 1-Click") || msg.includes("collection")) {
        await handleCopyBookmarklet();
      } else {
        setChannelError(msg || "Lỗi khi quét kênh. Hãy kiểm tra lại liên kết hoặc sử dụng Tiện ích 1-Click bên dưới.");
      }
    } finally {
      setChannelScanning(false);
    }
  };

  // Ingest from manual paste
  const handleManualPasteIngest = async () => {
    if (!channelManualPasteText.trim()) return;
    setChannelScanning(true);
    setChannelError(null);
    try {
      let items = [];
      const trimmed = channelManualPasteText.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          items = JSON.parse(trimmed);
        } catch (e) {
          items = extractBatchUrls(trimmed);
        }
      } else {
        items = extractBatchUrls(trimmed);
      }
      
      if (!items || items.length === 0) {
        showToast("Không tìm thấy link video nào trong đoạn văn bản này.", "error");
        setChannelScanning(false);
        return;
      }
      
      const isDouyin = channelPlatform === "douyin" || channelUrl.toLowerCase().includes("douyin") || channelManualPasteText.toLowerCase().includes("douyin");
      let data;
      if (isDouyin) {
        data = await ingestDouyinChannelVideos(
          items,
          channelUrl.trim(),
          "all",
          30,
          null,
          null
        );
      } else {
        data = await ingestTikTokChannelVideos(
          items,
          channelUrl.trim(),
          "all",
          30,
          null,
          null
        );
      }

      // Preserve existing rich channel info if available
      if (channelScannedData?.channel_info) {
        data.channel_info = {
          ...channelScannedData.channel_info,
          ...data.channel_info,
          nickname: (channelScannedData.channel_info.nickname && channelScannedData.channel_info.nickname !== "Kênh Douyin")
            ? channelScannedData.channel_info.nickname
            : (data.channel_info?.nickname || "Kênh Douyin"),
          avatar: channelScannedData.channel_info.avatar || data.channel_info?.avatar || "",
          posts_count: channelScannedData.channel_info.posts_count || (data.videos ? data.videos.length : 0)
        };
      }

      setChannelScannedData(data);
      if (data.videos && Array.isArray(data.videos)) {
        setSelectedChannelUrls(data.videos.map(v => v.url));
      }
      setChannelDateMode("all");
      setChannelManualPasteOpen(false);
    } catch (err) {
      setChannelError(err.message || "Lỗi khi nạp danh sách video.");
    } finally {
      setChannelScanning(false);
    }
  };

  // Copy Bookmarklet / Console Code with robust multi-clipboard fallback
  const handleCopyBookmarklet = async () => {
    setIsCopyingBookmarklet(true);
    try {
      const isDouyin = channelPlatform === "douyin" || channelUrl.toLowerCase().includes("douyin");
      let code = bookmarkletCode;
      if (isDouyin) {
        const res = await fetchDouyinBookmarklet();
        code = res.console_code || (res.bookmarklet ? res.bookmarklet.replace(/^javascript:/, '').trim() : "");
        setBookmarkletCode(code);
        if (code) {
          try {
            await navigator.clipboard.writeText(code);
          } catch (e) {
            const ta = document.createElement("textarea");
            ta.value = code;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
          }
          setChannelManualPasteOpen(true);
          setScanGuideModal({
            platform: "douyin",
            title: "ĐÃ SAO CHÉP MÃ QUÉT KÊNH DOUYIN!",
            targetName: "Douyin (抖音)",
            code: code
          });
        }
      } else {
        const res = await fetchTikTokBookmarklet();
        code = res.console_code || (res.bookmarklet ? res.bookmarklet.replace(/^javascript:/, '').trim() : "");
        setBookmarkletCode(code);
        if (code) {
          try {
            await navigator.clipboard.writeText(code);
          } catch (e) {
            const ta = document.createElement("textarea");
            ta.value = code;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
          }
          setChannelManualPasteOpen(true);
          const isCol = channelUrl.toLowerCase().includes("/collection/");
          setScanGuideModal({
            platform: "tiktok",
            title: isCol ? "HƯỚNG DẪN QUÉT BỘ SƯU TẬP TIKTOK 1-CLICK" : "HƯỚNG DẪN QUÉT KÊNH TIKTOK 1-CLICK",
            targetName: isCol ? "Bộ sưu tập TikTok" : "TikTok",
            code: code
          });
        }
      }
    } catch (err) {
      setChannelError("Lỗi khi sao chép mã quét: " + err.message);
    } finally {
      setIsCopyingBookmarklet(false);
    }
  };

  // Dynamic client-side date and search filtering
  const displayChannelVideos = useMemo(() => {
    if (!channelScannedData || !channelScannedData.videos) return [];
    let list = channelScannedData.videos;
    const nowTs = Math.floor(Date.now() / 1000);

    if (channelDateMode === "24h") {
      list = list.filter(v => (v.created_at && (nowTs - v.created_at <= 86400)) || v.hours_ago <= 24 || v.days_ago === 0);
    } else if (channelDateMode === "7_days") {
      list = list.filter(v => (v.created_at && (nowTs - v.created_at <= 7 * 86400)) || v.days_ago <= 7);
    } else if (channelDateMode === "30_days") {
      list = list.filter(v => (v.created_at && (nowTs - v.created_at <= 30 * 86400)) || v.days_ago <= 30);
    } else if (channelDateMode === "custom") {
      if (channelStartDate && channelEndDate) {
        const startTs = new Date(channelStartDate + "T00:00:00").getTime() / 1000;
        const endTs = new Date(channelEndDate + "T23:59:59").getTime() / 1000;
        list = list.filter(v => v.created_at >= startTs && v.created_at <= endTs);
      }
    }
    // Search query
    if (channelSearchFilter.trim()) {
      const q = channelSearchFilter.toLowerCase();
      list = list.filter(v => (v.title || "").toLowerCase().includes(q) || (v.uploader || "").toLowerCase().includes(q));
    }
    return list;
  }, [channelScannedData, channelDateMode, channelStartDate, channelEndDate, channelSearchFilter]);

  // Select / Deselect channel video
  const toggleSelectChannelUrl = (u) => {
    if (selectedChannelUrls.includes(u)) {
      setSelectedChannelUrls(selectedChannelUrls.filter(item => item !== u));
    } else {
      setSelectedChannelUrls([...selectedChannelUrls, u]);
    }
  };

  // Select all / Deselect all
  const toggleSelectAllChannel = () => {
    if (displayChannelVideos.length === 0) return;
    const allSelected = displayChannelVideos.every(v => selectedChannelUrls.includes(v.url));
    if (allSelected) {
      setSelectedChannelUrls(selectedChannelUrls.filter(u => !displayChannelVideos.some(v => v.url === u)));
    } else {
      const combined = new Set([...selectedChannelUrls, ...displayChannelVideos.map(v => v.url)]);
      setSelectedChannelUrls(Array.from(combined));
    }
  };

  // Download all selected from channel
  const handleDownloadFromChannel = () => {
    if (!channelScannedData) return;
    const urlsToDownload = selectedChannelUrls.length > 0 ? selectedChannelUrls : displayChannelVideos.map(v => v.url);
    if (urlsToDownload.length === 0) {
      showToast("Không có video nào được chọn để tải!", "error");
      return;
    }
    onStartBatchDownload(urlsToDownload, selectedCategory, syncToDrive, saveToVault);
    setChannelUrl("");
    setChannelScannedData(null);
    setSelectedChannelUrls([]);
    setTab("tasks");
  };

  const parsedBatchUrls = extractBatchUrls(batchText);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: tab === "channel" || tab === "drive" ? "820px" : "700px" }} onClick={(e) => e.stopPropagation()}>
        {/* Header with Tabs */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700 }}>{t("downloader_title")}</h3>
            <div style={{ display: "flex", gap: "5px", background: "rgba(255,255,255,0.05)", padding: "3px", borderRadius: "8px" }}>
              <button
                className={`btn btn-sm ${tab === "single" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTab("single")}
              >
                {t("tab_single")}
              </button>
              <button
                className={`btn btn-sm ${tab === "batch" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTab("batch")}
              >
                {t("tab_batch")}
              </button>
              <button
                className={`btn btn-sm ${tab === "channel" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTab("channel")}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Icon name="video" size={14} />
                <span>{t("tab_channel")}</span>
              </button>
              <button
                className={`btn btn-sm ${tab === "drive" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTab("drive")}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Icon name="drive" size={14} />
                <span>{t("tab_drive")}</span>
              </button>
              {activeTasks && activeTasks.length > 0 && (
                <button
                  className={`btn btn-sm ${tab === "tasks" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setTab("tasks")}
                >
                  {t("tab_tasks")} ({activeTasks.length})
                </button>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* TAB 1: SINGLE DOWNLOAD */}
          {tab === "single" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">
                  Dán đường dẫn Video / Ảnh (TikTok, YouTube, Reels, Douyin, X, Google Drive...)
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="Dán link hoặc đoạn văn bản chia sẻ Douyin, TikTok, Reels, YouTube, ảnh X..."
                    value={singleUrl}
                    onChange={(e) => {
                      const clean = extractCleanUrl(e.target.value);
                      setSingleUrl(clean);
                      if (scrapedData) setScrapedData(null);
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData?.getData("text") || "";
                      if (pasted) {
                        const clean = extractCleanUrl(pasted);
                        if (clean && clean !== pasted) {
                          e.preventDefault();
                          setSingleUrl(clean);
                          if (scrapedData) setScrapedData(null);
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAnalyze();
                    }}
                    autoFocus
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={handleAnalyze}
                    disabled={isScraping || !singleUrl.trim()}
                  >
                    <Icon name="search" size={15} />
                    <span>{isScraping ? "Đang quét..." : "Quét thông tin"}</span>
                  </button>
                </div>
              </div>

              {scrapeError && (
                <div style={{ padding: "12px", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "8px", color: "#f43f5e", fontSize: "13px" }}>
                  {scrapeError}
                </div>
              )}

              {/* Scraped Preview Card */}
              {scrapedData && (
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  gap: "16px"
                }}>
                  {scrapedData.thumbnail_url ? (
                    <img
                      src={scrapedData.thumbnail_url}
                      alt="Thumbnail"
                      style={{ width: "130px", height: "85px", objectFit: "cover", borderRadius: "8px" }}
                    />
                  ) : (
                    <div style={{ width: "130px", height: "85px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={scrapedData.platform === "drive" ? "drive" : "play"} size={28} />
                    </div>
                  )}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className={`video-platform-badge platform-${scrapedData.platform}`} style={{ position: "static", padding: "2px 6px" }}>
                        {scrapedData.platform?.toUpperCase()} {scrapedData.media_type === "image" ? "(ẢNH)" : ""}
                      </span>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--accent-cyan)" }}>
                        @{scrapedData.uploader}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>
                        Độ phân giải: {scrapedData.quality || (scrapedData.media_type === "image" ? "Ảnh HD" : "Auto")}
                      </span>
                    </div>

                    <h4 style={{ fontSize: "13.5px", fontWeight: 600, lineHeight: 1.3, color: "var(--text-primary)" }}>
                      {scrapedData.title}
                    </h4>

                    {scrapedData.is_folder && (
                      <div style={{ fontSize: "12px", color: "var(--accent-cyan)", fontWeight: 600 }}>
                        📁 Phát hiện thư mục chứa {scrapedData.folder_entries?.length || 0} video!
                      </div>
                    )}

                    {scrapedData.hashtags && scrapedData.hashtags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
                        {scrapedData.hashtags.slice(0, 5).map((t, idx) => (
                          <span key={idx} style={{ fontSize: "11px", color: "var(--accent-secondary)", background: "rgba(236,72,153,0.1)", padding: "1px 6px", borderRadius: "4px" }}>
                            #{t.replace(/^#/, '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Category & Quality Settings */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="form-group">
                  <label className="form-label">Lưu vào Danh mục</label>
                  <select
                    className="form-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    {renderCategorySelectOptions(categories, { includeAll: true, allLabel: "Tất cả Video (Chưa phân loại)" })}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Chất lượng tải về</label>
                  <div style={{
                    padding: "9px 12px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "var(--accent-cyan)"
                  }}>
                    <Icon name="check" size={15} color="var(--accent-green)" />
                    <span>Chất lượng cao nhất (Full HD / 4K / Gốc)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BATCH DOWNLOAD */}
          {tab === "batch" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label className="form-label">
                    Dán danh sách các link video hoặc link Drive (mỗi dòng 1 link)
                  </label>
                  <span style={{ fontSize: "12px", color: "var(--accent-primary)", fontWeight: 600 }}>
                    {parsedBatchUrls.length} liên kết hợp lệ
                  </span>
                </div>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: "150px", fontFamily: "var(--font-mono)", fontSize: "12.5px" }}
                  placeholder={"Dán các link hoặc đoạn văn bản chia sẻ (mỗi dòng một video)...\nhttps://v.douyin.com/0yiBCYMH6TA/\nhttps://www.tiktok.com/@creator/video/111\nhttps://www.youtube.com/shorts/222"}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="form-group">
                  <label className="form-label">Lưu vào Danh mục</label>
                  <select
                    className="form-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    {renderCategorySelectOptions(categories, { includeAll: true, allLabel: "Tất cả Video (Chưa phân loại)" })}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Xử lý tải về</label>
                  <div style={{
                    padding: "9px 12px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "var(--text-secondary)"
                  }}>
                    <Icon name="download" size={15} color="var(--accent-primary)" />
                    <span>Tải hàng loạt song song về kho</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DEDICATED GOOGLE DRIVE TAB */}
          {tab === "drive" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{
                background: "linear-gradient(135deg, rgba(38, 132, 252, 0.12) 0%, rgba(16, 185, 129, 0.12) 100%)",
                border: "1px solid rgba(38, 132, 252, 0.3)",
                borderRadius: "12px",
                padding: "14px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px"
              }}>
                <div style={{ marginTop: "2px" }}>
                  <Icon name="drive" size={24} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>Trích Xuất Link Video Từ Google Drive & Lọc Trùng Lặp</span>
                    <span style={{ fontSize: "11px", background: "rgba(16,185,129,0.2)", color: "var(--accent-green)", padding: "2px 8px", borderRadius: "12px" }}>
                      ⚡ Smart Dedup
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Dán link <b>Thư mục Drive</b> (chứa các file .txt danh sách link như <code>tuTIKTOK</code>) hoặc link <b>File .txt</b>. Hệ thống sẽ tự động đọc nội dung file, bóc tách toàn bộ link video và đối chiếu với kho để <b>loại bỏ 100% video đã có</b>!
                  </div>
                </div>
              </div>

              {/* Input Drive URL & File Upload */}
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Đường dẫn Google Drive (Thư mục hoặc File chứa link)
                  </label>
                  <button
                    type="button"
                    onClick={() => driveFileInputRef.current?.click()}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-cyan)",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: 0,
                      fontWeight: 600
                    }}
                  >
                    <Icon name="upload" size={13} />
                    <span>Hoặc chọn file .txt từ máy</span>
                  </button>
                  <input
                    type="file"
                    ref={driveFileInputRef}
                    accept=".txt,.csv,.json"
                    style={{ display: "none" }}
                    onChange={(e) => handleDriveFileUpload(e.target.files?.[0])}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="url"
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="Ví dụ: https://drive.google.com/drive/folders/1OMPdXaZ4Fh8ps6wQ-0PR9p9fz1IELn5S"
                    value={driveUrl}
                    onChange={(e) => {
                      setDriveUrl(e.target.value);
                      if (driveScrapedData) setDriveScrapedData(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAnalyzeDrive();
                    }}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleAnalyzeDrive}
                    disabled={driveScraping || !driveUrl.trim()}
                    style={{ minWidth: "130px", background: "linear-gradient(135deg, #2563eb 0%, #059669 100%)" }}
                  >
                    <Icon name="search" size={15} color="#fff" />
                    <span>{driveScraping ? "Đang quét..." : "Quét link Drive"}</span>
                  </button>
                </div>
                {driveScraping && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--accent-cyan)", marginTop: "6px" }}>
                    <div style={{ width: "12px", height: "12px", border: "2px solid var(--accent-cyan)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <span>Đang đọc các file text trong thư mục Drive & lọc trùng lặp với kho dữ liệu...</span>
                  </div>
                )}
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  💡 Hệ thống sẽ tự động quét qua Google Apps Script của bạn mà không cần phải bật chia sẻ quyền phức tạp.
                </span>
              </div>

              {driveError && (
                <div style={{ padding: "12px 16px", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "10px", color: "#f43f5e", fontSize: "13px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontWeight: 600 }}>⚠️ Không thể phân tích liên kết Drive:</div>
                  <div style={{ whiteSpace: "pre-line", fontSize: "12.5px" }}>{driveError}</div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCopyGasCode}
                      disabled={isCopyingGas}
                    >
                      <Icon name="copy" size={13} />
                      <span>{isCopyingGas ? "Đang lấy mã..." : "Sao chép mã Apps Script mới"}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => driveFileInputRef.current?.click()}
                    >
                      <Icon name="upload" size={13} />
                      <span>Tải file .txt trực tiếp</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Scraped Drive Preview & Deduplication Report */}
              {driveScrapedData && (
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(38, 132, 252, 0.4)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}>
                  {/* Header info */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Icon name="folder" size={18} color="var(--accent-cyan)" />
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                        {driveScrapedData.folder_name || "Nguồn Drive"}
                      </span>
                      {driveScrapedData.files_scanned?.length > 0 && (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          ({driveScrapedData.files_scanned.map(f => f.name).join(", ")})
                        </span>
                      )}
                    </div>
                    <span className="video-platform-badge platform-drive" style={{ position: "static", padding: "2px 8px" }}>
                      GOOGLE DRIVE
                    </span>
                  </div>

                  {/* Need GAS Update Alert */}
                  {driveScrapedData.need_gas_update ? (
                    <div style={{
                      padding: "12px 14px",
                      background: "rgba(234, 179, 8, 0.12)",
                      border: "1px solid rgba(234, 179, 8, 0.35)",
                      borderRadius: "10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#facc15" }}>
                        ⚡ Cần cập nhật Google Apps Script để đọc thư mục & file text
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        Google Apps Script hiện tại của bạn chưa có chức năng đọc file văn bản trong Drive. Hãy bấm nút dưới đây để sao chép mã mới, sau đó chuyển sang tab Apps Script dán đè vào và bấm <b>Triển khai mới</b>!
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleCopyGasCode}
                          disabled={isCopyingGas}
                          style={{ background: "#eab308", color: "#000", fontWeight: 700 }}
                        >
                          <Icon name="copy" size={14} color="#000" />
                          <span>{isCopyingGas ? "Đang lấy mã..." : "Sao chép mã Apps Script chuẩn (1-Click)"}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => driveFileInputRef.current?.click()}
                        >
                          <Icon name="upload" size={13} />
                          <span>Tải file .txt trực tiếp</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Metric summary grid */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "10px",
                        textAlign: "center"
                      }}>
                        <div style={{
                          padding: "10px",
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)"
                        }}>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Tổng link tìm thấy</div>
                          <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginTop: "2px" }}>
                            {driveScrapedData.total_found || 0}
                          </div>
                        </div>

                        <div style={{
                          padding: "10px",
                          background: "rgba(16, 185, 129, 0.08)",
                          borderRadius: "8px",
                          border: "1px solid rgba(16, 185, 129, 0.3)"
                        }}>
                          <div style={{ fontSize: "11px", color: "var(--accent-green)", fontWeight: 600 }}>🟢 Link mới hợp lệ</div>
                          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--accent-green)", marginTop: "2px" }}>
                            {driveScrapedData.new_count || 0}
                          </div>
                        </div>

                        <div style={{
                          padding: "10px",
                          background: "rgba(245, 158, 11, 0.08)",
                          borderRadius: "8px",
                          border: "1px solid rgba(245, 158, 11, 0.3)"
                        }}>
                          <div style={{ fontSize: "11px", color: "#f59e0b", fontWeight: 600 }}>🚫 Đã có trong kho (Bỏ qua)</div>
                          <div style={{ fontSize: "18px", fontWeight: 700, color: "#f59e0b", marginTop: "2px" }}>
                            {driveScrapedData.duplicate_count || 0}
                          </div>
                        </div>
                      </div>

                      {/* New URLs List */}
                      {driveScrapedData.new_urls?.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                            <span style={{ fontWeight: 600, color: "var(--accent-green)" }}>
                              Danh sách video mới sẽ tải ({selectedDriveUrls.length}/{driveScrapedData.new_urls.length}):
                            </span>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                type="button"
                                style={{ background: "none", border: "none", color: "var(--accent-cyan)", fontSize: "11px", cursor: "pointer", padding: 0 }}
                                onClick={() => setSelectedDriveUrls(driveScrapedData.new_urls)}
                              >
                                Chọn tất cả
                              </button>
                              <span style={{ color: "var(--border-color)" }}>|</span>
                              <button
                                type="button"
                                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "11px", cursor: "pointer", padding: 0 }}
                                onClick={() => setSelectedDriveUrls([])}
                              >
                                Bỏ chọn
                              </button>
                            </div>
                          </div>

                          <div style={{ maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", paddingRight: "4px" }}>
                            {driveScrapedData.new_urls.map((u, idx) => {
                              const isSelected = selectedDriveUrls.includes(u);
                              return (
                                <div
                                  key={idx}
                                  onClick={() => toggleSelectDriveUrl(u)}
                                  style={{
                                    fontSize: "12px",
                                    padding: "6px 10px",
                                    background: isSelected ? "rgba(16, 185, 129, 0.1)" : "rgba(255,255,255,0.02)",
                                    border: `1px solid ${isSelected ? "rgba(16, 185, 129, 0.3)" : "var(--border-color)"}`,
                                    borderRadius: "6px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    cursor: "pointer"
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    style={{ accentColor: "var(--accent-green)", cursor: "pointer" }}
                                  />
                                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, color: isSelected ? "#fff" : "var(--text-secondary)" }}>
                                    {u}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: "12px", background: "rgba(16, 185, 129, 0.1)", borderRadius: "8px", color: "var(--accent-green)", fontSize: "12.5px", textAlign: "center" }}>
                          ✅ Tất cả các link video trong file này đã có trong kho dữ liệu của bạn! Không có video mới cần tải.
                        </div>
                      )}

                      {/* Collapsible Duplicates Section */}
                      {driveScrapedData.duplicate_items?.length > 0 && (
                        <div style={{ marginTop: "4px" }}>
                          <button
                            type="button"
                            onClick={() => setShowDuplicates(!showDuplicates)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#f59e0b",
                              fontSize: "11.5px",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px"
                            }}
                          >
                            <span>{showDuplicates ? "▼ Thu gọn" : "► Xem"} {driveScrapedData.duplicate_items.length} link đã bị loại bỏ vì đã có trong kho</span>
                          </button>

                          {showDuplicates && (
                            <div style={{ maxHeight: "100px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
                              {driveScrapedData.duplicate_items.map((dup, idx) => (
                                <div key={idx} style={{ fontSize: "11.5px", padding: "4px 8px", background: "rgba(245, 158, 11, 0.06)", borderRadius: "4px", display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "320px" }}>{dup.url}</span>
                                  <span style={{ color: "#f59e0b", flexShrink: 0 }}>Đã lưu: {dup.existing_title?.substring(0, 20)}...</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Lưu vào Danh mục</label>
                <select
                  className="form-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {renderCategorySelectOptions(categories, { includeAll: true, allLabel: "Tất cả Video (Chưa phân loại)" })}
                </select>
              </div>
            </div>
          )}

          {/* TAB: CHANNEL SCANNER (DOUYIN & TIKTOK) */}
          {tab === "channel" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Platform Selector */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between", 
                flexWrap: "wrap", 
                gap: "8px", 
                background: "rgba(255,255,255,0.02)", 
                padding: "8px 12px", 
                borderRadius: "10px", 
                border: "1px solid var(--border-color)" 
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: "600", color: "var(--text-secondary)" }}>Nền tảng kênh:</span>
                  <button
                    type="button"
                    className={`btn btn-sm ${channelPlatform === "douyin" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      setChannelPlatform("douyin");
                      if (channelScannedData) setChannelScannedData(null);
                    }}
                    style={channelPlatform === "douyin" ? { background: "linear-gradient(135deg, #ff0050 0%, #00f2fe 100%)", color: "#fff", border: "none" } : {}}
                  >
                    🎵 Douyin (抖音)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${channelPlatform === "tiktok" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      setChannelPlatform("tiktok");
                      if (channelScannedData) setChannelScannedData(null);
                    }}
                    style={channelPlatform === "tiktok" ? { background: "linear-gradient(135deg, #00f2fe 0%, #ff0050 100%)", color: "#fff", border: "none" } : {}}
                  >
                    📱 TikTok
                  </button>
                </div>
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {channelPlatform === "douyin" ? "Hỗ trợ link douyin.com/user/..." : "Hỗ trợ link tiktok.com/@username"}
                </span>
              </div>

              {/* Channel URL input */}
              <div className="form-group">
                <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    {channelPlatform === "douyin" ? "Đường dẫn kênh Douyin (抖音)" : t("channel_input_label")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setChannelManualPasteOpen(!channelManualPasteOpen)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#a78bfa",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: 0,
                      fontWeight: 600
                    }}
                  >
                    <Icon name="edit" size={13} />
                    <span>{channelManualPasteOpen ? "Đóng ô dán" : "Dán link / JSON thủ công"}</span>
                  </button>
                </label>

                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder={channelPlatform === "douyin" ? "Dán link kênh Douyin (ví dụ: https://www.douyin.com/user/MS4wLjAB...)" : "Dán link kênh hoặc Bộ sưu tập TikTok (ví dụ: https://www.tiktok.com/@user/collection/...)"}
                    value={channelUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setChannelUrl(val);
                      const lower = val.toLowerCase();
                      if (lower.includes("douyin.com") || lower.includes("iesdouyin.com")) {
                        setChannelPlatform("douyin");
                      } else if (lower.includes("tiktok.com")) {
                        setChannelPlatform("tiktok");
                      }
                      if (lower.includes("/collection/")) {
                        setChannelDateMode("all");
                      }
                      if (channelScannedData) setChannelScannedData(null);
                      if (recentIngestAvailable) setRecentIngestAvailable(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleScanChannel();
                    }}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleScanChannel}
                    disabled={channelScanning || !channelUrl.trim()}
                    style={{ minWidth: "140px", background: channelPlatform === "douyin" ? "linear-gradient(135deg, #ff0050 0%, #a855f7 100%)" : "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)" }}
                  >
                    <Icon name="search" size={15} color="#fff" />
                    <span>{channelScanning ? "Đang quét..." : (channelUrl.includes("/collection/") ? "Quét Bộ Sưu Tập" : "Quét Kênh")}</span>
                  </button>
                </div>
                {channelUrl.includes("/collection/") && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#f472b6",
                    background: "rgba(244,114,182,0.12)",
                    border: "1px solid rgba(244,114,182,0.35)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    marginTop: "6px"
                  }}>
                    <span>📁 <b>Đã nhận diện Bộ sưu tập TikTok!</b> Bấm nút "Quét Bộ Sưu Tập" ở trên hoặc bấm nút bên cạnh để lấy mã & xem hướng dẫn:</span>
                    <button
                      type="button"
                      onClick={handleCopyBookmarklet}
                      disabled={isCopyingBookmarklet}
                      style={{
                        background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                        color: "#fff",
                        border: "none",
                        padding: "6px 14px",
                        borderRadius: "8px",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        boxShadow: "0 2px 8px rgba(236,72,153,0.4)"
                      }}
                    >
                      <Icon name="copy" size={13} color="#fff" />
                      <span>{isCopyingBookmarklet ? "Đang lấy mã..." : "📋 Lấy mã & Xem hướng dẫn"}</span>
                    </button>
                  </div>
                )}
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  {channelPlatform === "douyin" 
                    ? "💡 Nhập link kênh Douyin dạng https://www.douyin.com/user/MS4wLjAB... hoặc link rút gọn v.douyin.com"
                    : "💡 Hỗ trợ: Kênh @username hoặc Bộ sưu tập Yêu thích (tiktok.com/@username/collection/...)"}
                </span>
              </div>

              {/* Date Filter Selection Box */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(139, 92, 246, 0.25)",
                borderRadius: "12px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                    <Icon name="calendar" size={15} color="#c084fc" />
                    <span>Lọc thời gian video:</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#a78bfa" }}>
                    ⚡ Tự động tính ngày chính xác qua {channelPlatform === "douyin" ? "Douyin" : "TikTok"} Snowflake ID
                  </span>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${channelDateMode === "24h" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setChannelDateMode("24h")}
                    style={channelDateMode === "24h" ? { background: "linear-gradient(135deg, #ef4444, #f97316)", color: "#fff" } : {}}
                  >
                    ⚡ 24 giờ qua (Mới nhất)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${channelDateMode === "7_days" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setChannelDateMode("7_days")}
                    style={channelDateMode === "7_days" ? { background: "linear-gradient(135deg, #8b5cf6, #ec4899)", color: "#fff" } : {}}
                  >
                    ⚡ 7 ngày gần nhất
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${channelDateMode === "30_days" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setChannelDateMode("30_days")}
                    style={channelDateMode === "30_days" ? { background: "linear-gradient(135deg, #8b5cf6, #ec4899)", color: "#fff" } : {}}
                  >
                    🔥 30 ngày gần nhất
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${channelDateMode === "custom" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setChannelDateMode("custom")}
                    style={channelDateMode === "custom" ? { background: "linear-gradient(135deg, #8b5cf6, #ec4899)", color: "#fff" } : {}}
                  >
                    📅 Khoảng ngày tùy chọn
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${channelDateMode === "all" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setChannelDateMode("all")}
                    style={channelDateMode === "all" ? { background: "linear-gradient(135deg, #8b5cf6, #ec4899)", color: "#fff" } : {}}
                  >
                    🌐 Toàn bộ video (Nguyên kênh)
                  </button>
                </div>

                {channelDateMode === "custom" && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginTop: "6px",
                    padding: "10px 12px",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: "8px",
                    border: "1px dashed rgba(139, 92, 246, 0.4)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{t("channel_date_from")}</span>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: "4px 8px", fontSize: "12.5px" }}
                        value={channelStartDate}
                        onChange={(e) => setChannelStartDate(e.target.value)}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{t("channel_date_to")}</span>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: "4px 8px", fontSize: "12.5px" }}
                        value={channelEndDate}
                        onChange={(e) => setChannelEndDate(e.target.value)}
                      />
                    </div>
                    {channelScannedData && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleScanChannel}
                        style={{ marginLeft: "auto", fontSize: "11.5px" }}
                      >
                        Áp dụng lọc lại
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 1-Click Browser Extractor Tool */}
              <div style={{
                background: "linear-gradient(135deg, rgba(236,72,153,0.08) 0%, rgba(139,92,246,0.08) 100%)",
                border: "1px solid rgba(236, 72, 153, 0.25)",
                borderRadius: "12px",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px"
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#f472b6" }}>
                    <span>⚡ Tiện ích Quét Kênh & Bộ Sưu Tập 1-Click trên Cốc Cốc / Chrome</span>
                  </div>
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    Đang mở sẵn Kênh hoặc Bộ sưu tập Yêu thích trên tab trình duyệt? Chỉ cần dán mã vào Console là tự động quét 100% video và chuyển về SocialContent OS!
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={handleCopyBookmarklet}
                    disabled={isCopyingBookmarklet}
                    style={{
                      background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                      color: "#fff",
                      border: "none",
                      padding: "10px 18px",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: "0 4px 16px rgba(236, 72, 153, 0.45)"
                    }}
                  >
                    <Icon name="copy" size={15} color="#fff" />
                    <span>{isCopyingBookmarklet ? "Đang lấy mã..." : "📋 BẤM VÀO ĐÂY ĐỂ SAO CHÉP MÃ"}</span>
                  </button>
                </div>
              </div>

              {/* Manual Paste / Ingest Container */}
              {channelManualPasteOpen && (
                <div style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  borderRadius: "12px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                    Dán danh sách liên kết video hoặc JSON bóc tách từ trình duyệt:
                  </div>
                  <textarea
                    className="form-input"
                    rows={4}
                    style={{ fontFamily: "monospace", fontSize: "12px" }}
                    placeholder={`Dán các đường link video (mỗi dòng một link):\nhttps://www.tiktok.com/@user/video/7684979840855919880\nhttps://www.tiktok.com/@user/video/7682374547990924562\n\nHoặc dán mảng JSON trích xuất từ tiện ích trình duyệt.`}
                    value={channelManualPasteText}
                    onChange={(e) => setChannelManualPasteText(e.target.value)}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text && text.trim()) {
                            setChannelManualPasteText(text.trim());
                          } else {
                            showToast("Bộ nhớ tạm hiện đang trống. Hãy sao chép link hoặc chạy mã quét trên tab TikTok trước!", "error");
                          }
                        } catch (e) {
                          showToast("Nhấp chuột vào ô văn bản và nhấn phím Ctrl + V để dán nhé!", "info");
                        }
                      }}
                      style={{ borderColor: "rgba(139, 92, 246, 0.4)", color: "#c084fc", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      <Icon name="clipboard" size={13} />
                      <span>📋 Dán nhanh từ bộ nhớ tạm</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleManualPasteIngest}
                      disabled={channelScanning || !channelManualPasteText.trim()}
                      style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)", fontWeight: 700, padding: "8px 16px" }}
                    >
                      <span>⚡ Lọc theo ngày & Nạp vào danh sách</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Scanning status indicator */}
              {channelScanning && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px", background: "rgba(139,92,246,0.1)", borderRadius: "10px", color: "#c084fc", fontSize: "13px" }}>
                  <div style={{ width: "16px", height: "16px", border: "2px solid #c084fc", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  <span>Đang kết nối máy chủ phân tích kênh TikTok và giải mã ngày đăng...</span>
                </div>
              )}

              {/* Error box */}
              {channelError && !channelScannedData && !recentIngestAvailable && (
                <div style={{ padding: "14px 16px", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "10px", color: "#f43f5e", fontSize: "13px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontWeight: 600 }}>⚠️ {channelError}</div>
                  <button
                    type="button"
                    onClick={handleCopyBookmarklet}
                    disabled={isCopyingBookmarklet}
                    style={{
                      background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                      color: "#fff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      alignSelf: "flex-start",
                      boxShadow: "0 4px 12px rgba(236,72,153,0.35)"
                    }}
                  >
                    <Icon name="copy" size={14} color="#fff" />
                    <span>📋 Bấm vào đây để sao chép mã 1-Click</span>
                  </button>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {channelPlatform === "douyin" 
                      ? <>💡 Mẹo: Douyin có hệ thống bảo mật cao, bạn chỉ cần bấm <b>"Sao chép mã 1-Click"</b> ở trên, sang tab kênh Douyin đang mở trên trình duyệt bấm F12 Console dán vào là nạp 100% video nguyên kênh!</>
                      : <>💡 Mẹo: Do TikTok bảo mật bộ sưu tập riêng tư, bạn chỉ cần bấm <b>"Sao chép mã 1-Click"</b> ở trên, sang tab TikTok đang mở trên trình duyệt dán vào Console là quét được 100% video!</>}
                  </div>
                </div>
              )}

              {/* Banner: Có dữ liệu vừa bóc tách thành công từ tab Douyin/TikTok */}
              {recentIngestAvailable && (!channelScannedData || (channelScannedData.videos || []).length === 0) && (
                <div style={{
                  padding: "14px 18px",
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)",
                  border: "1px solid #10b981",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                  boxShadow: "0 8px 24px rgba(16, 185, 129, 0.15)"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontWeight: 700, color: "#34d399", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>🎉 ĐÃ TÌM THẤY {recentIngestAvailable.total_scanned || (recentIngestAvailable.videos || []).length} VIDEO VỪA QUÉT!</span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {recentIngestAvailable.is_collection || recentIngestAvailable.channel_info?.is_collection ? "Bộ sưu tập:" : "Kênh:"} <b>{recentIngestAvailable.channel_info?.nickname || "TikTok"}</b> - Bấm nút bên cạnh để nạp ngay vào danh sách tải!
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setChannelScannedData(recentIngestAvailable);
                      setSelectedChannelUrls((recentIngestAvailable.videos || []).map(v => v.url));
                      setChannelDateMode("all");
                      setChannelError(null);
                      if (recentIngestAvailable.channel_info?.profile_url) {
                        setChannelUrl(recentIngestAvailable.channel_info.profile_url);
                      }
                      setRecentIngestAvailable(null);
                    }}
                    style={{ background: "#10b981", color: "#fff", fontWeight: 700, fontSize: "13px", padding: "8px 18px" }}
                  >
                    <span>⚡ Nạp {recentIngestAvailable.total_scanned || (recentIngestAvailable.videos || []).length} video ngay</span>
                  </button>
                </div>
              )}

              {/* Scanned Channel Results Card */}
              {channelScannedData && (
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: channelPlatform === "douyin" ? "1px solid rgba(255, 0, 80, 0.4)" : "1px solid rgba(236, 72, 153, 0.35)",
                  borderRadius: "14px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px"
                }}>
                  {channelScannedData.requires_bookmarklet_for_all && (!channelScannedData.videos || channelScannedData.videos.length === 0) && (
                    <div style={{
                      padding: "10px 14px",
                      background: "rgba(255, 0, 80, 0.08)",
                      border: "1px dashed rgba(255, 0, 80, 0.35)",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      color: "#ff4b72",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px"
                    }}>
                      <span>💡 Kênh Douyin có <b>{channelScannedData.channel_info?.posts_count || 115}</b> video. Bấm <b>Sao chép mã 1-Click</b> ở trên và dán vào F12 Console của tab Douyin đang mở để lấy trọn vẹn toàn bộ video nguyên kênh!</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopyBookmarklet}
                        style={{ fontSize: "11px", padding: "4px 10px", borderColor: "#ff0050", color: "#ff4b72" }}
                      >
                        <Icon name="copy" size={12} />
                        <span>Lấy mã quét 1-Click</span>
                      </button>
                    </div>
                  )}

                  {/* Channel Header Profile */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        background: channelPlatform === "douyin" ? "linear-gradient(135deg, #ff0050, #00f2fe)" : "linear-gradient(135deg, #ec4899, #8b5cf6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "18px",
                        overflow: "hidden"
                      }}>
                        {channelScannedData.channel_info?.avatar ? (
                          <img src={channelScannedData.channel_info.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          channelScannedData.channel_info?.nickname?.[0]?.toUpperCase() || "T"
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{channelScannedData.channel_info?.nickname || (channelScannedData.is_collection ? "Bộ sưu tập TikTok" : "Kênh TikTok")}</span>
                          <span style={{ fontSize: "12px", fontWeight: 400, color: "#f472b6" }}>
                            @{channelScannedData.channel_info?.username}
                          </span>
                        </div>
                        {channelScannedData.channel_info?.biography && (
                          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", maxWidth: "420px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {channelScannedData.channel_info.biography}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{
                        padding: "4px 10px",
                        background: "rgba(139, 92, 246, 0.15)",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#c084fc"
                      }}>
                        Tổng: {channelScannedData.total_scanned || (channelScannedData.videos || []).length} video
                      </span>
                      <span style={{
                        padding: "4px 10px",
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#34d399"
                      }}>
                        Khớp bộ lọc: {displayChannelVideos.length} video
                      </span>
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        <input
                          type="checkbox"
                          checked={displayChannelVideos.length > 0 && displayChannelVideos.every(v => selectedChannelUrls.includes(v.url))}
                          onChange={toggleSelectAllChannel}
                          style={{ accentColor: "var(--accent-primary)", width: "16px", height: "16px", cursor: "pointer" }}
                        />
                        <span>Chọn tất cả ({selectedChannelUrls.filter(u => displayChannelVideos.some(v => v.url === u)).length} / {displayChannelVideos.length})</span>
                      </label>
                    </div>

                    <input
                      type="text"
                      className="form-input"
                      style={{ width: "200px", padding: "4px 10px", fontSize: "12px" }}
                      placeholder="Tìm video trong danh sách..."
                      value={channelSearchFilter}
                      onChange={(e) => setChannelSearchFilter(e.target.value)}
                    />
                  </div>

                  {/* Empty Filter Alert */}
                  {displayChannelVideos.length === 0 && (channelScannedData.videos || []).length > 0 && (
                    <div style={{ padding: "18px 16px", textAlign: "center", background: "rgba(0,0,0,0.25)", borderRadius: "10px", border: "1px dashed rgba(255,255,255,0.15)", color: "var(--text-secondary)", fontSize: "13px" }}>
                      <div>Không có video nào trong kênh khớp với bộ lọc ngày hiện tại.</div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChannelDateMode("all")}
                        style={{ marginTop: "10px", borderColor: "rgba(139,92,246,0.4)", color: "#c084fc" }}
                      >
                        🌐 Bấm vào đây để chọn Toàn bộ video ({(channelScannedData.videos || []).length} video)
                      </button>
                    </div>
                  )}

                  {/* Videos Grid / List */}
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    maxHeight: "320px",
                    overflowY: "auto",
                    paddingRight: "4px"
                  }}>
                    {displayChannelVideos.map((v) => {
                      const isSelected = selectedChannelUrls.includes(v.url);
                      return (
                          <div
                            key={v.id || v.url}
                            onClick={() => toggleSelectChannelUrl(v.url)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "10px 12px",
                              background: isSelected ? "rgba(139, 92, 246, 0.12)" : "rgba(255,255,255,0.02)",
                              border: isSelected ? "1px solid rgba(139, 92, 246, 0.45)" : "1px solid rgba(255,255,255,0.05)",
                              borderRadius: "10px",
                              cursor: "pointer",
                              transition: "all 0.15s ease"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelectChannelUrl(v.url);
                              }}
                              style={{ accentColor: "var(--accent-primary)", width: "16px", height: "16px", cursor: "pointer" }}
                            />

                            {/* Thumbnail */}
                            <div style={{
                              width: "48px",
                              height: "64px",
                              borderRadius: "6px",
                              background: "#18181b",
                              overflow: "hidden",
                              flexShrink: 0,
                              position: "relative"
                            }}>
                              {v.thumbnail ? (
                                <img src={v.thumbnail} alt="cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                                  <Icon name="video" size={18} />
                                </div>
                              )}
                            </div>

                            {/* Content Info */}
                            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                              <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={v.title}>
                                {v.title || "Video TikTok"}
                              </span>

                              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "11.5px" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-secondary)" }}>
                                  <Icon name="calendar" size={12} color="#a78bfa" />
                                  <span>{v.date_str || "Chưa rõ ngày"}</span>
                                </span>
                                {v.relative_str && (
                                  <span style={{
                                    background: v.days_ago <= 7 ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.08)",
                                    color: v.days_ago <= 7 ? "#34d399" : "var(--text-muted)",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: 500
                                  }}>
                                    {v.relative_str}
                                  </span>
                                )}
                                {v.views > 0 && (
                                  <span style={{ color: "var(--text-muted)" }}>
                                    👁️ {Number(v.views).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Link to view */}
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="icon-btn"
                              title="Xem video trên TikTok"
                              style={{ padding: "6px", color: "var(--text-muted)" }}
                            >
                              <Icon name="external-link" size={14} />
                            </a>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Category Select */}
              <div className="form-group">
                <label className="form-label">{t("save_category_label")}</label>
                <select
                  className="form-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {renderCategorySelectOptions(categories, { includeAll: true, allLabel: "Tất cả Video (Chưa phân loại)" })}
                </select>
              </div>
            </div>
          )}

          {/* TAB 4: REALTIME PROGRESS TRACKER */}
          {tab === "tasks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", minHeight: "160px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  Tiến trình đang chạy ({activeTasks?.length || 0} video)
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onClose}
                  style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--accent-cyan)", borderColor: "rgba(6, 182, 212, 0.3)" }}
                >
                  <Icon name="minimize" size={13} />
                  <span>Thu nhỏ xuống góc phải</span>
                </button>
              </div>
              {!activeTasks || activeTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                  Không có tiến trình tải nào đang chạy.
                </div>
              ) : (
                activeTasks.map((t, index) => (
                  <div
                    key={t.task_id}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "10px",
                      padding: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", maxWidth: "420px", overflow: "hidden" }}>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          color: "#c084fc",
                          background: "rgba(168, 85, 247, 0.15)",
                          border: "1px solid rgba(168, 85, 247, 0.3)",
                          padding: "2px 7px",
                          borderRadius: "6px",
                          flexShrink: 0
                        }}>
                          Video {index + 1}/{activeTasks.length}
                        </span>
                        <span style={{ fontSize: "13.5px", fontWeight: 600, color: t.isError ? "#ef4444" : "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.title || t.url}
                        </span>
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: t.isError ? "#ef4444" : "var(--accent-primary)", flexShrink: 0 }}>
                        {t.isError ? "Thất bại" : `${t.percent}%`}
                      </span>
                    </div>

                    <div className="progress-track" style={{ background: t.isError ? "rgba(239, 68, 68, 0.15)" : undefined }}>
                      <div className="progress-fill" style={{ width: t.isError ? "100%" : `${t.percent}%`, background: t.isError ? "#ef4444" : undefined }} />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: t.isError ? "#f87171" : "var(--text-muted)" }}>
                      <span style={{ wordBreak: "break-word" }}>{cleanDisplayStr(t.status)}</span>
                      {!t.isError && !t.isCompleted && (t.percent || 0) < 100 && (
                        <span>
                          {t.speed && `${cleanDisplayStr(t.speed)}`} {t.eta && `(còn ~${cleanDisplayStr(t.eta)})`}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={syncToDrive}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSyncToDrive(val);
                  try {
                    localStorage.setItem("sync_to_drive_default", String(val));
                  } catch (err) {}
                }}
                style={{ accentColor: "var(--accent-primary)", width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span style={{ color: syncToDrive ? "var(--accent-cyan)" : "var(--text-secondary)", fontWeight: 500 }}>
                {syncToDrive ? "☁️ Đồng bộ lên Google Drive" : "☁️ Đồng bộ Google Drive (Tắt)"}
              </span>
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={saveToVault}
                onChange={(e) => setSaveToVault(e.target.checked)}
                style={{ accentColor: "#8b5cf6", width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span style={{ color: saveToVault ? "#a78bfa" : "var(--text-secondary)", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px" }}>
                <Icon name="lock" size={13} color={saveToVault ? "#a78bfa" : "currentColor"} />
                <span>Lưu vào Kho Bảo Mật</span>
              </span>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button className="btn btn-secondary" onClick={onClose}>
              {t("cancel")}
            </button>

          {tab === "single" && (
            <button
              className="btn btn-primary"
              disabled={!singleUrl.trim()}
              onClick={handleDownloadSingle}
            >
              <Icon name="download" size={15} color="#fff" />
              <span>
                {scrapedData?.is_folder
                  ? `${t("download_drive_folder")} (${scrapedData.folder_entries?.length || 0})`
                  : scrapedData?.media_type === "image"
                  ? "Tải Ảnh Về Kho"
                  : t("start_download_btn")}
              </span>
            </button>
          )}

          {tab === "batch" && (
            <button
              className="btn btn-primary"
              disabled={parsedBatchUrls.length === 0}
              onClick={handleDownloadBatch}
            >
              <Icon name="download" size={15} color="#fff" />
              <span>{t("batch_start_btn")} ({parsedBatchUrls.length})</span>
            </button>
          )}

          {tab === "channel" && (
            <button
              className="btn btn-primary"
              disabled={channelScanning || !channelScannedData || selectedChannelUrls.length === 0}
              onClick={handleDownloadFromChannel}
              style={{ background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)" }}
            >
              <Icon name="download" size={15} color="#fff" />
              <span>
                {channelScanning
                  ? "Đang quét video kênh..."
                  : channelScannedData
                    ? `Bắt đầu tải ${selectedChannelUrls.length} video kênh`
                    : "Quét & tải video kênh"}
              </span>
            </button>
          )}

          {tab === "drive" && (
            <button
              className="btn btn-primary"
              disabled={
                driveScraping || 
                (!driveScrapedData && !driveUrl.trim()) ||
                (driveScrapedData && (!driveScrapedData.new_urls || selectedDriveUrls.length === 0))
              }
              onClick={driveScrapedData ? handleDownloadFromDrive : handleAnalyzeDrive}
              style={{ background: "linear-gradient(135deg, #2563eb 0%, #059669 100%)" }}
            >
              <Icon name={driveScrapedData ? "download" : "search"} size={15} color="#fff" />
              <span>
                {driveScraping
                  ? "Đang quét dữ liệu Drive..."
                  : driveScrapedData
                    ? (selectedDriveUrls.length > 0
                        ? `Bắt đầu tải ${selectedDriveUrls.length} video mới`
                        : (driveScrapedData.total_found > 0 ? "Đã có đủ video trong kho (Đã lọc trùng)" : "Không tìm thấy link video"))
                    : "Quét & Phân tích liên kết Drive"}
              </span>
            </button>
          )}
          </div>
        </div>
      </div>

      {/* IN-APP GUIDE MODAL (THAY THẾ HOÀN TOÀN ALERT NATIVE LOCAL) */}
      {typeof document !== "undefined" && scanGuideModal && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(12px)",
            zIndex: 1000000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
          onClick={(e) => {
            e.stopPropagation();
            setScanGuideModal(null);
          }}
        >
          <div
            style={{
              maxWidth: "540px",
              width: "100%",
              background: "linear-gradient(145deg, #181533 0%, #0d1322 100%)",
              border: "1px solid rgba(168, 85, 247, 0.45)",
              borderRadius: "20px",
              padding: "26px",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(168, 85, 247, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              position: "relative",
              color: "#fff"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setScanGuideModal(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "none",
                color: "#94a3b8",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px"
              }}
            >
              ✕
            </button>

            {/* Header Badge & Title */}
            <div>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 12px",
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#34d399",
                marginBottom: "8px"
              }}>
                <span>✅ ĐÃ SAO CHÉP MÃ VÀO BỘ NHỚ TỰ ĐỘNG!</span>
              </div>
              <h3 style={{ margin: 0, fontSize: "19px", fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>
                {scanGuideModal.title || "Hướng Dẫn Quét 1-Click"}
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Mã quét đã sẵn sàng trong bộ nhớ tạm (Clipboard). Bạn chỉ cần thực hiện <b>3 bước</b> cực nhanh sau:
              </p>
            </div>

            {/* Phần Sao Chép Mã Trực Quan Kèm Nút Bấm */}
            <div style={{
              background: "rgba(0, 0, 0, 0.45)",
              border: "1px solid rgba(168, 85, 247, 0.4)",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5)"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden", flex: 1 }}>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#c084fc", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span>📋 MÃ QUÉT TRÌNH DUYỆT (ĐÃ NẰM SẴN TRONG BỘ NHỚ):</span>
                </div>
                <div style={{
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: "#94a3b8",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}>
                  {scanGuideModal.code ? scanGuideModal.code.slice(0, 75) + "..." : "javascript:(async () => { ... })();"}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (scanGuideModal.code) {
                    try {
                      await navigator.clipboard.writeText(scanGuideModal.code);
                      setGuideCopied(true);
                      setTimeout(() => setGuideCopied(false), 2500);
                    } catch(e) {}
                  }
                }}
                style={{
                  background: guideCopied ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #ec4899, #8b5cf6)",
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
                  flexShrink: 0,
                  boxShadow: "0 4px 12px rgba(236,72,153,0.35)"
                }}
              >
                <span>{guideCopied ? "✅ Đã sao chép!" : "📋 Sao chép mã"}</span>
              </button>
            </div>

            {/* Steps List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {(scanGuideModal.customSteps || [
                {
                  step: 1,
                  gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  title: `Chuyển sang tab ${scanGuideModal.targetName || "TikTok"} trên trình duyệt`,
                  desc: `Mở sẵn tab Kênh hoặc Bộ sưu tập Yêu thích bạn muốn quét (ví dụ: tab 'nhacj').`
                },
                {
                  step: 2,
                  gradient: "linear-gradient(135deg, #ec4899, #f43f5e)",
                  title: "Bấm phím F12 ➔ Chọn tab Console",
                  desc: "Bấm phím F12 (hoặc click chuột phải ➔ Kiểm tra / Inspect) ➔ Chọn tab Console trên thanh công cụ."
                },
                {
                  step: 3,
                  gradient: "linear-gradient(135deg, #10b981, #06b6d4)",
                  title: "Dán mã (Ctrl + V) ➔ Nhấn Enter",
                  desc: "Click chuột vào sau dấu nhắc > ở dòng dưới cùng của Console ➔ Nhấn Ctrl + V rồi ấn phím Enter để chạy!"
                }
              ]).map((s, idx) => (
                <div key={idx} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "12px 14px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px"
                }}>
                  <div style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    background: s.gradient || "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "13px",
                    flexShrink: 0
                  }}>
                    {s.step || idx + 1}
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700, color: "#fff", marginBottom: "2px" }}>
                      {s.title}
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                      {s.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Live sync note */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              background: "rgba(139, 92, 246, 0.12)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              borderRadius: "10px",
              fontSize: "12px",
              color: "#c084fc"
            }}>
              <span style={{ fontSize: "16px" }}>⚡</span>
              <span>Sau khi chạy mã, toàn bộ video sẽ <b>tự động gửi về SocialContent OS</b> theo thời gian thực (Realtime WebSocket)!</span>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  if (scanGuideModal.code) {
                    try {
                      await navigator.clipboard.writeText(scanGuideModal.code);
                      setGuideCopied(true);
                      setTimeout(() => setGuideCopied(false), 2500);
                    } catch(e) {}
                  }
                }}
                style={{ fontSize: "12.5px" }}
              >
                {guideCopied ? "✅ Đã sao chép lại!" : "📋 Sao chép lại mã"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setScanGuideModal(null)}
                style={{
                  background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                  fontWeight: 700,
                  padding: "9px 22px",
                  fontSize: "13px",
                  borderRadius: "10px",
                  boxShadow: "0 4px 16px rgba(236, 72, 153, 0.4)"
                }}
              >
                🚀 Đã hiểu ➔ Đi tới tab {scanGuideModal.targetName || "TikTok"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* TOAST NOTIFICATION PORTAL */}
      {typeof document !== "undefined" && toast && createPortal(
        <div
          style={{
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000001,
            background: toast.type === "error" ? "linear-gradient(135deg, #ef4444, #b91c1c)" : toast.type === "success" ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff",
            padding: "12px 24px",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13.5px",
            fontWeight: 600,
            maxWidth: "90vw"
          }}
          onClick={() => setToast(null)}
        >
          <span style={{ fontSize: "16px" }}>{toast.type === "error" ? "⚠️" : toast.type === "success" ? "✅" : "ℹ️"}</span>
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setToast(null);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              marginLeft: "12px",
              cursor: "pointer",
              fontSize: "16px",
              padding: 0,
              opacity: 0.8
            }}
          >
            ✕
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
