export const STATUS_CONFIG = {
  PLANNED: {
    id: "PLANNED",
    label: "Đã lên lịch",
    color: "#c084fc",
    bg: "rgba(192, 132, 252, 0.12)",
    border: "rgba(192, 132, 252, 0.3)",
    badge: "🟣",
    icon: "calendar"
  },
  UPCOMING: {
    id: "UPCOMING",
    label: "Chờ đăng",
    color: "#fbbf24",
    bg: "rgba(251, 191, 36, 0.12)",
    border: "rgba(251, 191, 36, 0.3)",
    badge: "🟡",
    icon: "clock"
  },
  DUE: {
    id: "DUE",
    label: "Đang đăng",
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.12)",
    border: "rgba(56, 189, 248, 0.3)",
    badge: "🔵",
    icon: "sparkles"
  },
  PUBLISHED_MANUALLY: {
    id: "PUBLISHED_MANUALLY",
    label: "Đã đăng",
    color: "#34d399",
    bg: "rgba(52, 211, 153, 0.12)",
    border: "rgba(52, 211, 153, 0.3)",
    badge: "🟢",
    icon: "checkCircle"
  },
  MISSED: {
    id: "MISSED",
    label: "Đăng thất bại",
    color: "#f87171",
    bg: "rgba(248, 113, 113, 0.12)",
    border: "rgba(248, 113, 113, 0.3)",
    badge: "🔴",
    icon: "alertTriangle"
  },
  CANCELLED: {
    id: "CANCELLED",
    label: "Đã hủy",
    color: "#9ca3af",
    bg: "rgba(156, 163, 175, 0.12)",
    border: "rgba(156, 163, 175, 0.3)",
    badge: "⚪",
    icon: "x"
  }
};

export const PLATFORM_CONFIG = {
  tiktok: { id: "tiktok", label: "TikTok", icon: "tiktok", color: "#00f2fe" },
  youtube_shorts: { id: "youtube_shorts", label: "YouTube", icon: "youtube", color: "#ff0000" },
  instagram_reels: { id: "instagram_reels", label: "Instagram", icon: "instagram", color: "#e1306c" },
  x: { id: "x", label: "X / Twitter", icon: "xTwitter", color: "#ffffff" },
  douyin: { id: "douyin", label: "Douyin", icon: "tiktok", color: "#fe2c55" }
};

export function normalizeStatus(event) {
  if (!event) return STATUS_CONFIG.PLANNED;
  const rawStatus = (event.status || "").toUpperCase();
  
  if (rawStatus === "PUBLISHED" || rawStatus === "PUBLISHED_MANUALLY") {
    return STATUS_CONFIG.PUBLISHED_MANUALLY;
  }
  if (rawStatus === "CANCELLED") {
    return STATUS_CONFIG.CANCELLED;
  }
  if (rawStatus === "MISSED") {
    return STATUS_CONFIG.MISSED;
  }
  if (rawStatus === "DUE") {
    return STATUS_CONFIG.DUE;
  }
  if (rawStatus === "UPCOMING") {
    return STATUS_CONFIG.UPCOMING;
  }

  // Calculate dynamic status based on date/time
  try {
    const scheduledDateTime = new Date(`${event.scheduled_date}T${event.scheduled_time || "00:00"}:00`);
    const now = new Date();
    const diffMinutes = Math.floor((scheduledDateTime - now) / (1000 * 60));

    if (diffMinutes < -120) {
      return STATUS_CONFIG.MISSED;
    }
    if (diffMinutes >= -120 && diffMinutes <= 15) {
      return STATUS_CONFIG.DUE;
    }
    if (diffMinutes > 15 && diffMinutes <= 180) {
      return STATUS_CONFIG.UPCOMING;
    }
  } catch (e) {
    // fallback
  }

  return STATUS_CONFIG.PLANNED;
}

export function formatTimeDiff(event) {
  try {
    const scheduledDateTime = new Date(`${event.scheduled_date}T${event.scheduled_time || "00:00"}:00`);
    const now = new Date();
    const diffMinutes = Math.floor((scheduledDateTime - now) / (1000 * 60));

    if (diffMinutes < 0) {
      const pastMins = Math.abs(diffMinutes);
      const hours = Math.floor(pastMins / 60);
      const mins = pastMins % 60;
      return `Trễ ${hours > 0 ? `${hours} giờ ` : ""}${mins} phút`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      return `Còn ${hours > 0 ? `${hours} giờ ` : ""}${mins} phút`;
    }
  } catch (e) {
    return "";
  }
}

export function formatDuration(seconds) {
  if (!seconds) return "00:15";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes) {
  if (!bytes) return "4.2 MB";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function toLocalDateString(date) {
  if (!date) return "";
  let d;
  if (typeof date === "string") {
    if (date.length === 10) {
      // "YYYY-MM-DD"
      const [y, m, day] = date.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(date);
    }
  } else {
    d = new Date(date);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

