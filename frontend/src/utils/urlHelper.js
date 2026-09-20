/**
 * Trích xuất đường link video sạch từ văn bản bất kỳ
 * Hỗ trợ nhận diện các link Douyin chia sẻ chứa kèm tiêu đề, hashtag và chữ tiếng Trung
 * Ví dụ: "2.00 01/21 :6pm ... https://v.douyin.com/0yiBCYMH6TA/ 复制此链接..." -> "https://v.douyin.com/0yiBCYMH6TA/"
 * Hoặc: "https://www.douyin.com/jingxuan?modal_id=7668589584573386011" -> "https://www.douyin.com/video/7668589584573386011"
 */
export function extractCleanUrl(text) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();

  // 1. Tìm đường link http:// hoặc https:// bên trong đoạn văn bản
  const match = trimmed.match(/https?:\/\/[^\s<>"]+/i);
  let url = match ? match[0] : trimmed;

  // 2. Làm sạch các dấu câu thừa hoặc ký tự đóng ngoặc bám dính ở cuối URL
  url = url.replace(/[.,;!?'")\]]+$/, "");

  // 3. Chuẩn hóa link Douyin dạng web modal sang link video chuẩn:
  // https://www.douyin.com/jingxuan?modal_id=7668589584573386011 -> https://www.douyin.com/video/7668589584573386011
  const douyinModalMatch = url.match(/douyin\.com\/.*?[?&]modal_id=(\d+)/i);
  if (douyinModalMatch) {
    return `https://www.douyin.com/video/${douyinModalMatch[1]}`;
  }

  return url;
}

/**
 * Trích xuất danh sách link sạch từ văn bản dán hàng loạt (nhiều dòng, phân cách bởi khoảng trắng, phẩy, chấm phẩy...)
 */
export function extractBatchUrls(text) {
  if (!text || typeof text !== "string") return [];
  // Tìm tất cả các link http/https trong chuỗi
  const matches = text.match(/https?:\/\/[^\s<>"]+/gi) || [];
  if (matches.length > 0) {
    const cleaned = matches
      .map((m) => extractCleanUrl(m))
      .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
    return Array.from(new Set(cleaned));
  }
  return text
    .split("\n")
    .map((line) => extractCleanUrl(line))
    .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
}

/**
 * Trích xuất tiêu đề hoặc hashtag từ đoạn văn bản chia sẻ của Douyin / TikTok
 * nếu người dùng muốn tận dụng
 */
export function extractTextMetadata(text) {
  if (!text || typeof text !== "string") return { hashtags: [], title: "" };
  const tags = text.match(/#([\w\u4e00-\u9fa5\u00C0-\u1EF9]+)/g) || [];
  return {
    hashtags: tags.map((t) => t.replace(/^#/, "")),
    title: text.replace(/https?:\/\/[^\s<>"]+/i, "").replace(/#[^\s]+/g, "").trim()
  };
}
