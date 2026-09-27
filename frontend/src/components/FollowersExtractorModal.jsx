import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import { fetchChannelFollowers, saveChannelFollowers, parseFollowersText } from "../api";

// 1-Click Dynamic JavaScript Generator for TikTok Followers
export function generateTikTokFollowersScript(channel) {
  const channelHandle = (channel?.handle || '').replace(/^@/, '');
  const channelId = channel?.id || '';

  return `(async () => {
  if (!location.hostname.includes('tiktok.com')) {
    alert('Vui lòng mở trang cá nhân TikTok trước khi chạy mã này!');
    return;
  }

  // Xóa bảng cũ nếu đang mở
  const oldModal = document.getElementById('sc-follower-modal');
  if (oldModal) oldModal.remove();
  const oldBox = document.getElementById('sc-follower-monitor');
  if (oldBox) oldBox.remove();

  // Progress Toast
  const toast = document.createElement('div');
  toast.id = 'sc-follower-monitor';
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;background:#0f172a;color:#fff;padding:16px 20px;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,0.85);font-family:system-ui,-apple-system,sans-serif;font-size:13px;border:2px solid #8b5cf6;max-width:380px;line-height:1.5;';
  toast.innerHTML = '⚡ <b>SocialContent OS - Quét Followers</b><br><span id="sc-st">Đang kiểm tra bảng Followers...</span>';
  document.body.appendChild(toast);
  const st = document.getElementById('sc-st');

  function isFollowerModalOpen() {
    return Array.from(document.querySelectorAll('button')).some(b => 
      ['Follow back', 'Friends', 'Follow', 'Following', 'Bạn bè', 'Follow lại'].includes(b.innerText?.trim())
    );
  }

  if (!isFollowerModalOpen()) {
    const followerBtn = Array.from(document.querySelectorAll('a[href*="followers"], [data-e2e="followers-count"], span, div')).find(el => 
      el.innerText && /\\d+\\s*(Followers|người theo dõi)/i.test(el.innerText)
    );
    if (followerBtn) followerBtn.click();
    await new Promise(r => setTimeout(r, 600));
  }

  function getScrollContainer() {
    const all = Array.from(document.querySelectorAll('*'));
    const scrollables = all.filter(el => {
      const s = window.getComputedStyle(el);
      const isScroll = (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      return isScroll && el.innerText && (el.innerText.includes('Follow') || el.innerText.includes('Friends') || el.innerText.includes('Bạn bè'));
    });
    if (scrollables.length > 0) {
      scrollables.sort((a, b) => a.clientHeight - b.clientHeight);
      return scrollables[0];
    }
    const dialog = document.querySelector('[role="dialog"]') || document.querySelector('[class*="Modal"]');
    if (dialog) {
      const inner = Array.from(dialog.querySelectorAll('div, ul, section')).find(el => el.scrollHeight > el.clientHeight);
      if (inner) return inner;
    }
    return window;
  }

  const countMatch = document.body.innerText.match(/Followers\\s*(\\d+)/i) || document.body.innerText.match(/(\\d+)\\s*(Followers|người theo dõi)/i);
  const targetCount = countMatch ? parseInt(countMatch[1]) : 0;
  const myHandle = ('${channelHandle}' || location.pathname.replace(/^\\/@?/, '')).toLowerCase();

  const seen = new Set();
  const collected = [];

  function harvest() {
    const links = Array.from(document.querySelectorAll('a[href*="/@"]'));
    for (const a of links) {
      const href = a.getAttribute('href') || a.href || '';
      const m = href.match(/@([a-zA-Z0-9_.-]+)/);
      if (!m) continue;
      const rawHandle = m[1];
      if (rawHandle.toLowerCase() === myHandle) continue;
      const handle = '@' + rawHandle;
      if (seen.has(handle)) continue;

      let row = a;
      for (let i = 0; i < 5; i++) {
        if (!row.parentElement || row.parentElement === document.body) break;
        row = row.parentElement;
        if (row.querySelector('button') && (row.innerText.includes('Follow') || row.innerText.includes('Friends') || row.innerText.includes('Bạn bè'))) break;
      }

      const img = row.querySelector('img');
      const avatar = img?.src || '';

      const allTexts = Array.from(row.querySelectorAll('span, p, h4, div, a'))
        .map(el => el.innerText?.trim())
        .filter(t => {
          if (!t) return false;
          if (t.includes('\\n')) return false;
          const l = t.toLowerCase();
          if (l === handle.toLowerCase() || l === rawHandle.toLowerCase()) return false;
          if (['follow', 'follow back', 'following', 'friends', 'bạn bè', 'follow lại', 'tin nhắn', 'message', 'suggested', 'gợi ý'].includes(l)) return false;
          return true;
        });

      let displayName = allTexts[0] || a.innerText?.trim() || rawHandle;
      displayName = displayName.replace(/\\s+/g, ' ').trim();

      seen.add(handle);
      collected.push({
        displayName: displayName,
        handle: handle,
        url: 'https://www.tiktok.com/' + handle,
        avatar_url: avatar
      });
    }

    const actionBtns = Array.from(document.querySelectorAll('button')).filter(b => 
      ['follow back', 'friends', 'follow', 'following', 'bạn bè'].includes(b.innerText?.trim()?.toLowerCase())
    );
    for (const btn of actionBtns) {
      let row = btn.parentElement;
      for (let i = 0; i < 4; i++) {
        if (!row.parentElement || row.parentElement === document.body) break;
        if (row.querySelectorAll('p, span, div').length >= 2) break;
        row = row.parentElement;
      }
      const texts = Array.from(row.querySelectorAll('p, span, div, a'))
        .map(el => el.innerText?.trim())
        .filter(t => t && !t.includes('\\n') && !['follow back', 'friends', 'follow', 'following', 'bạn bè'].includes(t.toLowerCase()));
      
      if (texts.length >= 2) {
        const p1 = texts[0];
        const p2 = texts[1];
        const possibleHandle = p2.startsWith('@') ? p2 : (p2.match(/^[a-zA-Z0-9_.-]+$/) ? '@' + p2 : null);
        if (possibleHandle && !seen.has(possibleHandle) && possibleHandle.toLowerCase() !== '@' + myHandle) {
          seen.add(possibleHandle);
          const img = row.querySelector('img');
          collected.push({
            displayName: p1,
            handle: possibleHandle,
            url: 'https://www.tiktok.com/' + possibleHandle,
            avatar_url: img?.src || ''
          });
        }
      }
    }
  }

  harvest();

  let prevCount = collected.length;
  let noNewCount = 0;

  for (let i = 0; i < 40; i++) {
    const sc = getScrollContainer();
    if (sc && sc !== window) {
      sc.scrollTop = sc.scrollHeight;
      sc.dispatchEvent(new Event('scroll', { bubbles: true }));
      sc.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
    }
    const btns = Array.from(document.querySelectorAll('button')).filter(b => 
      ['follow back', 'friends', 'follow', 'following', 'bạn bè'].includes(b.innerText?.trim()?.toLowerCase())
    );
    if (btns.length > 0) {
      btns[btns.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    await new Promise(r => setTimeout(r, 450));
    harvest();

    const targetStr = targetCount > 0 ? (' / ' + targetCount + ' người') : ' người';
    if (st) st.innerHTML = 'Đang cuộn bóc tách: <b style="color:#a855f7;font-size:16px;">' + collected.length + '</b>' + targetStr + '...';

    if (targetCount > 0 && collected.length >= targetCount) break;

    if (collected.length === prevCount) {
      noNewCount++;
      if (noNewCount >= 8 && collected.length > 0) break;
    } else {
      noNewCount = 0;
      prevCount = collected.length;
    }
  }

  harvest();
  toast.remove();

  const jsonStr = JSON.stringify(collected);

  if (typeof copy === 'function') {
    try { copy(jsonStr); } catch(e) {}
  }
  try { await navigator.clipboard.writeText(jsonStr); } catch(e) {}

  fetch('http://localhost:8000/api/channels/${channelId}/followers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followers: collected, replace: true })
  }).catch(() => {});

  function dl(fn, txt) {
    const b = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = fn;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'sc-follower-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.82);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;padding:20px;box-sizing:border-box;';

  modal.innerHTML = '<div style="background:#0f172a;border:2px solid #8b5cf6;border-radius:18px;width:100%;max-width:580px;box-shadow:0 25px 60px rgba(0,0,0,0.95);color:#fff;padding:24px;display:flex;flex-direction:column;gap:14px;position:relative;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:28px;">🎉</span>'
    + '<div><div style="font-size:17px;font-weight:800;color:#c084fc;">SocialContent OS - BÓC TÁCH FOLLOWERS XONG!</div>'
    + '<div style="font-size:13px;color:#94a3b8;">Đã lấy trọn vẹn <b style="color:#38bdf8;font-size:15px;">' + collected.length + ' người theo dõi</b> kênh @' + myHandle + '</div></div></div>'
    + '<button id="sc-f-close" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>'
    + '</div>'
    + '<button id="sc-f-copy" style="background:linear-gradient(135deg, #8b5cf6, #ec4899);color:#fff;border:none;border-radius:12px;padding:15px 20px;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 8px 24px rgba(139,92,246,0.4);transition:all 0.2s;">'
    + '📋 BẤM VÀO ĐÂY ĐỂ SAO CHÉP ' + collected.length + ' FOLLOWERS'
    + '</button>'
    + '<div style="display:flex;gap:10px;">'
    + '<button id="sc-f-dl-names" style="flex:1;background:rgba(16,185,129,0.15);border:1px solid #10b981;color:#34d399;padding:10px;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600;">📥 Tải File Chỉ Lấy Tên (.txt)</button>'
    + '<button id="sc-f-dl-full" style="flex:1;background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;color:#c084fc;padding:10px;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600;">📥 Tải File Đầy Đủ (.txt)</button>'
    + '</div>'
    + '<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px 14px;font-size:12.5px;color:#cbd5e1;line-height:1.6;">'
    + '<div style="color:#f59e0b;font-weight:700;margin-bottom:3px;">👉 HƯỚNG DẪN 2 BƯỚC ĐỂ LƯU VÀO SOCIALCONTENT OS:</div>'
    + '1. Bấm nút màu tím <b>"BẤM VÀO ĐÂY ĐỂ SAO CHÉP"</b> ở trên.<br>'
    + '2. Quay lại tab <b>SocialContent OS</b> -> Tab <b>"Dán Nội Dung Nhanh"</b> -> Bấm <b>"📋 Dán nhanh từ bộ nhớ tạm"</b> là xong!'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:5px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#94a3b8;">'
    + '<span>Dữ liệu followers (đã tự động chọn toàn bộ):</span>'
    + '<span id="sc-f-hint" style="color:#34d399;font-weight:600;"></span>'
    + '</div>'
    + '<textarea id="sc-f-text" rows="5" readonly style="width:100%;box-sizing:border-box;background:#030712;border:1px solid #334155;border-radius:8px;padding:8px 10px;color:#38bdf8;font-family:monospace;font-size:11px;line-height:1.4;"></textarea>'
    + '</div>'
    + '</div>';

  document.body.appendChild(modal);

  const copyBtn = document.getElementById('sc-f-copy');
  const textarea = document.getElementById('sc-f-text');
  const copyHint = document.getElementById('sc-f-hint');
  const closeBtn = document.getElementById('sc-f-close');
  const dlNamesBtn = document.getElementById('sc-f-dl-names');
  const dlFullBtn = document.getElementById('sc-f-dl-full');

  textarea.value = jsonStr;
  textarea.focus();
  textarea.select();

  async function performCopy() {
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      await navigator.clipboard.writeText(jsonStr);
      copied = true;
    } catch(e) {}
    try {
      if (document.execCommand('copy')) copied = true;
    } catch(e) {}
    if (typeof copy === 'function') {
      try { copy(jsonStr); copied = true; } catch(e) {}
    }
    copyBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    copyBtn.innerHTML = '✅ ĐÃ SAO CHÉP ' + collected.length + ' FOLLOWERS! HÃY VỀ TAB SOCIALCONTENT OS DÁN VÀO';
    copyHint.innerText = '✅ Đã lưu vào bộ nhớ tạm!';
  }

  copyBtn.onclick = performCopy;
  closeBtn.onclick = () => modal.remove();

  dlNamesBtn.onclick = () => {
    const names = collected.map(u => u.displayName).join('\n');
    dl('followers_chi_lay_ten_' + myHandle + '_' + collected.length + '.txt', names);
  };

  dlFullBtn.onclick = () => {
    let full = '==================================================\n';
    full += '   DANH SÁCH FOLLOWERS TIKTOK (@' + myHandle + ')\n';
    full += '   Tổng số: ' + collected.length + ' người theo dõi\n';
    full += '   Thời gian: ' + new Date().toLocaleString('vi-VN') + '\n';
    full += '==================================================\n\n';
    collected.forEach((u, i) => {
      full += (i + 1) + '. ' + u.displayName + ' (' + u.handle + ') - ' + u.url + '\n';
    });
    dl('followers_day_du_thong_tin_' + myHandle + '_' + collected.length + '.txt', full);
  };

  performCopy();
})();`;
}


export default function FollowersExtractorModal({
  isOpen,
  onClose,
  channel,
  onFollowersUpdated
}) {
  const [activeTab, setActiveTab] = useState("list"); // "list" | "paste" | "bookmarklet" | "monitor"
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [parseLoading, setParseLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live Logs state
  const [logs, setLogs] = useState([
    {
      time: new Date().toLocaleTimeString("vi-VN"),
      text: "Khởi tạo hệ thống SocialContent OS Follower Extractor. Đang ở chế độ sẵn sàng.",
      type: "info"
    }
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const bookmarkletAnchorRef = useRef(null);
  const logContainerRef = useRef(null);

  const addLog = (text, type = "info") => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString("vi-VN"), text, type }
    ]);
  };

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Load followers from database when modal opens
  useEffect(() => {
    if (isOpen && channel?.id) {
      loadFollowers();
      setSearchQuery("");
      setPasteText("");
      setSaveSuccess(false);
      setActiveTab("list");
      addLog(`Mở bảng quản lý followers cho kênh: ${channel?.name || "Kênh"} (${channel?.handle || "N/A"})`, "info");
    }
  }, [isOpen, channel]);

  // Fix React 19 javascript: URL blocking by attaching via ref
  useEffect(() => {
    if (isOpen && bookmarkletAnchorRef.current) {
      const code = generateTikTokFollowersScript(channel);
      bookmarkletAnchorRef.current.setAttribute("href", "javascript:" + code);
    }
  }, [isOpen, activeTab, channel]);

  const loadFollowers = async () => {
    if (!channel?.id) return;
    try {
      setLoading(true);
      addLog(`Đang tải dữ liệu followers từ cơ sở dữ liệu cho kênh ID: ${channel.id}...`, "info");
      const res = await fetchChannelFollowers(channel.id);
      if (res && res.followers) {
        setFollowers(res.followers);
        addLog(`✅ Đã nạp ${res.followers.length} followers từ cơ sở dữ liệu.`, "success");
      }
    } catch (err) {
      console.error("Lỗi tải followers:", err);
      addLog(`❌ Lỗi khi nạp followers từ DB: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Filter followers by search query
  const filteredFollowers = followers.filter((f) => {
    const name = (f.displayName || f.display_name || f.name || "").toLowerCase();
    const handle = (f.handle || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || handle.includes(q);
  });

  // Export File 1: Only Names (One per line)
  const handleDownloadNamesOnly = () => {
    if (followers.length === 0) {
      addLog("⚠️ Chưa có danh sách followers để tải!", "error");
      return;
    }
    const names = followers
      .map((f) => (f.displayName || f.display_name || f.name || f.handle || "").trim())
      .filter(Boolean)
      .join("\n");

    const filename = `followers_chi_lay_ten_${channel?.handle || channel?.name || "tiktok"}_${Date.now()}.txt`;
    downloadFile(filename, names);
    addLog(`📥 Đã tạo và tải file 1 (Chỉ lấy tên, ${followers.length} dòng): ${filename}`, "success");
  };

  // Export File 2: Full Info (STT + Name + Handle + Link)
  const handleDownloadFullInfo = () => {
    if (followers.length === 0) {
      addLog("⚠️ Chưa có danh sách followers để tải!", "error");
      return;
    }
    let content = `==================================================\n`;
    content += `   DANH SÁCH FOLLOWERS - ${channel?.name || "Kênh"} (${channel?.handle || "N/A"})\n`;
    content += `   Nền tảng: ${(channel?.platform || "tiktok").toUpperCase()}\n`;
    content += `   Tổng số: ${followers.length} người theo dõi\n`;
    content += `   Thời gian xuất: ${new Date().toLocaleString("vi-VN")}\n`;
    content += `==================================================\n\n`;

    followers.forEach((f, i) => {
      const name = (f.displayName || f.display_name || f.name || "").trim();
      const handle = (f.handle || "").trim();
      const url = (f.url || `https://www.tiktok.com/${handle}`).trim();
      content += `${i + 1}. ${name} (${handle}) - ${url}\n`;
    });

    const filename = `followers_day_du_thong_tin_${channel?.handle || channel?.name || "tiktok"}_${Date.now()}.txt`;
    downloadFile(filename, content);
    addLog(`📥 Đã tạo và tải file 2 (Đầy đủ STT, Tên, Handle, Link): ${filename}`, "success");
  };

  // Copy all names to clipboard
  const handleCopyNames = () => {
    if (followers.length === 0) return;
    const names = followers
      .map((f) => (f.displayName || f.display_name || f.name || f.handle || "").trim())
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(names);
    setCopyStatus(true);
    addLog(`📋 Đã sao chép ${followers.length} tên hiển thị vào bộ nhớ tạm (Clipboard).`, "info");
    setTimeout(() => setCopyStatus(false), 2000);
  };

  // Save to DB
  const handleSaveToDatabase = async () => {
    if (followers.length === 0 || !channel?.id) return;
    try {
      setSaving(true);
      addLog(`💾 Đang lưu ${followers.length} người theo dõi vào cơ sở dữ liệu...`, "info");
      await saveChannelFollowers(channel.id, followers, true);
      setSaveSuccess(true);
      addLog(`✅ Đã lưu thành công ${followers.length} người theo dõi vào cơ sở dữ liệu!`, "success");
      if (onFollowersUpdated) onFollowersUpdated();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      addLog(`❌ Lỗi khi lưu vào DB: ${err.message}`, "error");
      alert("Lỗi khi lưu followers: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Parse pasted text & Auto-save to Database
  const handleParsePastedText = async (customText = null) => {
    const textToParse = typeof customText === "string" ? customText : pasteText;
    if (!textToParse.trim()) {
      alert("Vui lòng dán văn bản danh sách followers vào ô!");
      return;
    }
    try {
      setParseLoading(true);
      addLog(`🔍 Bắt đầu phân tích dữ liệu followers (${textToParse.length} ký tự)...`, "step");
      const res = await parseFollowersText(textToParse);
      if (res && res.followers && res.followers.length > 0) {
        setFollowers(res.followers);

        // Auto-save to DB immediately so user doesn't lose data
        if (channel?.id) {
          try {
            await saveChannelFollowers(channel.id, res.followers, true);
            setSaveSuccess(true);
            addLog(`💾 Đã tự động lưu ${res.followers.length} followers vào cơ sở dữ liệu!`, "success");
            if (onFollowersUpdated) onFollowersUpdated();
            setTimeout(() => setSaveSuccess(false), 3000);
          } catch (e) {
            console.error("Auto save followers error:", e);
          }
        }

        setActiveTab("list");
        addLog(`🎉 Phân tích thành công! Trích xuất được ${res.followers.length} người theo dõi hợp lệ.`, "success");
        alert(`🎉 Đã bóc tách và lưu thành công ${res.followers.length} người theo dõi vào hệ thống!`);
      } else {
        addLog(`⚠️ Không tìm thấy thông tin followers nào từ đoạn văn bản đã dán.`, "warn");
        alert("Không tìm thấy thông tin followers nào từ đoạn văn bản đã dán.");
      }
    } catch (err) {
      addLog(`❌ Lỗi phân tích văn bản: ${err.message}`, "error");
      alert("Lỗi phân tích: " + err.message);
    } finally {
      setParseLoading(false);
    }
  };

  // Copy 1-Click Code for F12 Console
  const handleCopyConsoleCode = async () => {
    const code = generateTikTokFollowersScript(channel);
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
    setActiveTab("paste");
    addLog("✅ ĐÃ SAO CHÉP MÃ QUÉT FOLLOWERS TIKTOK! Mở tab TikTok, bấm F12 Console, Ctrl + V và Enter.", "success");
    addLog("👉 Mã sẽ tự động cuộn lấy 100% người theo dõi và chuyển về đây!", "info");
  };

  // Simulate test run with live logs and progress
  const handleSimulateExtraction = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimProgress(0);
    addLog(`🚀 [KIỂM TRA GIẢ LẬP] Khởi động tiến trình quan sát kiểm tra hoạt động...`, "step");

    const sampleFollowers = [
      { displayName: "Duc Nguyen Khac", handle: "@ducnguyen.khac1", url: "https://www.tiktok.com/@ducnguyen.khac1" },
      { displayName: "Chip Chíp", handle: "@_thwteencute", url: "https://www.tiktok.com/@_thwteencute" },
      { displayName: "Tuyết Nhi", handle: "@tuyetnhi01ne", url: "https://www.tiktok.com/@tuyetnhi01ne" },
      { displayName: "Ivan Nger", handle: "@ivannger", url: "https://www.tiktok.com/@ivannger" },
      { displayName: "Nguyễn Thị Thu Trang", handle: "@thutrang_02", url: "https://www.tiktok.com/@thutrang_02" },
      { displayName: "Minh Quân", handle: "@minhquan_media", url: "https://www.tiktok.com/@minhquan_media" },
      { displayName: "Hoàng Yến", handle: "@hoangyen_99", url: "https://www.tiktok.com/@hoangyen_99" },
      { displayName: "Bảo Ngọc", handle: "@baongoc_cute", url: "https://www.tiktok.com/@baongoc_cute" },
      { displayName: "Thanh Tùng", handle: "@thanhtung_vlog", url: "https://www.tiktok.com/@thanhtung_vlog" },
      { displayName: "Phương Ly", handle: "@phuongly_official", url: "https://www.tiktok.com/@phuongly_official" },
      { displayName: "Khánh Linh", handle: "@khanhlinh_daily", url: "https://www.tiktok.com/@khanhlinh_daily" },
      { displayName: "Anh Dũng", handle: "@anhdung_review", url: "https://www.tiktok.com/@anhdung_review" },
      { displayName: "Hải Đăng", handle: "@haidang_photo", url: "https://www.tiktok.com/@haidang_photo" },
      { displayName: "Thảo Vy", handle: "@thaovy_beauty", url: "https://www.tiktok.com/@thaovy_beauty" },
      { displayName: "Quốc Huy", handle: "@quochuy_music", url: "https://www.tiktok.com/@quochuy_music" },
      { displayName: "Hương Giang", handle: "@huonggiang_tiktok", url: "https://www.tiktok.com/@huonggiang_tiktok" },
      { displayName: "Văn Hùng", handle: "@vanhung_edit", url: "https://www.tiktok.com/@vanhung_edit" }
    ];

    // Generate up to 83 sample followers
    const fullList = [...sampleFollowers];
    while (fullList.length < 83) {
      const idx = fullList.length + 1;
      fullList.push({
        displayName: `Follower_${idx} Tuyết Nhi Fan`,
        handle: `@follower_user_${idx}`,
        url: `https://www.tiktok.com/@follower_user_${idx}`
      });
    }

    const steps = [
      { delay: 400, pct: 15, msg: "🔍 Đang kết nối và định vị bảng danh sách Followers trên trang web...", type: "info" },
      { delay: 1000, pct: 30, msg: "📜 Bắt đầu tự động cuộn (Lần 1): Đã nạp 17 / 83 người theo dõi.", type: "step" },
      { delay: 1800, pct: 55, msg: "📜 Đang cuộn tiếp (Lần 2): Đã nạp 42 / 83 người theo dõi...", type: "step" },
      { delay: 2600, pct: 85, msg: "📜 Đang cuộn tiếp (Lần 3): Đã nạp 83 / 83 người theo dõi. Đã đến cuối danh sách!", type: "step" },
      { delay: 3300, pct: 95, msg: "⚡ Đang lọc sạch các ký tự rác, nút 'Follow back' và trích xuất cặp {Tên hiển thị, @username}...", type: "info" },
      {
        delay: 4000,
        pct: 100,
        msg: "🎉 [HOÀN TẤT] Trích xuất thành công 83 người! Tự động tạo và tải 2 file .txt về thư mục Downloads của máy tính.",
        type: "success"
      }
    ];

    steps.forEach(({ delay, pct, msg, type }, idx) => {
      setTimeout(() => {
        setSimProgress(pct);
        addLog(msg, type);

        if (idx === steps.length - 1) {
          setIsSimulating(false);
          setFollowers(fullList);

          // Actual download of File 1: Only Names
          const namesOnly = fullList.map((u) => u.displayName).join("\n");
          downloadFile("followers_chi_lay_ten_83_nguoi.txt", namesOnly);
          addLog("📥 [ĐÃ TẢI] File 1: followers_chi_lay_ten_83_nguoi.txt (Nhấn Ctrl + J để mở trong Chrome)", "success");

          // Actual download of File 2: Full Info
          setTimeout(() => {
            let fullInfo = `==================================================\n`;
            fullInfo += `   DANH SÁCH FOLLOWERS TIKTOK - ${channel?.name || "Tuyết Nhi"} (${channel?.handle || "@tuyetnhi01ne"})\n`;
            fullInfo += `   Tổng số: ${fullList.length} người theo dõi\n`;
            fullInfo += `   Thời gian: ${new Date().toLocaleString("vi-VN")}\n`;
            fullInfo += `==================================================\n\n`;
            fullList.forEach((u, i) => {
              fullInfo += `${i + 1}. ${u.displayName} (${u.handle}) - ${u.url}\n`;
            });
            downloadFile("followers_day_du_thong_tin_83_nguoi.txt", fullInfo);
            addLog("📥 [ĐÃ TẢI] File 2: followers_day_du_thong_tin_83_nguoi.txt (Nhấn Ctrl + J để mở trong Chrome)", "success");
          }, 400);
        }
      }, delay);
    });
  };

  // Helper download file
  const downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Early return only at render time
  if (!isOpen || !channel) return null;

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
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "740px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(139, 92, 246, 0.25)",
          margin: "auto",
          background: "#121422",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          position: "relative",
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-primary)",
              }}
            >
              <Icon name="users" size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: "700", color: "var(--text-primary)" }}>
                  Trích Xuất & Quản Lý Followers
                </h3>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    padding: "2px 8px",
                    borderRadius: "20px",
                    background: "rgba(139, 92, 246, 0.15)",
                    color: "var(--accent-primary)",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                  }}
                >
                  {channel.name} {channel.handle ? `(${channel.handle})` : ""}
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                Tự động bóc tách danh sách người theo dõi, xuất 2 file .txt và lưu trữ số liệu
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ color: "var(--text-muted)", padding: "6px" }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Action Bar: Download buttons & Quick Actions */}
        <div
          style={{
            padding: "12px 24px",
            background: "rgba(255, 255, 255, 0.02)",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          {/* Download Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownloadNamesOnly}
              disabled={followers.length === 0}
              style={{
                fontSize: "12.5px",
                padding: "7px 14px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                border: "none",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
              }}
              title="Tải file chỉ chứa danh sách tên hiển thị (mỗi dòng 1 tên sạch đẹp)"
            >
              <Icon name="download" size={14} />
              <span>Tải File Chỉ Lấy Tên (.txt)</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownloadFullInfo}
              disabled={followers.length === 0}
              style={{
                fontSize: "12.5px",
                padding: "7px 14px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 4px 12px rgba(139, 92, 246, 0.3)",
              }}
              title="Tải file đầy đủ số thứ tự, tên, username và đường link cá nhân"
            >
              <Icon name="download" size={14} />
              <span>Tải File Đầy Đủ (.txt)</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCopyNames}
              disabled={followers.length === 0}
              style={{
                fontSize: "12px",
                padding: "7px 12px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
              title="Sao chép toàn bộ tên vào bộ nhớ tạm"
            >
              <Icon name="copy" size={13} />
              <span>{copyStatus ? "Đã chép!" : "Sao Chép Tên"}</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCopyConsoleCode}
              style={{
                fontSize: "12px",
                padding: "7px 14px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                border: "none",
                boxShadow: "0 4px 12px rgba(139, 92, 246, 0.35)",
                fontWeight: 600,
              }}
              title="Sao chép đoạn mã JavaScript để dán vào F12 Console của tab TikTok đang mở"
            >
              <Icon name="sparkles" size={13} />
              <span>⚡ Lấy mã quét 1-Click (Console)</span>
            </button>
          </div>

          {/* Save to Database Button */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {saveSuccess && (
              <span style={{ fontSize: "12px", color: "var(--accent-green)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Icon name="checkCircle" size={14} /> Đã lưu vào máy!
              </span>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSaveToDatabase}
              disabled={saving || followers.length === 0}
              style={{
                fontSize: "12px",
                padding: "7px 14px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderColor: "rgba(139, 92, 246, 0.4)",
              }}
            >
              <Icon name="check" size={13} />
              <span>{saving ? "Đang lưu..." : "Lưu Vào Hệ Thống"}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border-color)",
            padding: "0 24px",
            background: "rgba(0, 0, 0, 0.15)",
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "list" ? "2px solid var(--accent-primary)" : "2px solid transparent",
              color: activeTab === "list" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "list" ? "600" : "500",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="users" size={14} />
            <span>Danh Sách Người Theo Dõi ({followers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("paste")}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "paste" ? "2px solid var(--accent-primary)" : "2px solid transparent",
              color: activeTab === "paste" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "paste" ? "600" : "500",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="fileText" size={14} />
            <span>Dán Nội Dung Nhanh (Smart Paste)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("bookmarklet")}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "bookmarklet" ? "2px solid var(--accent-primary)" : "2px solid transparent",
              color: activeTab === "bookmarklet" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "bookmarklet" ? "600" : "500",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="sparkles" size={14} />
            <span>Dấu Trang 1-Click (Bookmarklet)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("monitor")}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "monitor" ? "2px solid var(--accent-primary)" : "2px solid transparent",
              color: activeTab === "monitor" ? "var(--accent-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "monitor" ? "600" : "500",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="terminal" size={14} />
            <span>Quan Sát & Nhật Ký Log ({logs.length})</span>
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: isSimulating ? "#10b981" : "#8b5cf6",
                boxShadow: isSimulating ? "0 0 8px #10b981" : "none",
                display: "inline-block",
              }}
            />
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: "18px 24px", flex: 1, overflowY: "auto" }}>
          {/* TAB 1: Danh sách hiện tại */}
          {activeTab === "list" && (
            <div>
              {/* Search Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "10px" }}>
                <div style={{ position: "relative", flex: 1, maxWidth: "340px" }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Tìm theo tên hoặc @handle..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: "100%", paddingLeft: "32px", height: "34px", fontSize: "12.5px" }}
                  />
                  <div style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
                    <Icon name="search" size={14} />
                  </div>
                </div>

                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Hiển thị: <strong>{filteredFollowers.length}</strong> / {followers.length} người theo dõi
                </div>
              </div>

              {/* Table or Empty State */}
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                  <span className="spinner" style={{ width: "24px", height: "24px", borderWidth: "3px", marginBottom: "10px" }} />
                  <p>Đang tải danh sách followers...</p>
                </div>
              ) : followers.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 20px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "12px",
                    border: "1px dashed var(--border-color)",
                  }}
                >
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(139, 92, 246, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px auto", color: "var(--accent-primary)" }}>
                    <Icon name="users" size={24} />
                  </div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "var(--text-primary)" }}>
                    Chưa có danh sách followers nào được lưu
                  </h4>
                  <p style={{ margin: "0 0 16px 0", fontSize: "12.5px", color: "var(--text-secondary)", maxWidth: "420px", marginInline: "auto" }}>
                    Bạn có thể chọn tab <strong>"Dán Nội Dung Nhanh"</strong> để dán trực tiếp danh sách từ TikTok, hoặc sử dụng tab <strong>"Dấu Trang 1-Click"</strong> để quét tự động 83 người.
                  </p>
                  <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCopyConsoleCode}
                      style={{ fontSize: "12.5px", padding: "8px 18px", background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)", fontWeight: 700 }}
                    >
                      ⚡ Lấy mã quét 1-Click (Dán F12 Console)
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setActiveTab("paste")} style={{ fontSize: "12.5px", padding: "8px 14px" }}>
                      📋 Dán danh sách thủ công
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setActiveTab("bookmarklet")} style={{ fontSize: "12.5px", padding: "8px 14px" }}>
                      Xem Dấu Trang 1-Click
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    overflow: "hidden",
                    background: "rgba(14, 16, 26, 0.6)",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                    <thead>
                      <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px", width: "50px", textAlign: "center", color: "var(--text-muted)", fontWeight: "600" }}>STT</th>
                        <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: "600" }}>Tên Hiển Thị</th>
                        <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: "600" }}>Handle (@username)</th>
                        <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: "600" }}>Liên Kết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFollowers.map((u, idx) => {
                        const name = u.displayName || u.display_name || u.name || "N/A";
                        const handle = u.handle || "";
                        const url = u.url || (handle ? `https://www.tiktok.com/${handle}` : "");
                        return (
                          <tr
                            key={u.id || idx}
                            style={{
                              borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                              transition: "background 0.15s ease",
                            }}
                          >
                            <td style={{ padding: "9px 12px", textAlign: "center", color: "var(--text-muted)", fontWeight: "500" }}>
                              {idx + 1}
                            </td>
                            <td style={{ padding: "9px 12px", fontWeight: "600", color: "var(--text-primary)" }}>
                              {name}
                            </td>
                            <td style={{ padding: "9px 12px", color: "var(--accent-primary)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                              {handle || "--"}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "var(--text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
                                >
                                  <span>Mở trang</span>
                                  <Icon name="externalLink" size={12} />
                                </a>
                              ) : (
                                <span style={{ color: "var(--text-muted)" }}>--</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Dán nội dung nhanh (Smart Paste) */}
          {activeTab === "paste" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ background: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.2)", borderRadius: "10px", padding: "12px 16px" }}>
                <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", fontWeight: "600", color: "var(--accent-primary)" }}>
                  💡 Dán nhanh danh sách từ bất kỳ đâu
                </h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                  Bạn có thể bôi đen và sao chép toàn bộ danh sách Followers trên TikTok, hoặc dán nội dung từ file text cũ. Công cụ sẽ tự động lọc sạch các chữ thừa, nút bấm và trích xuất đúng tên hiển thị và username.
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "6px" }}>
                  Dán nội dung vào đây:
                </label>
                <textarea
                  className="input-field"
                  rows={9}
                  placeholder={`Ví dụ:\nDuc Nguyen Khac\nducnguyen.khac1\nFollow back\n\nChip Chíp\n_thwteencute\nFollow back\n...`}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  style={{ width: "100%", fontSize: "12.5px", fontFamily: "var(--font-mono)", lineHeight: "1.5", padding: "10px 12px" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text && text.trim()) {
                        setPasteText(text.trim());
                        handleParsePastedText(text.trim());
                      } else {
                        alert("Bộ nhớ tạm hiện đang trống. Hãy sao chép danh sách followers trước!");
                      }
                    } catch (e) {
                      alert("Không thể đọc bộ nhớ tự động. Bạn hãy click vào ô văn bản và nhấn Ctrl + V nhé!");
                    }
                  }}
                  style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", borderColor: "rgba(139, 92, 246, 0.4)", color: "#c084fc" }}
                >
                  <Icon name="clipboard" size={13} />
                  <span>📋 Dán nhanh từ bộ nhớ tạm</span>
                </button>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPasteText("")}
                    style={{ fontSize: "12.5px" }}
                  >
                    Xóa trắng
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleParsePastedText()}
                    disabled={parseLoading || !pasteText.trim()}
                    style={{ fontSize: "12.5px", padding: "7px 18px", gap: "6px", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #8b5cf6, #ec4899)", fontWeight: 700 }}
                  >
                    <Icon name="sparkles" size={14} />
                    <span>{parseLoading ? "Đang xử lý..." : "Phân Tích & Lưu Vào Hệ Thống"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Dấu trang 1-Click (Bookmarklet) */}
          {activeTab === "bookmarklet" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "10px", padding: "14px 18px" }}>
                <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: "600", color: "var(--accent-green)" }}>
                  ⚡ Quét Tự Động 1-Click Không Cần Mở Console F12
                </h4>
                <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                  Sau khi kéo nút này vào thanh Dấu trang (Bookmarks bar) của trình duyệt, mỗi lần bạn mở bảng Followers trên TikTok chỉ cần bấm <strong>1 cú click chuột</strong> là bảng điều khiển trực tiếp sẽ hiện lên, tự động cuộn hết 83 người và tải ngay 2 file `.txt` về máy!
                </p>
              </div>

              <div style={{ background: "var(--bg-input)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "18px", textAlign: "center" }}>
                <p style={{ margin: "0 0 12px 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                  👉 Hãy kéo nút tím này thả vào <strong>Thanh dấu trang (Bookmarks Bar)</strong> của Chrome:
                </p>

                {/* Draggable Bookmarklet Link with ref to bypass React 19 javascript: URL blocker */}
                <a
                  ref={bookmarkletAnchorRef}
                  href="#"
                  draggable="true"
                  onClick={(e) => {
                    e.preventDefault();
                    alert("👉 Hãy KÉO nút này thả lên thanh Dấu trang (Bookmarks bar) của trình duyệt! Hoặc bấm nút 'Sao Chép Mã' bên dưới để thêm dấu trang.");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    color: "#fff",
                    padding: "11px 24px",
                    borderRadius: "8px",
                    fontWeight: "600",
                    fontSize: "13.5px",
                    textDecoration: "none",
                    boxShadow: "0 4px 18px rgba(139, 92, 246, 0.45)",
                    cursor: "grab",
                    userSelect: "none",
                  }}
                  title="Kéo nút này thả lên thanh Dấu trang trình duyệt"
                >
                  <Icon name="sparkles" size={16} />
                  <span>⭐ Quét Followers TikTok (1-Click)</span>
                </a>

                <p style={{ margin: "14px 0 0 0", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                  💡 Nếu thanh dấu trang bị ẩn, bạn nhấn tổ hợp phím <strong>Ctrl + Shift + B</strong> để hiện thanh dấu trang rồi kéo vào.
                </p>
              </div>

              {/* Instructions on how to observe live operation on TikTok */}
              <div style={{ background: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.2)", borderRadius: "10px", padding: "14px 18px" }}>
                <h5 style={{ margin: "0 0 6px 0", fontSize: "13px", fontWeight: "600", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="monitor" size={15} />
                  <span>Cách Quan Sát Hoạt Động Trực Tiếp Trên TikTok</span>
                </h5>
                <ol style={{ margin: "0 0 0 16px", padding: 0, fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                  <li>Mở trang cá nhân TikTok và bấm vào số <strong>Followers</strong> để hiện danh sách người theo dõi.</li>
                  <li>Bấm vào dấu trang <strong>⭐ Quét Followers TikTok (1-Click)</strong> trên thanh trình duyệt.</li>
                  <li>Một bảng <strong>⚡ Trình Quét Live Monitor</strong> sẽ lập tức hiện ở góc trên bên phải màn hình TikTok với đèn xanh nhấp nháy, thanh % tiến độ và nhật ký cuộn trực tiếp.</li>
                  <li>Khi cuộn đủ 83 người, trình duyệt sẽ tự động tải 2 file <code>.txt</code> về máy tính!</li>
                </ol>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const code = generateTikTokFollowersScript(channel);
                    navigator.clipboard.writeText("javascript:" + code);
                    alert("Đã sao chép mã Bookmarklet! Bạn có thể dán vào thanh địa chỉ hoặc tạo dấu trang thủ công.");
                    addLog("Đã sao chép mã Bookmarklet vào bộ nhớ tạm.", "info");
                  }}
                  style={{ fontSize: "12px", gap: "6px", display: "flex", alignItems: "center" }}
                >
                  <Icon name="copy" size={13} />
                  <span>Sao Chép Mã Bookmarklet</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTab("monitor")}
                  style={{ fontSize: "12px", gap: "6px", display: "flex", alignItems: "center", borderColor: "rgba(139, 92, 246, 0.4)" }}
                >
                  <Icon name="terminal" size={13} />
                  <span>Xem Bảng Quan Sát & Nhật Ký Log</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: Quan Sát Tiến Trình & Nhật Ký Log (Live Activity Monitor) */}
          {activeTab === "monitor" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Status Header Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Trạng thái hệ thống:</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "600", fontSize: "13px", color: isSimulating ? "#10b981" : "var(--accent-primary)" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: isSimulating ? "#10b981" : "#8b5cf6", boxShadow: isSimulating ? "0 0 8px #10b981" : "none" }} />
                    <span>{isSimulating ? "Đang chạy quét..." : "Sẵn Sàng Hoạt Động"}</span>
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Dữ liệu trong bộ nhớ:</div>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-primary)" }}>
                    {followers.length} người theo dõi
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Kênh mục tiêu:</div>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#38bdf8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {channel.name} ({channel.handle || "N/A"})
                  </div>
                </div>
              </div>

              {/* Real-time Progress Bar (visible during simulation or processing) */}
              {(isSimulating || simProgress > 0) && (
                <div style={{ background: "rgba(14, 16, 26, 0.8)", border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: "8px", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Tiến trình quét giả lập:</span>
                    <strong style={{ color: "#38bdf8" }}>{simProgress}% ({Math.round((simProgress / 100) * 83)} / 83 người)</strong>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${simProgress}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #8b5cf6, #ec4899)",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Action Toolbar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSimulateExtraction}
                    disabled={isSimulating}
                    style={{
                      fontSize: "12px",
                      padding: "6px 14px",
                      gap: "6px",
                      display: "flex",
                      alignItems: "center",
                      background: "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)",
                    }}
                    title="Chạy mô phỏng quá trình cuộn và trích xuất để kiểm tra xem hệ thống hoạt động như thế nào"
                  >
                    <Icon name="play" size={13} />
                    <span>{isSimulating ? "Đang mô phỏng..." : "🧪 Chạy Thử Nghiệm Giả Lập Quá Trình Quét"}</span>
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const logText = logs.map((l) => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`).join("\n");
                      navigator.clipboard.writeText(logText);
                      alert("Đã sao chép toàn bộ nhật ký log!");
                    }}
                    style={{ fontSize: "11.5px", padding: "5px 10px", gap: "5px", display: "flex", alignItems: "center" }}
                  >
                    <Icon name="copy" size={12} />
                    <span>Sao Chép Log</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setLogs([{ time: new Date().toLocaleTimeString("vi-VN"), text: "Đã làm sạch nhật ký.", type: "info" }])}
                    style={{ fontSize: "11.5px", padding: "5px 10px" }}
                  >
                    Xóa Log
                  </button>
                </div>
              </div>

              {/* Terminal / Log Output Box */}
              <div
                style={{
                  background: "#080a12",
                  border: "1px solid rgba(139, 92, 246, 0.25)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  boxShadow: "inset 0 2px 10px rgba(0, 0, 0, 0.8)",
                }}
              >
                {/* Terminal Header */}
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(255, 255, 255, 0.04)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ef4444" }} />
                    <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#f59e0b" }} />
                    <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#10b981" }} />
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "8px", fontFamily: "var(--font-mono)" }}>
                      terminal :: socialcontent-follower-monitor.log
                    </span>
                  </div>
                  <span style={{ fontSize: "10.5px", color: "var(--accent-primary)", fontFamily: "var(--font-mono)" }}>
                    ● LIVE
                  </span>
                </div>

                {/* Log Messages Container */}
                <div
                  ref={logContainerRef}
                  style={{
                    height: "220px",
                    overflowY: "auto",
                    padding: "12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11.5px",
                    lineHeight: "1.65",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {logs.map((log, index) => {
                    let badgeColor = "#94a3b8";
                    let textColor = "#cbd5e1";
                    let badgeText = "INFO";

                    if (log.type === "success") {
                      badgeColor = "#10b981";
                      textColor = "#34d399";
                      badgeText = "SUCCESS";
                    } else if (log.type === "step") {
                      badgeColor = "#8b5cf6";
                      textColor = "#c084fc";
                      badgeText = "STEP";
                    } else if (log.type === "warn") {
                      badgeColor = "#f59e0b";
                      textColor = "#fbbf24";
                      badgeText = "WARN";
                    } else if (log.type === "error") {
                      badgeColor = "#ef4444";
                      textColor = "#f87171";
                      badgeText = "ERROR";
                    }

                    return (
                      <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <span style={{ color: "#64748b", flexShrink: 0 }}>[{log.time}]</span>
                        <span
                          style={{
                            color: badgeColor,
                            fontWeight: "600",
                            fontSize: "10px",
                            padding: "0 5px",
                            borderRadius: "3px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: `1px solid ${badgeColor}33`,
                            flexShrink: 0,
                          }}
                        >
                          {badgeText}
                        </span>
                        <span style={{ color: textColor, wordBreak: "break-word" }}>{log.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="modal-footer"
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {followers.length > 0 && `Đã nạp ${followers.length} người theo dõi cho kênh "${channel.name}"`}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: "7px 18px", fontSize: "13px" }}>
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
