const envApiUrl = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
  : "";

const host = (typeof window !== "undefined" && window.location.hostname) ? window.location.hostname : "localhost";
const defaultBase = `http://${host}:8000`;
const serverBase = envApiUrl || defaultBase;
const isSecure = serverBase.startsWith("https://");
const wsProto = isSecure ? "wss://" : "ws://";
const wsHost = serverBase.replace(/^https?:\/\//, "");

export const API_BASE = `${serverBase}/api`;
export const MEDIA_BASE = `${serverBase}/media/downloads`;
export const WS_BASE = `${wsProto}${wsHost}/ws/progress`;

export function getFullMediaUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  if (url.startsWith("/media/downloads")) {
    return `${serverBase}${url}`;
  }
  if (url.startsWith("/media")) {
    return `${serverBase}${url}`;
  }
  return `${serverBase}/media/downloads/${url}`;
}

export function getVideoStreamUrl(video) {
  if (!video) return "";
  // 1. Luôn ưu tiên endpoint stream chuẩn của backend theo video.id (tự động phục vụ file local cache 0ms hoặc kéo Drive nếu thiếu, hỗ trợ HTTP Range 206)
  if (video.id) {
    return `${API_BASE}/videos/${video.id}/stream`;
  }
  if (video.file_path) {
    const filename = video.file_path.split(/[\\/]/).pop();
    if (filename) {
      return `${MEDIA_BASE}/${filename}`;
    }
  }
  return "";
}

export function getThumbnailSrc(video) {
  if (!video) return "";
  // 1. Luôn ưu tiên endpoint video thumbnail theo ID (Backend phục vụ trực tiếp SSD 0ms, tự động trích xuất frame nếu thiếu)
  if (video.id) {
    return `${API_BASE}/videos/${video.id}/thumbnail`;
  }
  // 2. File local thumbnail nếu có
  if (video.local_thumbnail) {
    const filename = video.local_thumbnail.split(/[\\/]/).pop();
    if (filename) return `${MEDIA_BASE}/thumbnails/${filename}`;
  }
  // 3. Nếu là video Drive thuần
  if (video.drive_file_id) {
    return `${API_BASE}/drive/thumbnail/${video.drive_file_id}`;
  }
  // 4. Link CDN ngoài hợp lệ (không phải link googleusercontent tạm thời)
  if (video.thumbnail_url && video.thumbnail_url.startsWith("http") && !video.thumbnail_url.includes("googleusercontent.com")) {
    return video.thumbnail_url;
  }
  return video.thumbnail_url || "";
}

export function preloadVideo(videoId) {
  if (!videoId) return;
  fetch(`${API_BASE}/videos/${videoId}/preload`, { method: "POST" }).catch(() => {});
}

export async function batchCacheVideos(videoIds) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) return;
  try {
    await fetch(`${API_BASE}/videos/batch-cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_ids: videoIds })
    });
  } catch (err) {
    // Non-blocking background cache
  }
}

export function getVideoThumbnail(video) {
  if (!video) return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80";
  // 1. Ảnh lưu sẵn trên máy tính (nhanh nhất, 0ms)
  if (video.local_thumbnail) {
    const filename = video.local_thumbnail.split(/[\\/]/).pop();
    return `${MEDIA_BASE}/thumbnails/${filename}`;
  }
  // 2. Ảnh từ CDN gốc của nền tảng (X/Twitter, TikTok, YouTube... trình duyệt tải trực tiếp từ CDN)
  if (video.thumbnail_url && !video.thumbnail_url.includes("googleusercontent.com/d/")) {
    return video.thumbnail_url;
  }
  // 3. Nếu là video thuần Drive hoặc không có link ngoài, mới dùng proxy Drive
  if (video.drive_file_id) {
    return `${serverBase}/api/drive/thumbnail/${video.drive_file_id}`;
  }
  return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80";
}

export async function fetchCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  if (!res.ok) throw new Error("Lỗi khi tải danh mục");
  return res.json();
}

export async function createCategory(cat) {
  const res = await fetch(`${API_BASE}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cat),
  });
  if (!res.ok) throw new Error("Lỗi khi tạo danh mục");
  return res.json();
}

export async function updateCategory(id, data) {
  const res = await fetch(`${API_BASE}/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi cập nhật danh mục");
  }
  return res.json();
}

export async function deleteCategory(id) {
  const res = await fetch(`${API_BASE}/categories/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Lỗi khi xóa danh mục");
  return res.json();
}

export async function toggleFavoriteCategory(id, currentFavorite = 0) {
  try {
    const res = await fetch(`${API_BASE}/categories/${id}/toggle-favorite`, {
      method: "POST",
    });
    if (res.ok) {
      return await res.json();
    }
    // Fallback nếu route POST chưa kịp cập nhật hoặc 404
    const nextFav = currentFavorite ? 0 : 1;
    return await updateCategory(id, { is_favorite: nextFav });
  } catch {
    const nextFav = currentFavorite ? 0 : 1;
    return await updateCategory(id, { is_favorite: nextFav });
  }
}

export async function scrapeUrl(url) {
  const res = await fetch(`${API_BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể phân tích video này");
  }
  return res.json();
}

export async function scanDriveSource(url) {
  const res = await fetch(`${API_BASE}/drive/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể phân tích thư mục / file Google Drive");
  }
  return res.json();
}

export async function checkDeduplication(urls) {
  const res = await fetch(`${API_BASE}/urls/deduplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể kiểm tra trùng lặp");
  }
  return res.json();
}

export async function fetchGasCode() {
  const res = await fetch(`${API_BASE}/drive/gas-code`);
  if (!res.ok) throw new Error("Không thể tải mã nguồn Apps Script");
  return res.json();
}

export async function fetchDriveMediaInfo(fileId) {
  try {
    const res = await fetch(`${API_BASE}/drive/media-info/${fileId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}


export async function scanTikTokChannel(channelUrl, mode = "30_days", daysLimit = 30, startDate = null, endDate = null) {
  const res = await fetch(`${API_BASE}/tiktok/channel/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel_url: channelUrl,
      mode: mode,
      days_limit: daysLimit,
      start_date: startDate,
      end_date: endDate,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi quét kênh TikTok. Hãy đảm bảo link kênh chính xác.");
  }
  return res.json();
}

export async function ingestTikTokChannelVideos(items, channelUrl = "", mode = "30_days", daysLimit = 30, startDate = null, endDate = null, collectionName = null, isCollection = false) {
  const res = await fetch(`${API_BASE}/tiktok/channel/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items,
      channel_url: channelUrl,
      mode: mode,
      days_limit: daysLimit,
      start_date: startDate,
      end_date: endDate,
      collection_name: collectionName,
      is_collection: isCollection || (channelUrl && channelUrl.includes("/collection/")),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi nạp danh sách video từ kênh hoặc bộ sưu tập.");
  }
  return res.json();
}

export async function fetchTikTokBookmarklet() {
  const res = await fetch(`${API_BASE}/tiktok/channel/bookmarklet`);
  if (!res.ok) throw new Error("Không thể tải mã Bookmarklet");
  return res.json();
}

export async function scanDouyinChannel(channelUrl, mode = "30_days", daysLimit = 30, startDate = null, endDate = null) {
  const res = await fetch(`${API_BASE}/douyin/channel/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel_url: channelUrl,
      mode: mode,
      days_limit: daysLimit,
      start_date: startDate,
      end_date: endDate,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi quét kênh Douyin. Hãy đảm bảo link kênh chính xác.");
  }
  return res.json();
}

export async function ingestDouyinChannelVideos(items, channelUrl = "", mode = "all", daysLimit = 30, startDate = null, endDate = null) {
  const res = await fetch(`${API_BASE}/douyin/channel/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items,
      channel_url: channelUrl,
      mode: mode,
      days_limit: daysLimit,
      start_date: startDate,
      end_date: endDate,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi nạp danh sách video từ kênh Douyin.");
  }
  return res.json();
}

export async function fetchDouyinBookmarklet() {
  const res = await fetch(`${API_BASE}/douyin/channel/bookmarklet`);
  if (!res.ok) throw new Error("Không thể tải mã Bookmarklet Douyin");
  return res.json();
}

export async function fetchLatestChannelIngest() {
  try {
    const res = await fetch(`${API_BASE}/channel/latest-ingest`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}


export async function clearChannelNewVideos(id) {
  const res = await fetch(`${API_BASE}/channels/${id}/clear-new-videos`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi xóa cảnh báo video mới");
  }
  return res.json();
}

export async function downloadSingleVideo(url, categoryId, syncToDrive, isPrivate = false) {
  const res = await fetch(`${API_BASE}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, category_id: categoryId, sync_to_drive: syncToDrive, is_private: isPrivate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi gửi yêu cầu tải");
  }
  return res.json();
}

export async function downloadBatchVideos(urls, categoryId, syncToDrive, isPrivate = false) {
  const res = await fetch(`${API_BASE}/batch-download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, category_id: categoryId, sync_to_drive: syncToDrive, is_private: isPrivate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi gửi yêu cầu tải hàng loạt");
  }
  return res.json();
}

export async function clearCompletedDownloadTasks() {
  const res = await fetch(`${API_BASE}/download/clear-completed`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi xóa danh sách đã xong");
  }
  return res.json();
}

export async function fetchVideos(categoryId = null, search = null, status = "active", isPrivate = false, usedStatus = null, mediaType = null, learnedStatus = null) {
  const params = new URLSearchParams();
  if (categoryId && categoryId !== "all") params.append("category_id", categoryId);
  if (search) params.append("search", search);
  if (status) params.append("status", status);
  if (isPrivate) params.append("is_private", "true");
  if (usedStatus && usedStatus !== "all") params.append("used_status", usedStatus);
  if (learnedStatus && learnedStatus !== "all") params.append("learned_status", learnedStatus);
  if (mediaType && mediaType !== "all") params.append("media_type", mediaType);
  
  const res = await fetch(`${API_BASE}/videos?${params.toString()}`);
  if (!res.ok) throw new Error("Lỗi khi lấy danh sách video / hình ảnh");
  return res.json();
}

// --- VAULT API ---
export async function fetchVaultStatus() {
  const res = await fetch(`${API_BASE}/vault/status`);
  if (!res.ok) throw new Error("Không thể lấy trạng thái Kho Bảo Mật");
  return res.json();
}

export async function setupVaultPassword(password, hint = "") {
  const res = await fetch(`${API_BASE}/vault/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, hint }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi thiết lập mật khẩu");
  }
  return res.json();
}

export async function verifyVaultPassword(password) {
  const res = await fetch(`${API_BASE}/vault/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Mật khẩu không chính xác");
  }
  return res.json();
}

export async function changeVaultPassword(oldPassword, newPassword, hint = "") {
  const res = await fetch(`${API_BASE}/vault/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, hint }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi đổi mật khẩu");
  }
  return res.json();
}

export async function setVideoPrivacy(videoId, isPrivate) {
  const res = await fetch(`${API_BASE}/videos/${videoId}/privacy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_private: isPrivate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi cập nhật trạng thái bảo mật");
  }
  return res.json();
}

export async function batchSetVideoPrivacy(videoIds, isPrivate) {
  const res = await fetch(`${API_BASE}/videos/batch-privacy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds, is_private: isPrivate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi cập nhật bảo mật hàng loạt");
  }
  return res.json();
}

export async function updateVideo(id, data) {
  const res = await fetch(`${API_BASE}/videos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật video");
  return res.json();
}

export async function toggleVideoUsed(id, isUsed = null) {
  const res = await fetch(`${API_BASE}/videos/${id}/toggle-used`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isUsed !== null ? { is_used: isUsed } : {}),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật trạng thái đã sử dụng");
  return res.json();
}

export async function batchToggleVideosUsed(ids, isUsed) {
  const res = await fetch(`${API_BASE}/videos/batch-used`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: ids, is_used: isUsed }),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật trạng thái đã sử dụng hàng loạt");
  return res.json();
}

export async function toggleVideoLearned(id, isLearned = null, learnNotes = null) {
  const payload = {};
  if (isLearned !== null) payload.is_learned = isLearned;
  if (learnNotes !== null) payload.learn_notes = learnNotes;
  
  const res = await fetch(`${API_BASE}/videos/${id}/toggle-learned`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật trạng thái đã xem học làm");
  return res.json();
}

export async function batchToggleVideosLearned(ids, isLearned) {
  const res = await fetch(`${API_BASE}/videos/batch-learned`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: ids, is_learned: isLearned }),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật trạng thái đã xem học làm hàng loạt");
  return res.json();
}

export async function resetVideoSaved(id) {
  const res = await fetch(`${API_BASE}/videos/${id}/reset-saved`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Lỗi khi bỏ thông tin đã lưu về máy");
  return res.json();
}

export async function batchResetVideosSaved(ids) {
  const res = await fetch(`${API_BASE}/videos/batch-reset-saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: ids }),
  });
  if (!res.ok) throw new Error("Lỗi khi bỏ thông tin đã lưu về máy hàng loạt");
  return res.json();
}

export async function redownloadVideo(id) {
  const res = await fetch(`${API_BASE}/videos/${id}/redownload`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi tải lại video từ nguồn gốc");
  }
  return res.json();
}


export async function deleteVideo(id) {
  const res = await fetch(`${API_BASE}/videos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Lỗi khi chuyển video vào thùng rác");
  return res.json();
}

export async function restoreVideo(id) {
  const res = await fetch(`${API_BASE}/videos/${id}/restore`, { method: "POST" });
  if (!res.ok) throw new Error("Lỗi khi khôi phục video");
  return res.json();
}

export async function permanentDeleteVideo(id) {
  const res = await fetch(`${API_BASE}/videos/${id}/permanent`, { method: "DELETE" });
  if (!res.ok) throw new Error("Lỗi khi xóa vĩnh viễn video");
  return res.json();
}

export async function getTrashCount() {
  const res = await fetch(`${API_BASE}/trash/count`);
  if (!res.ok) return { count: 0 };
  return res.json();
}

export async function emptyTrash() {
  const res = await fetch(`${API_BASE}/trash/empty`, { method: "POST" });
  if (!res.ok) throw new Error("Lỗi khi dọn sạch thùng rác");
  return res.json();
}

export async function batchMoveVideos(videoIds, targetCategoryId) {
  const res = await fetch(`${API_BASE}/videos/batch-move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds, target_category_id: targetCategoryId }),
  });
  if (!res.ok) throw new Error("Lỗi khi di chuyển video");
  return res.json();
}

export async function syncVideoToDrive(id) {
  const res = await fetch(`${API_BASE}/videos/${id}/sync-drive`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi đồng bộ Google Drive");
  }
  return res.json();
}

export async function openDownloadsFolder() {
  const res = await fetch(`${API_BASE}/open-downloads`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể mở thư mục downloads");
  }
  return res.json();
}

export async function syncAllToDrive() {
  const res = await fetch(`${API_BASE}/drive/sync-all`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi đồng bộ toàn bộ lên Drive");
  }
  return res.json();
}

export async function cleanupLocalCache() {
  const res = await fetch(`${API_BASE}/cleanup-local-cache`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi dọn dẹp bộ nhớ đệm máy tính");
  }
  return res.json();
}

export async function syncAllPendingToDrive() {
  const res = await fetch(`${API_BASE}/drive/sync-all-pending`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi đồng bộ video tồn đọng lên Drive");
  }
  return res.json();
}

export async function backupDatabaseToDrive() {
  const res = await fetch(`${API_BASE}/drive/backup-db`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi sao lưu database lên Drive");
  }
  return res.json();
}

export async function exportVideosZip(videoIds) {
  const res = await fetch(`${API_BASE}/videos/export-zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });
  if (!res.ok) throw new Error("Lỗi khi nén file zip");
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `SocialContent_Export_${videoIds.length}_videos.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function fetchCalendarEvents() {
  const res = await fetch(`${API_BASE}/calendar`);
  if (!res.ok) throw new Error("Lỗi khi tải lịch");
  return res.json();
}

export async function saveCalendarEvent(event) {
  const res = await fetch(`${API_BASE}/calendar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error("Lỗi khi lưu lịch đăng bài");
  return res.json();
}

export async function deleteCalendarEvent(id) {
  const res = await fetch(`${API_BASE}/calendar/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Lỗi khi xóa lịch");
  return res.json();
}

export async function confirmCalendarEventPublished(id, data) {
  const res = await fetch(`${API_BASE}/calendar/${id}/confirm-published`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Lỗi khi xác nhận đã đăng");
  return res.json();
}

export async function fetchNotes() {
  const res = await fetch(`${API_BASE}/notes`);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách ghi chú");
  return res.json();
}

export async function saveNote(note) {
  const res = await fetch(`${API_BASE}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note),
  });
  if (!res.ok) throw new Error("Lỗi khi lưu ghi chú");
  return res.json();
}

export async function deleteNote(id) {
  const res = await fetch(`${API_BASE}/notes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Lỗi khi xóa ghi chú");
  return res.json();
}

// --- RESOURCE & LINK VAULT API ---

export async function fetchResourceCategories() {
  const res = await fetch(`${API_BASE}/resources/categories`);
  if (!res.ok) throw new Error("Lỗi khi tải thư mục tài nguyên");
  return res.json();
}

export async function saveResourceCategory(cat) {
  const res = await fetch(`${API_BASE}/resources/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cat),
  });
  if (!res.ok) throw new Error("Lỗi khi lưu thư mục tài nguyên");
  return res.json();
}

export async function deleteResourceCategory(id) {
  const res = await fetch(`${API_BASE}/resources/categories/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Lỗi khi xóa thư mục tài nguyên");
  return res.json();
}

export async function fetchResources(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.category_id && params.category_id !== "all") searchParams.append("category_id", params.category_id);
  if (params.type && params.type !== "all") searchParams.append("type", params.type);
  if (params.search) searchParams.append("search", params.search);
  if (params.favorite_only) searchParams.append("favorite_only", "true");

  const qs = searchParams.toString();
  const url = `${API_BASE}/resources${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách tài nguyên");
  return res.json();
}

export async function saveResource(resource) {
  const res = await fetch(`${API_BASE}/resources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resource),
  });
  if (!res.ok) throw new Error("Lỗi khi lưu tài nguyên");
  return res.json();
}

export async function deleteResource(id) {
  const res = await fetch(`${API_BASE}/resources/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Lỗi khi xóa tài nguyên");
  return res.json();
}

export async function toggleFavoriteResource(id) {
  const res = await fetch(`${API_BASE}/resources/${id}/toggle-favorite`, { method: "POST" });
  if (!res.ok) throw new Error("Lỗi khi cập nhật trạng thái yêu thích");
  return res.json();
}

export async function scrapeResourceMetadata(url) {
  const res = await fetch(`${API_BASE}/resources/scrape-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tự động lấy thông tin từ URL này");
  }
  return res.json();
}

export async function batchScrapeResourceMetadata(urls, concurrency = 5) {
  const res = await fetch(`${API_BASE}/resources/batch-scrape-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, concurrency }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi quét metadata đa luồng");
  }
  return res.json();
}

export async function batchSaveResources(resources) {
  const res = await fetch(`${API_BASE}/resources/batch-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resources }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi lưu danh sách liên kết");
  }
  return res.json();
}


export async function batchMoveResources(ids, categoryId) {
  const res = await fetch(`${API_BASE}/resources/batch-move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, category_id: categoryId }),
  });
  if (!res.ok) throw new Error("Lỗi khi chuyển thư mục hàng loạt");
  return res.json();
}

export async function batchDeleteResources(ids) {
  const res = await fetch(`${API_BASE}/resources/batch-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Lỗi khi xóa liên kết hàng loạt");
  return res.json();
}

export async function batchFavoriteResources(ids, isFavorite = true) {
  const res = await fetch(`${API_BASE}/resources/batch-favorite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, is_favorite: isFavorite }),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật yêu thích hàng loạt");
  return res.json();
}

export async function batchPinResources(ids, pinned = true) {
  const res = await fetch(`${API_BASE}/resources/batch-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, pinned }),
  });
  if (!res.ok) throw new Error("Lỗi khi ghim liên kết hàng loạt");
  return res.json();
}


export async function fetchDriveStatus() {
  const res = await fetch(`${API_BASE}/drive/status`);
  if (!res.ok) throw new Error("Lỗi khi lấy thông tin Google Drive");
  return res.json();
}

export async function updateDriveConfig(config) {
  const res = await fetch(`${API_BASE}/drive/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Lỗi khi lưu cài đặt Google Drive");
  return res.json();
}

export async function testDriveConnection(config = {}) {
  const res = await fetch(`${API_BASE}/drive/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Lỗi khi gửi yêu cầu kiểm tra kết nối Drive");
  return res.json();
}

export async function translateMetadata({ title, description, hashtags, target_lang = "vi" }) {
  const res = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, hashtags, target_lang }),
  });
  if (!res.ok) throw new Error("Lỗi khi dịch metadata");
  return res.json();
}

export async function translateText(text, target_lang = "vi") {
  const res = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, target_lang }),
  });
  if (!res.ok) throw new Error("Lỗi khi dịch văn bản");
  return res.json();
}

export async function browseLocalFolder() {
  const res = await fetch(`${API_BASE}/browse-folder`, { method: "POST" });
  if (!res.ok) throw new Error("Lỗi khi mở hộp thoại duyệt thư mục");
  return res.json();
}

export async function openSpecificFolder(folderPath) {
  const res = await fetch(`${API_BASE}/open-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  if (!res.ok) throw new Error("Lỗi khi mở thư mục");
  return res.json();
}

export async function exportVideosToFolder(videoIds, targetFolder) {
  const res = await fetch(`${API_BASE}/export-to-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds, target_folder: targetFolder }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi lưu video vào thư mục máy");
  }
  return res.json();
}

export async function getExportStatus(exportId) {
  const url = exportId ? `${API_BASE}/export-status?export_id=${exportId}` : `${API_BASE}/export-status`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function dismissExport(exportId) {
  const res = await fetch(`${API_BASE}/export/dismiss/${exportId}`, { method: "POST" });
  return res.json();
}

export async function cancelExport(exportId) {
  const res = await fetch(`${API_BASE}/export/cancel/${exportId}`, { method: "POST" });
  return res.json();
}

export async function exportPromptsToFolder(promptIds, targetFolder, saveTextFile = true) {
  const res = await fetch(`${API_BASE}/prompts/export-to-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt_ids: promptIds,
      target_folder: targetFolder,
      save_text_file: saveTextFile
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi lưu prompt vào thư mục máy");
  }
  return res.json();
}

export async function batchTrashVideos(videoIds) {
  const res = await fetch(`${API_BASE}/videos/batch-trash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });
  if (!res.ok) throw new Error("Lỗi khi chuyển hàng loạt video vào thùng rác");
  return res.json();
}

export async function batchRestoreVideos(videoIds) {
  const res = await fetch(`${API_BASE}/videos/batch-restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });
  if (!res.ok) throw new Error("Lỗi khi khôi phục hàng loạt video");
  return res.json();
}

export async function batchPermanentDeleteVideos(videoIds) {
  const res = await fetch(`${API_BASE}/videos/batch-permanent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });
  if (!res.ok) throw new Error("Lỗi khi xóa vĩnh viễn hàng loạt video");
  return res.json();
}

export async function cleanupLocalStorage() {
  const res = await fetch(`${API_BASE}/cleanup-local-cache`, { method: "POST" });
  if (!res.ok) throw new Error("Lỗi khi dọn dẹp dung lượng ổ cứng");
  return res.json();
}

// --- CATEGORY LOCK / UNLOCK API ---
export async function lockCategory(catId, password, hint = "") {
  const res = await fetch(`${API_BASE}/categories/${catId}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, hint }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi khóa danh mục");
  }
  return res.json();
}

export async function unlockCategory(catId, password) {
  const res = await fetch(`${API_BASE}/categories/${catId}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Mật khẩu không chính xác!");
  }
  return res.json();
}

export async function removeCategoryLock(catId, password) {
  const res = await fetch(`${API_BASE}/categories/${catId}/remove-lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Mật khẩu không chính xác!");
  }
  return res.json();
}

export async function changeCategoryPassword(catId, currentPassword, newPassword, hint = "") {
  const res = await fetch(`${API_BASE}/categories/${catId}/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, hint }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Mật khẩu không chính xác!");
  }
  return res.json();
}

// --- AUDIO STUDIO API ---
export async function extractAudio(payload) {
  const res = await fetch(`${API_BASE}/audio/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi trích xuất âm thanh");
  }
  return res.json();
}

export async function extractAudioUpload(formData) {
  const res = await fetch(`${API_BASE}/audio/extract-upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi trích xuất âm thanh từ file tải lên");
  }
  return res.json();
}

export async function adjustVolume(payload) {
  const res = await fetch(`${API_BASE}/audio/adjust-volume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi điều chỉnh âm lượng");
  }
  return res.json();
}

export async function adjustVolumeUpload(formData) {
  const res = await fetch(`${API_BASE}/audio/adjust-volume-upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi điều chỉnh âm lượng từ file tải lên");
  }
  return res.json();
}

export async function fetchAudioHistory() {
  const res = await fetch(`${API_BASE}/audio/history`);
  if (!res.ok) throw new Error("Lỗi khi tải lịch sử âm thanh");
  return res.json();
}

export function getAudioDownloadUrl(filename) {
  return `${API_BASE}/audio/download/${encodeURIComponent(filename)}`;
}

export function getAudioStreamUrl(filename) {
  return `http://${host}:8000/media/downloads/audio_processed/${encodeURIComponent(filename)}`;
}

// ==========================================
// PROMPT VAULT API
// ==========================================

export async function fetchPrompts(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.media_type) query.append("media_type", params.media_type);
  if (params.ai_model) query.append("ai_model", params.ai_model);
  if (params.category) query.append("category", params.category);
  if (params.is_favorite !== undefined && params.is_favorite !== null) {
    query.append("is_favorite", params.is_favorite);
  }
  const url = `${API_BASE}/prompts${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách prompt");
  return res.json();
}

export async function fetchPromptStats() {
  const res = await fetch(`${API_BASE}/prompts/stats`);
  if (!res.ok) throw new Error("Lỗi khi tải thống kê prompt");
  return res.json();
}

export async function fetchPromptById(id) {
  const res = await fetch(`${API_BASE}/prompts/${id}`);
  if (!res.ok) throw new Error("Không tìm thấy prompt");
  return res.json();
}

export async function createPrompt(promptData) {
  const res = await fetch(`${API_BASE}/prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(promptData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi lưu prompt");
  }
  return res.json();
}

export async function createBatchPrompts(promptsList) {
  const res = await fetch(`${API_BASE}/prompts/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(promptsList),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi lưu danh sách prompt");
  }
  return res.json();
}

export async function updatePrompt(id, promptData) {
  const res = await fetch(`${API_BASE}/prompts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(promptData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi cập nhật prompt");
  }
  return res.json();
}

export async function deletePrompt(id) {
  const res = await fetch(`${API_BASE}/prompts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Lỗi khi xóa prompt");
  return res.json();
}

export async function toggleFavoritePrompt(id) {
  const res = await fetch(`${API_BASE}/prompts/${id}/favorite`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Lỗi khi thay đổi trạng thái yêu thích");
  return res.json();
}

export async function uploadPromptMedia(files) {
  const formData = new FormData();
  if (Array.isArray(files)) {
    files.forEach((f) => formData.append("files", f));
  } else {
    formData.append("files", files);
  }
  const res = await fetch(`${API_BASE}/prompts/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi tải file lên");
  }
  return res.json();
}

export async function extractPromptMediaFromUrl(url, downloadToVault = true) {
  const res = await fetch(`${API_BASE}/prompts/extract-media-from-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, download_to_vault: downloadToVault }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi trích xuất video từ URL");
  }
  return res.json();
}

export async function reExtractPromptMedia(promptId) {
  const res = await fetch(`${API_BASE}/prompts/${promptId}/re-extract`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi trích xuất lại video cho prompt");
  }
  return res.json();
}

export async function deleteBatchPrompts(ids) {
  try {
    const res = await fetch(`${API_BASE}/prompts/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) return res.json();
  } catch (e) {
    console.error("Batch delete API error, falling back to parallel delete:", e);
  }
  // Fallback
  return Promise.all(ids.map((id) => deletePrompt(id)));
}

export async function favoriteBatchPrompts(ids, is_favorite = true) {
  try {
    const res = await fetch(`${API_BASE}/prompts/batch-favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, is_favorite }),
    });
    if (res.ok) return res.json();
  } catch (e) {
    console.error("Batch favorite API error, falling back to parallel update:", e);
  }
  // Fallback
  return Promise.all(ids.map((id) => updatePrompt(id, { is_favorite })));
}

export async function syncBatchPromptsToDrive(ids) {
  const res = await fetch(`${API_BASE}/prompts/batch-sync-drive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi đồng bộ prompt lên Google Drive");
  }
  return res.json();
}

export async function syncSinglePromptToDrive(promptId) {
  const res = await fetch(`${API_BASE}/prompts/${promptId}/sync-drive`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi đồng bộ prompt lên Google Drive");
  }
  return res.json();
}

// ==========================================
// Social Channels Management API
// ==========================================

// ==========================================
// Channel Categories API (Phân cấp loại danh mục cha - con)
// ==========================================

export async function fetchChannelCategories() {
  const res = await fetch(`${API_BASE}/channel-categories`);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách danh mục kênh");
  return res.json();
}

export async function createChannelCategory(data) {
  const res = await fetch(`${API_BASE}/channel-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi tạo danh mục kênh");
  }
  return res.json();
}

export async function updateChannelCategory(catId, data) {
  const res = await fetch(`${API_BASE}/channel-categories/${catId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi cập nhật danh mục kênh");
  }
  return res.json();
}

export async function deleteChannelCategory(catId) {
  const res = await fetch(`${API_BASE}/channel-categories/${catId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Lỗi khi xóa danh mục kênh");
  return res.json();
}

export async function batchUpdateChannelCategory(ids, categoryId) {
  const res = await fetch(`${API_BASE}/channels/batch-category`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, category_id: categoryId }),
  });
  if (!res.ok) throw new Error("Lỗi khi chuyển danh mục hàng loạt");
  return res.json();
}

export async function fetchSocialChannels(params = {}) {
  const query = new URLSearchParams();
  if (params.platform && params.platform !== "all") query.append("platform", params.platform);
  if (params.status && params.status !== "all") query.append("status", params.status);
  if (params.category_id && params.category_id !== "all") query.append("category_id", params.category_id);
  if (params.search) query.append("search", params.search);

  const qs = query.toString();
  const url = `${API_BASE}/channels${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách kênh mạng xã hội");
  return res.json();
}

export async function fetchSocialChannelById(id) {
  const res = await fetch(`${API_BASE}/channels/${id}`);
  if (!res.ok) throw new Error("Lỗi khi tải thông tin chi tiết kênh");
  return res.json();
}

export async function createSocialChannel(data) {
  const res = await fetch(`${API_BASE}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi thêm kênh mới");
  }
  return res.json();
}

export async function updateSocialChannel(id, data) {
  const res = await fetch(`${API_BASE}/channels/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi cập nhật kênh");
  }
  return res.json();
}

export async function deleteSocialChannel(id) {
  const res = await fetch(`${API_BASE}/channels/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Lỗi khi xóa kênh");
  return res.json();
}

export async function fetchChannelInfoFromUrl(url, platform = null) {
  const res = await fetch(`${API_BASE}/channels/fetch-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, platform }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tự động quét thông tin từ link kênh này");
  }
  return res.json();
}

export async function refreshSocialChannelStats(id) {
  const res = await fetch(`${API_BASE}/channels/${id}/refresh`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi làm mới số liệu kênh");
  }
  return res.json();
}

export async function batchDeleteSocialChannels(ids) {
  const res = await fetch(`${API_BASE}/channels/batch-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Lỗi khi xóa hàng loạt kênh");
  return res.json();
}

export async function batchUpdateSocialChannelStatus(ids, status) {
  const res = await fetch(`${API_BASE}/channels/batch-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, status }),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật trạng thái hàng loạt");
  return res.json();
}

export async function batchUpdateSocialChannels(ids, data) {
  const res = await fetch(`${API_BASE}/channels/batch-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, data }),
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật thông tin hàng loạt");
  return res.json();
}

export async function batchRefreshSocialChannels(ids) {
  const res = await fetch(`${API_BASE}/channels/batch-refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Lỗi khi làm mới số liệu hàng loạt");
  return res.json();
}

export async function refreshAllSocialChannels() {
  const res = await fetch(`${API_BASE}/channels/refresh-all`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Lỗi khi làm mới số liệu toàn bộ kênh");
  return res.json();
}


// ==========================================
// Channel Followers API
// ==========================================

export async function fetchChannelFollowers(channelId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/followers`);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách followers của kênh");
  return res.json();
}

export async function saveChannelFollowers(channelId, followers, replace = true) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/followers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followers, replace }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi lưu danh sách followers");
  }
  return res.json();
}

export async function parseFollowersText(text) {
  const res = await fetch(`${API_BASE}/channels/parse-followers-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi phân tích văn bản followers");
  }
  return res.json();
}

// ==========================================
// DUBBING STUDIO API (VIDEO LOCALIZATION)
// ==========================================
export async function getDubbingFolders() {
  const res = await fetch(`${API_BASE}/dubbing/folders`);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách thư mục");
  return res.json();
}

export async function createDubbingFolder(name, color = "#10b981") {
  const res = await fetch(`${API_BASE}/dubbing/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color })
  });
  if (!res.ok) throw new Error("Lỗi khi tạo thư mục");
  return res.json();
}

export async function getDubbingProjects(folderId = null, search = "") {
  const params = new URLSearchParams();
  if (folderId) params.append("folder_id", folderId);
  if (search) params.append("search", search);
  const res = await fetch(`${API_BASE}/dubbing/projects?${params.toString()}`);
  if (!res.ok) throw new Error("Lỗi khi tải danh sách dự án");
  return res.json();
}

export async function getDubbingProject(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}`);
  if (!res.ok) throw new Error("Lỗi khi tải chi tiết dự án");
  return res.json();
}

export async function createDubbingProject(data) {
  const res = await fetch(`${API_BASE}/dubbing/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Lỗi khi tạo dự án");
  return res.json();
}

export async function updateDubbingProject(projectId, data) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Lỗi khi cập nhật dự án");
  return res.json();
}

export async function deleteDubbingProject(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi xóa dự án");
  }
  return res.json();
}

export async function bulkDeleteDubbingProjects(projectIds) {
  const res = await fetch(`${API_BASE}/dubbing/projects/bulk_delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_ids: projectIds })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi xóa nhiều dự án");
  }
  return res.json();
}

export async function updateDubbingFolder(folderId, data) {
  const res = await fetch(`${API_BASE}/dubbing/folders/${folderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi đổi tên thư mục");
  }
  return res.json();
}

export async function deleteDubbingFolder(folderId, deleteProjects = false) {
  const res = await fetch(`${API_BASE}/dubbing/folders/${folderId}?delete_projects=${deleteProjects}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi xóa thư mục");
  }
  return res.json();
}

export async function uploadDubbingVideo(file, { name = "", folder_id = null, auto_transcribe = true } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  if (folder_id) formData.append("folder_id", folder_id);
  formData.append("auto_transcribe", auto_transcribe ? "true" : "false");

  const res = await fetch(`${API_BASE}/dubbing/upload_video`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi tải video lên máy chủ");
  }
  return res.json();
}

export async function importDubbingUrl({ url, name = "", folder_id = null, auto_transcribe = true }) {
  const res = await fetch(`${API_BASE}/dubbing/import_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, name, folder_id, auto_transcribe })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi nhập video từ URL");
  }
  return res.json();
}

export async function getDubbingSegments(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/segments`);
  if (!res.ok) throw new Error("Lỗi khi tải segments");
  return res.json();
}

export async function saveDubbingSegments(projectId, segments) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments })
  });
  if (!res.ok) throw new Error("Lỗi khi lưu segments");
  return res.json();
}

export async function getDubbingAudits(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/audits`);
  if (!res.ok) throw new Error("Lỗi khi lấy thông tin kiểm tra thời lượng");
  return res.json();
}

export async function saveDubbingSubtitleStyle(projectId, styleData) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/subtitle_style`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(styleData)
  });
  if (!res.ok) throw new Error("Lỗi khi lưu cài đặt phụ đề");
  return res.json();
}

export async function saveDubbingBlurRegions(projectId, regions) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/blur_regions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regions })
  });
  if (!res.ok) throw new Error("Lỗi khi lưu vùng làm mờ");
  return res.json();
}

export async function getDubbingAssets(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/assets`);
  if (!res.ok) throw new Error("Lỗi khi lấy danh sách assets");
  return res.json();
}

export async function exportDubbingZip(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/export_zip`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Lỗi khi đóng gói file ZIP");
  return res.json();
}

export async function renderDubbingVideo(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/render`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Lỗi khi bắt đầu render video");
  return res.json();
}

export async function getDubbingCredits() {
  const res = await fetch(`${API_BASE}/dubbing/credits`);
  if (!res.ok) throw new Error("Lỗi khi lấy số dư credit");
  return res.json();
}

export async function retranslateDubbingSegments(projectId, targetLang = "vi", style = "concise") {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/retranslate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_lang: targetLang, style })
  });
  if (!res.ok) throw new Error("Lỗi khi dịch lại");
  return res.json();
}

export async function generateDubbingTTS(projectId, voiceId = "HN - Ngoc Huyen") {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/generate_tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice_id: voiceId })
  });
  if (!res.ok) throw new Error("Lỗi khi tạo giọng đọc lồng tiếng");
  return res.json();
}

export async function autoLocalizeDubbingProject(projectId, options = {}) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/auto_localize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi tự động xử lý video");
  }
  return res.json();
}

export async function cleanupExpiredDubbing() {
  const res = await fetch(`${API_BASE}/dubbing/cleanup_expired`, {
    method: "POST"
  });
  return res.json();
}

export async function getDubbingPipelineProgress(projectId) {
  try {
    const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/progress`);
    if (!res.ok) return { success: false, progress: null };
    return await res.json();
  } catch (e) {
    return { success: false, progress: null };
  }
}

export async function autoFitSyncDubbing(projectId) {
  const res = await fetch(`${API_BASE}/dubbing/projects/${projectId}/auto_fit_sync`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Lỗi khi đồng bộ khớp thời lượng lồng tiếng");
  return res.json();
}
export async function getAllDubbingProgress() {
  try {
    const res = await fetch(`${API_BASE}/dubbing/progress/all`);
    if (!res.ok) return { success: false, progress: {} };
    return await res.json();
  } catch (e) {
    return { success: false, progress: {} };
  }
}

