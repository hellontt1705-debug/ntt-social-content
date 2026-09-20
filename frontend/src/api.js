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

export async function ingestTikTokChannelVideos(items, channelUrl = "", mode = "30_days", daysLimit = 30, startDate = null, endDate = null) {
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
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Lỗi khi nạp danh sách video từ kênh.");
  }
  return res.json();
}

export async function fetchTikTokBookmarklet() {
  const res = await fetch(`${API_BASE}/tiktok/channel/bookmarklet`);
  if (!res.ok) throw new Error("Không thể tải mã Bookmarklet");
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

export async function fetchVideos(categoryId = null, search = null, status = "active", isPrivate = false, usedStatus = null, mediaType = null) {
  const params = new URLSearchParams();
  if (categoryId && categoryId !== "all") params.append("category_id", categoryId);
  if (search) params.append("search", search);
  if (status) params.append("status", status);
  if (isPrivate) params.append("is_private", "true");
  if (usedStatus && usedStatus !== "all") params.append("used_status", usedStatus);
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
