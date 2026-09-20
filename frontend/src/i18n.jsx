import React, { createContext, useContext, useState, useEffect } from "react";

export const translations = {
  vi: {
    // Brand & Workspace
    brand_title: "SocialContent",
    brand_sub: "Studio OS v1.0",
    workspace: "Không gian làm việc",
    vault_tab: "Kho Video (Vault)",
    prompt_tab: "Kho Prompt (AI)",
    prompt_vault: "Kho Prompt (AI)",
    audio_tab: "Studio Âm Thanh (Audio)",
    calendar_tab: "Lịch Đăng Bài (Plan)",
    notes_tab: "Kịch Bản & Note (Word)",
    trash_tab: "Thùng Rác",
    quick_download: "Tải Video Nhanh",
    categories: "Danh mục phân loại",
    all_videos: "Tất cả Video",
    all_unclassified: "📁 Tất cả Video (Chưa phân loại)",
    add_category: "Thêm danh mục",
    cat_name_placeholder: "Tên danh mục (VD: Ẩm thực)",
    save: "Lưu",
    cancel: "Hủy",
    drive_sync: "Google Drive",
    drive_desktop_sync: "Desktop Sync",
    drive_cloud_api: "Cloud API",
    drive_local_only: "Chỉ dùng Local",
    trash_banner_title: "Thùng Rác (Xóa tạm)",
    trash_banner_desc: "Video ở đây đã bị xóa tạm khỏi kho chính. Bạn có thể khôi phục hoặc xóa vĩnh viễn (xóa trên máy tính & Google Drive).",
    restore_video: "Khôi phục",
    permanent_delete: "Xóa vĩnh viễn",
    empty_trash: "Dọn sạch thùng rác",
    empty_trash_confirm: "Bạn có chắc chắn muốn xóa vĩnh viễn TOÀN BỘ video trong thùng rác? Toàn bộ file trên máy tính và Google Drive sẽ bị xóa hoàn toàn!",
    permanent_delete_confirm: "Bạn có chắc muốn xóa vĩnh viễn video này? File trên máy tính và trên Google Drive sẽ bị xóa vĩnh viễn!",
    soft_delete_confirm: "Chuyển video này vào thùng rác?",
    move_to_trash: "Chuyển vào thùng rác",
    trash_empty_state: "Thùng rác đang trống!",
    back_to_vault: "Quay lại kho video",

    // Top Header
    title_vault: "Kho Video & Tài Nguyên (Media Vault)",
    title_audio: "Studio Xử Lý Âm Thanh (Tách Nhạc & Boost Âm Lượng)",
    title_calendar: "Lịch Đăng Bài & Kế Hoạch Xây Kênh (Content Planner)",
    title_notes: "Soạn Thảo Kịch Bản & Ghi Chú (Document Studio)",
    search_placeholder: "Tìm theo tiêu đề, hashtag, kênh...",
    export_zip: "Tải về Zip",
    drive_btn: "Drive",
    add_video_btn: "Thêm Video",

    // Quick Bar
    quick_bar_placeholder: "Dán nhanh liên kết video (TikTok, Douyin, YouTube, Reels, X, Drive)...",
    download_now: "Tải Ngay",

    // Filter & Batch
    all_platforms: "Tất cả nền tảng",
    select_all: "Chọn tất cả",
    deselect_all: "Bỏ chọn",
    move_category: "Chuyển danh mục",
    video_unit: "video",

    // Vault Hub
    hero_badge: "STUDIO MEDIA VAULT & AI CONTENT",
    hero_title: "Kho Lưu Trữ & Quản Lý Video Đa Kênh",
    hero_desc: "Tải video chất lượng gốc không watermark từ TikTok, Douyin, YouTube, Instagram Reels, X hoặc Google Drive. Hệ thống tự động trích xuất tiêu đề, tài khoản uploader, trọn bộ hashtag tiếng Việt & quốc tế.",
    open_downloader: "Mở Trình Tải Video",
    download_drive_folder: "Tải Thư Mục Drive",
    download_batch_links: "Tải Hàng Loạt Link",
    supported_platforms_heading: "NỀN TẢNG ĐƯỢC HỖ TRỢ CHẤT LƯỢNG CAO",

    // Platform features
    yt_desc: "Tải video 4K/1080p, YouTube Shorts, trích xuất toàn bộ tags, mô tả & channel.",
    tt_desc: "Tải video HD gốc không logo watermark, tự bóc tách tài khoản & toàn bộ hashtags.",
    dy_desc: "Tự động lọc bỏ chuỗi text tiếng Trung từ nút chia sẻ, tải trực tiếp video HD gốc.",
    ig_desc: "Tải video Instagram Reels & Post ở độ phân giải gốc cao nhất kèm caption.",
    x_desc: "Tải video gốc với bitrate cao nhất, lưu trữ nội dung tweet và tài khoản người đăng.",
    gd_desc: "Hỗ trợ tải tệp MP4 hoặc tự động quét toàn bộ video trong thư mục Google Drive.",

    // Workflow pillars
    pillar_1_title: "Trích Xuất Thông Tin Tự Động",
    pillar_1_desc: "Tự động lưu tiêu đề, channel tác giả, toàn bộ hashtag tiếng Việt & quốc tế, link bài viết gốc.",
    pillar_2_title: "Kéo Thả Phân Loại (Drag & Drop)",
    pillar_2_desc: "Kéo video trực tiếp vào danh mục bên thanh điều hướng hoặc di chuyển nhiều video cùng lúc.",
    pillar_3_title: "Đồng Bộ Lịch & Kịch Bản Word",
    pillar_3_desc: "Chuyển video vào Lịch đăng bài và phòng soạn thảo kịch bản chỉ với một thao tác bấm.",

    // Video Card
    view_details: "Chi tiết",
    copy_hashtags: "Sao chép Hashtag",
    copied_toast: "Đã chép!",
    schedule_post: "Lên lịch đăng bài",
    sync_to_drive: "Đồng bộ Google Drive",
    delete_video: "Xóa video",
    delete_video_confirm: "Bạn có chắc muốn xóa video này?",
    author_prefix: "@",
    no_title: "Video không tiêu đề",

    // Downloader Modal
    downloader_title: "Tải Video & Trích Xuất Dữ Liệu",
    tab_single: "Tải Lẻ (1 Video)",
    tab_batch: "Tải Hàng Loạt",
    tab_channel: "Kênh TikTok",
    tab_drive: "Google Drive",
    tab_tasks: "Tiến Trình",
    enter_url_label: "Nhập liên kết video từ TikTok, Douyin, YouTube, Reels, X:",
    paste_url_placeholder: "Dán link video tại đây (Hỗ trợ cả link chia sẻ Douyin, TikTok)...",
    analyze_btn: "Phân Tích Video",
    analyzing_btn: "Đang phân tích...",
    save_category_label: "Lưu vào Danh mục:",
    start_download_btn: "Tải Video Về Kho",
    batch_label: "Nhập danh sách đường link (mỗi dòng một link):",
    batch_placeholder: "https://...\nhttps://...",
    batch_start_btn: "Bắt đầu tải hàng loạt",
    channel_input_label: "Nhập đường dẫn kênh hoặc @username TikTok:",
    channel_input_placeholder: "https://www.tiktok.com/@kiemtienvideoai hoặc @kiemtienvideoai...",
    channel_scan_btn: "Quét Video Kênh",
    channel_scanning_btn: "Đang quét video kênh...",
    channel_date_filter_label: "Phạm vi ngày quét video:",
    channel_date_30d: "30 ngày gần nhất (Mặc định)",
    channel_date_7d: "7 ngày gần nhất",
    channel_date_custom: "Khoảng ngày tùy chọn",
    channel_date_all: "Toàn bộ video",
    channel_date_from: "Từ ngày:",
    channel_date_to: "Đến ngày:",
    channel_total_found: "Tìm thấy tổng cộng",
    channel_matched_date: "video trong phạm vi ngày đã chọn",
    channel_download_selected: "Tải video đã chọn về máy",
    channel_select_all: "Chọn tất cả",
    channel_deselect_all: "Bỏ chọn",
    channel_bookmarklet_tip: "Quét siêu tốc từ tab TikTok đang mở trên trình duyệt",
    channel_copy_bookmarklet: "Sao chép Bookmarklet 1-Click",
    drive_label: "Dán đường dẫn tệp hoặc thư mục Google Drive:",
    drive_placeholder: "https://drive.google.com/drive/folders/... hoặc /file/d/...",
    drive_scan_btn: "Quét & Phân Tích Drive",
    drive_start_btn: "Tải từ Google Drive về Vault",
    drive_folder_found: "Tìm thấy thư mục Google Drive",
    drive_files_count: "tệp video bên trong",

    // Video Detail Modal
    detail_title: "Chi Tiết Video & Kế Hoạch Đăng",
    source_url: "Liên kết nguồn gốc:",
    open_source: "Mở link gốc",
    uploader: "Người đăng (Creator):",
    quality: "Độ phân giải:",
    duration: "Thời lượng:",
    download_date: "Ngày tải:",
    local_file: "Tệp lưu trữ:",
    hashtags_label: "Bộ Hashtags tự động bóc tách:",
    notes_label: "Ghi chú ý tưởng & Kịch bản lại (Remake):",
    notes_placeholder: "Viết ý tưởng làm lại video, hook mở đầu, kịch bản...",
    save_changes: "Lưu Thay Đổi",
    translate_section: "Dịch thuật Metadata (Tiêu đề, Mô tả, Hashtags):",
    translate_to_vi: "🇻🇳 Dịch sang Tiếng Việt",
    translate_to_en: "🇺🇸 Dịch sang English",
    translate_to_zh: "🇨🇳 Dịch sang 中文",
    translating: "Đang dịch thuật...",

    // Calendar
    calendar_title: "Lịch Đăng Bài & Lên Kế Hoạch Kênh",
    add_schedule_btn: "Thêm Lịch Đăng",
    mon: "Thứ 2", tue: "Thứ 3", wed: "Thứ 4", thu: "Thứ 5", fri: "Thứ 6", sat: "Thứ 7", sun: "Chủ nhật",
    select_video_to_schedule: "Chọn video từ Kho để lên lịch:",
    schedule_time: "Thời gian đăng dự kiến:",
    target_platform: "Nền tảng đăng:",
    status_draft: "Bản nháp",
    status_ready: "Sẵn sàng",
    status_posted: "Đã đăng",

    // Document Studio
    doc_title: "Soạn Thảo Kịch Bản & Ghi Chú (Word Studio)",
    new_doc: "Tạo Kịch Bản Mới",
    doc_name_placeholder: "Tiêu đề kịch bản...",
    doc_empty: "Chưa chọn tài liệu nào. Bấm 'Tạo Kịch Bản Mới' để bắt đầu.",

    // Theme & Lang
    theme_dark: "Giao diện Tối",
    theme_light: "Giao diện Sáng",
    lang_vi: "Tiếng Việt",
    lang_en: "English",
    lang_zh: "中文",
    toast_downloading: "Đang tải video..."
  },

  en: {
    // Brand & Workspace
    brand_title: "SocialContent",
    brand_sub: "Studio OS v1.0",
    workspace: "Workspace",
    vault_tab: "Media Vault",
    audio_tab: "Audio Studio",
    calendar_tab: "Content Planner",
    notes_tab: "Document Studio",
    trash_tab: "Trash Bin",
    quick_download: "Quick Download",
    categories: "Categories",
    all_videos: "All Videos",
    all_unclassified: "📁 All Videos (Unclassified)",
    add_category: "Add Category",
    cat_name_placeholder: "Category name (e.g., Food & Travel)",
    save: "Save",
    cancel: "Cancel",
    drive_sync: "Google Drive",
    drive_desktop_sync: "Desktop Sync",
    drive_cloud_api: "Cloud API",
    drive_local_only: "Local Only",
    trash_banner_title: "Trash Bin (Soft Deleted)",
    trash_banner_desc: "Videos here are temporarily deleted from your vault. You can restore them or permanently delete them from your computer & Google Drive.",
    restore_video: "Restore",
    permanent_delete: "Permanently Delete",
    empty_trash: "Empty Trash",
    empty_trash_confirm: "Are you sure you want to permanently delete ALL videos in trash? Local files and files on Google Drive will be completely removed!",
    permanent_delete_confirm: "Are you sure you want to permanently delete this video? Local files and files on Google Drive will be removed!",
    soft_delete_confirm: "Move this video to trash?",
    move_to_trash: "Move to Trash",
    trash_empty_state: "Trash bin is empty!",
    back_to_vault: "Back to Media Vault",

    // Top Header
    title_vault: "Media Vault & Assets",
    title_audio: "Audio Studio (Extract & Volume Boost)",
    title_calendar: "Content Planner & Scheduling",
    title_notes: "Scriptwriting & Notes (Document Studio)",
    search_placeholder: "Search by title, hashtag, creator...",
    export_zip: "Export Zip",
    drive_btn: "Drive",
    add_video_btn: "Add Video",

    // Quick Bar
    quick_bar_placeholder: "Quick paste video link (TikTok, Douyin, YouTube, Reels, X, Drive)...",
    download_now: "Download Now",

    // Filter & Batch
    all_platforms: "All Platforms",
    select_all: "Select All",
    deselect_all: "Deselect",
    move_category: "Move Category",
    video_unit: "videos",

    // Vault Hub
    hero_badge: "STUDIO MEDIA VAULT & AI CONTENT",
    hero_title: "Multi-Channel Media Vault & Manager",
    hero_desc: "Download pristine watermark-free videos from TikTok, Douyin, YouTube, Instagram Reels, X or Google Drive. Automatically extracts titles, uploader accounts, and multilingual hashtags.",
    open_downloader: "Open Video Downloader",
    download_drive_folder: "Download Drive Folder",
    download_batch_links: "Batch Links Download",
    supported_platforms_heading: "SUPPORTED HIGH QUALITY PLATFORMS",

    // Platform features
    yt_desc: "Download 4K/1080p, YouTube Shorts, extracts full tags, descriptions & channel.",
    tt_desc: "Download HD video without watermark, auto extract creator & all hashtags.",
    dy_desc: "Auto-strips Chinese sharing text from Douyin, downloads pristine 1080p source.",
    ig_desc: "Download Instagram Reels & Posts at original full resolution with captions.",
    x_desc: "Download original bitrate video with tweet text and author info.",
    gd_desc: "Download single MP4 files or auto-scan entire Google Drive folders.",

    // Workflow pillars
    pillar_1_title: "Automatic Metadata Extraction",
    pillar_1_desc: "Instantly captures title, uploader channel, all tags and direct source URLs.",
    pillar_2_title: "Drag & Drop Categorization",
    pillar_2_desc: "Drag videos directly into sidebar folders or organize files in bulk.",
    pillar_3_title: "Sync Calendar & Word Studio",
    pillar_3_desc: "One-click send videos to content calendar or rich scriptwriting workspace.",

    // Video Card
    view_details: "Details",
    copy_hashtags: "Copy Hashtags",
    copied_toast: "Copied!",
    schedule_post: "Schedule Post",
    sync_to_drive: "Sync to Drive",
    delete_video: "Delete",
    delete_video_confirm: "Are you sure you want to delete this video?",
    author_prefix: "@",
    no_title: "Untitled Video",

    // Downloader Modal
    downloader_title: "Download Video & Extract Metadata",
    tab_single: "Single Video",
    tab_batch: "Batch Download",
    tab_channel: "TikTok Channel",
    tab_drive: "Google Drive",
    tab_tasks: "Tasks & Progress",
    enter_url_label: "Enter video link from TikTok, Douyin, YouTube, Reels, X:",
    paste_url_placeholder: "Paste video link here (Supports Douyin and TikTok share text)...",
    analyze_btn: "Analyze Video",
    analyzing_btn: "Analyzing...",
    save_category_label: "Save to Category:",
    start_download_btn: "Download to Vault",
    batch_label: "Enter list of video URLs (one per line):",
    batch_placeholder: "https://...\nhttps://...",
    batch_start_btn: "Start Batch Download",
    channel_input_label: "Enter TikTok channel URL or @username:",
    channel_input_placeholder: "https://www.tiktok.com/@kiemtienvideoai or @kiemtienvideoai...",
    channel_scan_btn: "Scan Channel Videos",
    channel_scanning_btn: "Scanning channel videos...",
    channel_date_filter_label: "Date range scope for scanning:",
    channel_date_30d: "Last 30 days (Default)",
    channel_date_7d: "Last 7 days",
    channel_date_custom: "Custom Date Range",
    channel_date_all: "All Videos",
    channel_date_from: "From date:",
    channel_date_to: "To date:",
    channel_total_found: "Total found",
    channel_matched_date: "videos within selected date range",
    channel_download_selected: "Download selected videos",
    channel_select_all: "Select all",
    channel_deselect_all: "Deselect",
    channel_bookmarklet_tip: "Ultra-fast scan directly from open TikTok browser tab",
    channel_copy_bookmarklet: "Copy 1-Click Bookmarklet",
    drive_label: "Paste Google Drive file or folder URL:",
    drive_placeholder: "https://drive.google.com/drive/folders/... or /file/d/...",
    drive_scan_btn: "Scan & Analyze Drive",
    drive_start_btn: "Download from Drive into Vault",
    drive_folder_found: "Google Drive Folder Detected",
    drive_files_count: "video files found inside",

    // Video Detail Modal
    detail_title: "Video Details & Content Strategy",
    source_url: "Original Source URL:",
    open_source: "Open Source",
    uploader: "Creator / Channel:",
    quality: "Resolution:",
    duration: "Duration:",
    download_date: "Download Date:",
    local_file: "Local Storage:",
    hashtags_label: "Extracted Hashtags:",
    notes_label: "Idea Notes & Remake Script:",
    notes_placeholder: "Write remake ideas, intro hook, script outlines...",
    save_changes: "Save Changes",
    translate_section: "Translate Metadata (Title, Description, Hashtags):",
    translate_to_vi: "🇻🇳 Translate to Vietnamese",
    translate_to_en: "🇺🇸 Translate to English",
    translate_to_zh: "🇨🇳 Translate to Chinese",
    translating: "Translating metadata...",

    // Calendar
    calendar_title: "Content Publishing Calendar & Planner",
    add_schedule_btn: "Schedule New Video",
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
    select_video_to_schedule: "Pick video from Vault to schedule:",
    schedule_time: "Target publish time:",
    target_platform: "Publish platform:",
    status_draft: "Draft",
    status_ready: "Ready",
    status_posted: "Published",

    // Document Studio
    doc_title: "Scriptwriting & Notes (Word Studio)",
    new_doc: "New Script Document",
    doc_name_placeholder: "Script title...",
    doc_empty: "No document selected. Click 'New Script Document' to start.",

    // Theme & Lang
    theme_dark: "Dark Mode",
    theme_light: "Light Mode",
    lang_vi: "Tiếng Việt",
    lang_en: "English",
    lang_zh: "中文",
    toast_downloading: "Downloading videos..."
  },

  zh: {
    // Brand & Workspace
    brand_title: "SocialContent",
    brand_sub: "Studio OS v1.0",
    workspace: "工作空间",
    vault_tab: "视频素材库 (Vault)",
    audio_tab: "音频工作室 (Audio)",
    calendar_tab: "排期日历 (Plan)",
    notes_tab: "剧本与笔记 (Word)",
    trash_tab: "回收站",
    quick_download: "快速下载视频",
    categories: "分类目录",
    all_videos: "全部视频",
    all_unclassified: "📁 全部视频 (未分类)",
    add_category: "添加分类",
    cat_name_placeholder: "分类名称 (如：美食、影视剪辑)",
    save: "保存",
    cancel: "取消",
    drive_sync: "谷歌云端硬盘",
    drive_desktop_sync: "本地同步",
    drive_cloud_api: "云端API",
    drive_local_only: "仅限本地",
    trash_banner_title: "回收站 (临时删除)",
    trash_banner_desc: "此处的视频已从主素材库移出。您可以随时恢复，或彻底永久删除（从电脑和谷歌云端硬盘中永久删除）。",
    restore_video: "恢复",
    permanent_delete: "永久删除",
    empty_trash: "清空回收站",
    empty_trash_confirm: "确定要永久清空回收站中的所有视频吗？电脑本地文件和谷歌云端硬盘上的文件都将被彻底永久删除！",
    permanent_delete_confirm: "确定要永久删除此视频吗？本地和谷歌云盘上的文件将被彻底删除！",
    soft_delete_confirm: "确定将此视频移至回收站吗？",
    move_to_trash: "移至回收站",
    trash_empty_state: "回收站空空如也！",
    back_to_vault: "返回视频素材库",

    // Top Header
    title_vault: "视频素材与资源库 (Media Vault)",
    title_audio: "音频处理工作室 (音频提取与音量增强)",
    title_calendar: "发布计划与日程 (Content Planner)",
    title_notes: "视频剧本创作与文案笔记 (Document Studio)",
    search_placeholder: "按标题、标签、创作者搜索...",
    export_zip: "导出 Zip",
    drive_btn: "云盘",
    add_video_btn: "添加视频",

    // Quick Bar
    quick_bar_placeholder: "快速粘贴视频链接 (抖音、TikTok、YouTube、Reels、X、网盘)...",
    download_now: "立即下载",

    // Filter & Batch
    all_platforms: "全部平台",
    select_all: "全选",
    deselect_all: "取消全选",
    move_category: "批量移动分类",
    video_unit: "个视频",

    // Vault Hub
    hero_badge: "STUDIO MEDIA VAULT & AI CONTENT",
    hero_title: "多渠道视频素材库与管理中心",
    hero_desc: "极速无水印下载抖音、TikTok、YouTube、Instagram Reels、X 或 Google Drive 视频。系统全自动提取视频标题、作者账号、高清封面及完整多语种标签。",
    open_downloader: "打开视频下载器",
    download_drive_folder: "下载网盘文件夹",
    download_batch_links: "批量链接下载",
    supported_platforms_heading: "支持的高清视频平台",

    // Platform features
    yt_desc: "支持 4K/1080p、YouTube Shorts，提取完整标签、文案和频道。",
    tt_desc: "高清原画无水印下载，自动解析创作者和完整标签列表。",
    dy_desc: "智能过滤去除抖音App分享的多余文字，直接下载 1080p 原画视频。",
    ig_desc: "高分辨率下载 Instagram Reels 和视频贴文，保留原版文案。",
    x_desc: "以最高码率下载原版视频，完整保存推文正文与发布者账号。",
    gd_desc: "支持单文件MP4下载，或全自动扫描提取整个网盘文件夹内全部视频。",

    // Workflow pillars
    pillar_1_title: "自动提取视频元数据",
    pillar_1_desc: "自动保存视频标题、作者频道、完整中英越文标签和原视频链接。",
    pillar_2_title: "拖拽式分类整理 (Drag & Drop)",
    pillar_2_desc: "直接将视频卡片拖拽至左侧分类列表中，或进行批量转移归类。",
    pillar_3_title: "同步发布日历与创作文案",
    pillar_3_desc: "一键将素材排入发布计划日历，或一键导入剧本工作室进行文案二创。",

    // Video Card
    view_details: "详情与播放",
    copy_hashtags: "复制标签",
    copied_toast: "已复制！",
    schedule_post: "排期发布",
    sync_to_drive: "同步到云端硬盘",
    delete_video: "删除视频",
    delete_video_confirm: "您确定要删除此视频吗？",
    author_prefix: "@",
    no_title: "无标题视频",

    // Downloader Modal
    downloader_title: "视频下载与数据提取",
    tab_single: "单个下载",
    tab_batch: "批量下载",
    tab_drive: "谷歌网盘",
    tab_tasks: "任务进度",
    enter_url_label: "输入抖音、TikTok、YouTube、Reels、X 视频链接：",
    paste_url_placeholder: "在此粘贴链接（支持带中文分享文本的抖音、TikTok链接）...",
    analyze_btn: "解析视频信息",
    analyzing_btn: "正在解析中...",
    save_category_label: "保存至分类：",
    start_download_btn: "下载至素材库",
    batch_label: "输入批量链接列表（每行一条）：",
    batch_placeholder: "https://...\nhttps://...",
    batch_start_btn: "开始批量下载",
    drive_label: "粘贴 Google Drive 文件或文件夹链接：",
    drive_placeholder: "https://drive.google.com/drive/folders/... 或 /file/d/...",
    drive_scan_btn: "扫描并解析网盘",
    drive_start_btn: "从云盘下载至素材库",
    drive_folder_found: "检测到 Google Drive 文件夹",
    drive_files_count: "个视频文件",

    // Video Detail Modal
    detail_title: "视频详细信息与发布策略",
    source_url: "原始视频链接：",
    open_source: "打开原网页",
    uploader: "发布作者 (Creator)：",
    quality: "清晰度：",
    duration: "时长：",
    download_date: "下载时间：",
    local_file: "本地存储路径：",
    hashtags_label: "提取的标签列表：",
    notes_label: "二创灵感与剧本文案：",
    notes_placeholder: "记录二创构思、黄金前三秒开头、改写文案...",
    save_changes: "保存更改",
    translate_section: "视频元数据多语种翻译 (标题、描述、标签)：",
    translate_to_vi: "🇻🇳 翻译为越南语 (Vietnamese)",
    translate_to_en: "🇺🇸 翻译为英语 (English)",
    translate_to_zh: "🇨🇳 翻译为中文 (Chinese)",
    translating: "正在翻译中...",

    // Calendar
    calendar_title: "发布排期日历与内容规划",
    add_schedule_btn: "新建排期",
    mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日",
    select_video_to_schedule: "从素材库选择视频进行排期：",
    schedule_time: "计划发布时间：",
    target_platform: "发布渠道：",
    status_draft: "草稿",
    status_ready: "待发",
    status_posted: "已发布",

    // Document Studio
    doc_title: "剧本文档创作与笔记 (Word Studio)",
    new_doc: "新建剧本文档",
    doc_name_placeholder: "文档标题...",
    doc_empty: "未选择任何文档。点击“新建剧本文档”开始创作。",

    // Theme & Lang
    theme_dark: "深色模式",
    theme_light: "浅色模式",
    lang_vi: "Tiếng Việt",
    lang_en: "English",
    lang_zh: "中文",
    toast_downloading: "正在下载视频..."
  }
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("app_language") || "vi";
  });

  const changeLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem("app_language", newLang);
  };

  const t = (key, fallback = "") => {
    if (translations[lang] && translations[lang][key] !== undefined) {
      return translations[lang][key];
    }
    if (translations.vi && translations.vi[key] !== undefined) {
      return translations.vi[key];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: "vi",
      setLanguage: () => {},
      t: (k, fb) => fb || k
    };
  }
  return context;
}
