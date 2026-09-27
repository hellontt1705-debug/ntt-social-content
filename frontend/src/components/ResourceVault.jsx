import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Star,
  Trash2,
  Edit3,
  Folder,
  FolderOpen,
  Grid,
  List,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Globe,
  Bot,
  HardDrive,
  X,
  RefreshCw,
  Zap,
  Bookmark,
  Pin,
  CheckSquare,
  Square,
  Layers,
  Clipboard,
  StopCircle
} from "lucide-react";
import {
  fetchResources,
  saveResource,
  deleteResource,
  toggleFavoriteResource,
  fetchResourceCategories,
  saveResourceCategory,
  deleteResourceCategory,
  scrapeResourceMetadata,
  batchScrapeResourceMetadata,
  batchSaveResources,
  batchMoveResources,
  batchDeleteResources,
  batchFavoriteResources,
  batchPinResources
} from "../api";
import { extractBatchUrls } from "../utils/urlHelper";
import { useLanguage } from "../i18n";

const TYPE_CONFIG = {
  website: { label: "Website", color: "#6366f1", bg: "rgba(99, 102, 241, 0.15)", icon: Globe },
  prompt_hub: { label: "Prompt Hub", color: "#a855f7", bg: "rgba(168, 85, 247, 0.15)", icon: Sparkles },
  doc: { label: "Google Docs", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)", icon: FileText },
  sheet: { label: "Google Sheets", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)", icon: FileSpreadsheet },
  slide: { label: "Google Slides", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", icon: FileText },
  drive: { label: "Google Drive", color: "#eab308", bg: "rgba(234, 179, 8, 0.15)", icon: HardDrive },
  pdf: { label: "Tài liệu PDF", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", icon: FileText },
  chatbot: { label: "Chatbot AI", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", icon: Bot },
};

export default function ResourceVault() {
  const { t } = useLanguage();
  const [resources, setResources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeType, setActiveType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoriteOnly, setShowFavoriteOnly] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [copiedId, setCopiedId] = useState(null);

  // Multi-select / Batch State
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchMoveTarget, setBatchMoveTarget] = useState("");
  const [batchToast, setBatchToast] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("single"); // "single" | "batch"
  const [editingResource, setEditingResource] = useState(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");

  // Batch Multi-threading Scraper States
  const [batchText, setBatchText] = useState("");
  const [batchCategory, setBatchCategory] = useState("default");
  const [batchConcurrency, setBatchConcurrency] = useState(5);
  const [batchTags, setBatchTags] = useState("");
  const [batchPinned, setBatchPinned] = useState(0);
  const [batchFavorite, setBatchFavorite] = useState(0);
  const [batchSkipExisting, setBatchSkipExisting] = useState(true);
  const [batchItems, setBatchItems] = useState([]);
  const [isBatchScraping, setIsBatchScraping] = useState(false);
  const [batchScrapeProgress, setBatchScrapeProgress] = useState({ current: 0, total: 0, success: 0, error: 0 });
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const abortScrapeRef = useRef(false);


  // Form State
  const [formData, setFormData] = useState({
    id: "",
    title: "",
    url: "",
    description: "",
    category_id: "rc_ready_prompts",
    type: "website",
    tags: "",
    image_url: "",
    is_favorite: 0,
    pinned: 0
  });

  // Category Form State
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#8b5cf6");
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [isInlineAddingCat, setIsInlineAddingCat] = useState(false);
  const [inlineNewCatName, setInlineNewCatName] = useState("");
  const [hoveredCatId, setHoveredCatId] = useState(null);
  const [modalEditingCatId, setModalEditingCatId] = useState(null);
  const [modalEditingCatName, setModalEditingCatName] = useState("");

  // Load Initial Data
  const loadData = async () => {
    try {
      setLoading(true);
      const [catsData, resData] = await Promise.all([
        fetchResourceCategories(),
        fetchResources()
      ]);
      setCategories(catsData || []);
      setResources(resData || []);
    } catch (err) {
      console.error("Error loading resources:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered resources
  const filteredResources = useMemo(() => {
    return resources.filter((item) => {
      // Category filter
      if (activeCategory !== "all" && item.category_id !== activeCategory) {
        return false;
      }
      // Type filter
      if (activeType !== "all" && item.type !== activeType) {
        return false;
      }
      // Favorite filter
      if (showFavoriteOnly && !item.is_favorite && !item.pinned) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const inTitle = item.title?.toLowerCase().includes(query);
        const inUrl = item.url?.toLowerCase().includes(query);
        const inDesc = item.description?.toLowerCase().includes(query);
        const inTags = Array.isArray(item.tags) && item.tags.some(tag => tag.toLowerCase().includes(query));
        if (!inTitle && !inUrl && !inDesc && !inTags) {
          return false;
        }
      }
      return true;
    });
  }, [resources, activeCategory, activeType, showFavoriteOnly, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = resources.length;
    const promptHubs = resources.filter(r => r.type === "prompt_hub").length;
    const googleDocs = resources.filter(r => r.type === "doc" || r.type === "sheet" || r.type === "drive").length;
    const favorites = resources.filter(r => r.is_favorite || r.pinned).length;
    return { total, promptHubs, googleDocs, favorites };
  }, [resources]);

  // Current Active Category Object
  const currentCategory = useMemo(() => {
    return categories.find((c) => c.id === activeCategory);
  }, [categories, activeCategory]);

  // Copy link handler
  const handleCopyLink = (url, id, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Open modal for add
  const handleOpenAddModal = (defaultCatId = null, initialMode = "single") => {
    setEditingResource(null);
    setScrapeError("");
    setModalMode(initialMode);
    const chosenCat = defaultCatId || (activeCategory !== "all" ? activeCategory : (categories[0]?.id || "default"));
    setFormData({
      id: "",
      title: "",
      url: "",
      description: "",
      category_id: chosenCat,
      type: "website",
      tags: "",
      image_url: "",
      is_favorite: 0,
      pinned: 0
    });
    setBatchCategory(chosenCat);
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEditModal = (item, e) => {
    e.stopPropagation();
    setEditingResource(item);
    setModalMode("single");
    setScrapeError("");
    setFormData({
      id: item.id,
      title: item.title || "",
      url: item.url || "",
      description: item.description || "",
      category_id: item.category_id || (categories[0]?.id || "default"),
      type: item.type || "website",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags || ""),
      image_url: item.image_url || "",
      is_favorite: item.is_favorite ? 1 : 0,
      pinned: item.pinned ? 1 : 0
    });
    setIsModalOpen(true);
  };


  // Auto scrape metadata
  const handleAutoScrape = async () => {
    if (!formData.url.trim()) {
      setScrapeError("Vui lòng nhập đường dẫn URL trước");
      return;
    }
    try {
      setIsScraping(true);
      setScrapeError("");
      const meta = await scrapeResourceMetadata(formData.url.trim());
      setFormData((prev) => ({
        ...prev,
        title: meta.title ? meta.title : prev.title,
        description: meta.description ? meta.description : prev.description,
        type: meta.type ? meta.type : prev.type,
        image_url: meta.image_url ? meta.image_url : prev.image_url
      }));
    } catch (err) {
      setScrapeError(err.message || "Không thể tự động đọc metadata từ link này");
    } finally {
      setIsScraping(false);
    }
  };

  // Batch Parsed URLs & Duplication Check
  const parsedBatchUrls = useMemo(() => {
    return extractBatchUrls(batchText);
  }, [batchText]);

  const existingUrlSet = useMemo(() => {
    return new Set(resources.map((r) => (r.url || "").trim().toLowerCase()));
  }, [resources]);

  const duplicateCount = useMemo(() => {
    return parsedBatchUrls.filter((u) => existingUrlSet.has(u.trim().toLowerCase())).length;
  }, [parsedBatchUrls, existingUrlSet]);

  const targetBatchUrls = useMemo(() => {
    if (batchSkipExisting) {
      return parsedBatchUrls.filter((u) => !existingUrlSet.has(u.trim().toLowerCase()));
    }
    return parsedBatchUrls;
  }, [parsedBatchUrls, batchSkipExisting, existingUrlSet]);

  // Quick fill sample URLs
  const handleFillSampleUrls = () => {
    const samples = [
      "https://civitai.com",
      "https://flowgpt.com",
      "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
      "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
      "https://github.com",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ];
    setBatchText(samples.join("\n"));
  };

  // Quick paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setBatchText((prev) => (prev ? `${prev}\n${text}` : text));
      }
    } catch (e) {
      console.error("Clipboard read error:", e);
    }
  };

  // Start Multi-Threaded Batch Scrape
  const handleStartBatchScrape = async () => {
    if (targetBatchUrls.length === 0) {
      alert("Không có đường link mới nào hợp lệ để quét!");
      return;
    }

    abortScrapeRef.current = false;
    setIsBatchScraping(true);

    // Initialize batch items with pending status
    const initialItems = targetBatchUrls.map((url, idx) => {
      let guessedTitle = "";
      try {
        const uObj = new URL(url);
        guessedTitle = uObj.hostname.replace("www.", "");
      } catch (e) {
        guessedTitle = url;
      }

      return {
        id: `batch_${Date.now()}_${idx}`,
        url,
        title: guessedTitle,
        description: "",
        type: "website",
        category_id: batchCategory,
        tags: batchTags ? batchTags.split(",").map(t => t.trim()).filter(Boolean) : [],
        image_url: "",
        favicon_url: `https://www.google.com/s2/favicons?domain=${guessedTitle}&sz=64`,
        status: "pending",
        error: "",
        selected: true
      };
    });

    setBatchItems(initialItems);
    setBatchScrapeProgress({ current: 0, total: initialItems.length, success: 0, error: 0 });

    let nextIndex = 0;
    let completedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const workerCount = Math.min(initialItems.length, Math.max(batchConcurrency, 1));

    const runWorker = async () => {
      while (nextIndex < initialItems.length) {
        if (abortScrapeRef.current) break;
        const currentIndex = nextIndex++;
        const item = initialItems[currentIndex];

        // Mark item as currently scraping
        setBatchItems((prev) =>
          prev.map((it, idx) => (idx === currentIndex ? { ...it, status: "scraping" } : it))
        );

        try {
          const meta = await scrapeResourceMetadata(item.url);
          if (abortScrapeRef.current) break;

          successCount++;
          setBatchItems((prev) =>
            prev.map((it, idx) => {
              if (idx === currentIndex) {
                return {
                  ...it,
                  status: "done",
                  title: meta.title || it.title,
                  description: meta.description || "",
                  type: meta.type || "website",
                  image_url: meta.image_url || "",
                  favicon_url: meta.favicon_url || it.favicon_url
                };
              }
              return it;
            })
          );
        } catch (err) {
          if (abortScrapeRef.current) break;
          errorCount++;
          setBatchItems((prev) =>
            prev.map((it, idx) => {
              if (idx === currentIndex) {
                return {
                  ...it,
                  status: "error",
                  error: err.message || "Không thể lấy thông tin"
                };
              }
              return it;
            })
          );
        } finally {
          completedCount++;
          setBatchScrapeProgress({
            current: completedCount,
            total: initialItems.length,
            success: successCount,
            error: errorCount
          });
        }
      }
    };

    const workers = Array.from({ length: workerCount }, () => runWorker());
    await Promise.all(workers);
    setIsBatchScraping(false);
  };

  // Stop multi-thread scraper
  const handleStopBatchScrape = () => {
    abortScrapeRef.current = true;
    setIsBatchScraping(false);
  };

  // Retry scraping a single item
  const handleRetrySingleBatchItem = async (targetIndex) => {
    const item = batchItems[targetIndex];
    if (!item) return;

    setBatchItems((prev) =>
      prev.map((it, idx) => (idx === targetIndex ? { ...it, status: "scraping", error: "" } : it))
    );

    try {
      const meta = await scrapeResourceMetadata(item.url);
      setBatchItems((prev) =>
        prev.map((it, idx) => {
          if (idx === targetIndex) {
            return {
              ...it,
              status: "done",
              title: meta.title || it.title,
              description: meta.description || "",
              type: meta.type || "website",
              image_url: meta.image_url || "",
              favicon_url: meta.favicon_url || it.favicon_url
            };
          }
          return it;
        })
      );
    } catch (err) {
      setBatchItems((prev) =>
        prev.map((it, idx) =>
          idx === targetIndex ? { ...it, status: "error", error: err.message || "Lỗi khi quét lại" } : it
        )
      );
    }
  };

  // Save all selected items
  const handleSaveAllBatchItems = async () => {
    const selectedItems = batchItems.filter((it) => it.selected);
    if (selectedItems.length === 0) {
      alert("Vui lòng chọn ít nhất một liên kết để lưu!");
      return;
    }

    try {
      setIsBatchSaving(true);
      const payload = selectedItems.map((it) => ({
        title: it.title || "Liên kết không tên",
        url: it.url,
        description: it.description || "",
        category_id: it.category_id || batchCategory,
        type: it.type || "website",
        tags: Array.isArray(it.tags) ? it.tags : (batchTags ? batchTags.split(",").map(t => t.trim()).filter(Boolean) : []),
        image_url: it.image_url || "",
        favicon_url: it.favicon_url || "",
        is_favorite: batchFavorite ? 1 : 0,
        pinned: batchPinned ? 1 : 0
      }));

      const res = await batchSaveResources(payload);
      if (res && res.resources) {
        setResources((prev) => [...res.resources, ...prev]);
        showToast(`Đã lưu thành công ${res.resources.length} liên kết vào Kho!`, "success");
        setIsModalOpen(false);
        setBatchItems([]);
        setBatchText("");
      }
    } catch (err) {
      alert("Lỗi khi lưu liên kết hàng loạt: " + err.message);
    } finally {
      setIsBatchSaving(false);
    }
  };


  // Save resource
  const handleSaveResource = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.url.trim()) {
      alert("Vui lòng nhập tiêu đề và đường dẫn URL!");
      return;
    }

    const tagsArray = formData.tags
      ? formData.tags.split(",").map(t => t.trim()).filter(Boolean)
      : [];

    const payload = {
      id: formData.id || undefined,
      title: formData.title.trim(),
      url: formData.url.trim(),
      description: formData.description.trim(),
      category_id: formData.category_id,
      type: formData.type,
      tags: tagsArray,
      image_url: (formData.image_url || "").trim(),
      is_favorite: formData.is_favorite,
      pinned: formData.pinned
    };

    try {
      await saveResource(payload);
      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      alert("Lỗi khi lưu tài nguyên: " + err.message);
    }
  };

  // Delete resource
  const handleDeleteResource = async (id, title, e) => {
    e.stopPropagation();
    if (window.confirm(`Bạn có chắc muốn xóa liên kết "${title}"?`)) {
      try {
        await deleteResource(id);
        setResources(prev => prev.filter(r => r.id !== id));
      } catch (err) {
        alert("Lỗi khi xóa: " + err.message);
      }
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await toggleFavoriteResource(id);
      setResources(prev =>
        prev.map(r => r.id === id ? { ...r, is_favorite: res.is_favorite } : r)
      );
    } catch (err) {
      console.error("Lỗi toggle favorite:", err);
    }
  };

  // Create Category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await saveResourceCategory({
        name: newCatName.trim(),
        color: newCatColor,
        icon: "folder"
      });
      setNewCatName("");
      const updatedCats = await fetchResourceCategories();
      setCategories(updatedCats || []);
    } catch (err) {
      alert("Lỗi tạo thư mục: " + err.message);
    }
  };

  // Rename / Update Category Name
  const handleRenameCategory = async (catId, newName, color) => {
    if (!newName || !newName.trim()) {
      setEditingCatId(null);
      setModalEditingCatId(null);
      return;
    }
    try {
      const existing = categories.find((c) => c.id === catId);
      await saveResourceCategory({
        id: catId,
        name: newName.trim(),
        color: color || existing?.color || "#8b5cf6",
        icon: existing?.icon || "folder"
      });
      showToast(`Đã đổi tên thư mục thành "${newName.trim()}"!`, "success");
      setEditingCatId(null);
      setModalEditingCatId(null);
      await loadData();
    } catch (err) {
      alert("Lỗi đổi tên thư mục: " + err.message);
    }
  };

  // Create Category from inline input
  const handleCreateInlineCategory = async (name) => {
    if (!name || !name.trim()) {
      setIsInlineAddingCat(false);
      return;
    }
    try {
      const created = await saveResourceCategory({
        name: name.trim(),
        color: "#8b5cf6",
        icon: "folder"
      });
      showToast(`Đã tạo thư mục mới "${name.trim()}"!`, "success");
      setIsInlineAddingCat(false);
      setInlineNewCatName("");
      const updatedCats = await fetchResourceCategories();
      setCategories(updatedCats || []);
      if (created?.id) {
        setActiveCategory(created.id);
        setShowFavoriteOnly(false);
      }
      await loadData();
    } catch (err) {
      alert("Lỗi tạo thư mục: " + err.message);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (catId, catName, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (window.confirm(`Bạn có chắc muốn xóa thư mục "${catName}"? Các liên kết bên trong sẽ được chuyển về mặc định.`)) {
      try {
        await deleteResourceCategory(catId);
        if (activeCategory === catId) setActiveCategory("all");
        showToast(`Đã xóa thư mục "${catName}"!`, "info");
        const updatedCats = await fetchResourceCategories();
        setCategories(updatedCats || []);
        await loadData();
      } catch (err) {
        alert("Lỗi xóa thư mục: " + err.message);
      }
    }
  };

  // Restore Default Sample Categories
  const handleRestoreDefaultCategories = async () => {
    try {
      const defaults = [
        { id: "rc_ready_prompts", name: "Sẵn Prompt Đủ Loại", color: "#8b5cf6", icon: "folder" },
        { id: "rc_prompt_hubs", name: "Prompt Hubs & Thư Viện AI", color: "#3b82f6", icon: "folder" },
        { id: "rc_google_docs", name: "Google Docs / Sheets / Drive", color: "#10b981", icon: "folder" },
        { id: "rc_tools", name: "Công Cụ & Tiện Ích AI", color: "#ec4899", icon: "folder" }
      ];
      for (const cat of defaults) {
        await saveResourceCategory(cat);
      }
      const updatedCats = await fetchResourceCategories();
      setCategories(updatedCats || []);
      showToast("Đã khôi phục các thư mục mẫu mặc định!", "success");
      await loadData();
    } catch (err) {
      alert("Lỗi khôi phục thư mục: " + err.message);
    }
  };

  // Toast feedback helper
  const showToast = (message, type = "success") => {
    setBatchToast({ message, type });
    setTimeout(() => setBatchToast(null), 3500);
  };

  // Toggle select a resource
  const toggleSelectResource = (id, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select all or Deselect all
  const handleSelectAll = () => {
    if (selectedIds.length === filteredResources.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredResources.map((r) => r.id));
    }
  };

  // Batch move category
  const handleBatchMove = async (targetCatId) => {
    if (!targetCatId || selectedIds.length === 0) return;
    try {
      await batchMoveResources(selectedIds, targetCatId);
      const catName = categories.find((c) => c.id === targetCatId)?.name || targetCatId;
      showToast(`Đã chuyển ${selectedIds.length} liên kết sang thư mục "${catName}"!`, "success");
      setSelectedIds([]);
      setBatchMoveTarget("");
      await loadData();
    } catch (err) {
      alert("Lỗi khi chuyển thư mục hàng loạt: " + err.message);
    }
  };

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} liên kết đã chọn?`)) {
      return;
    }
    try {
      await batchDeleteResources(selectedIds);
      showToast(`Đã xóa thành công ${selectedIds.length} liên kết!`, "info");
      setSelectedIds([]);
      await loadData();
    } catch (err) {
      alert("Lỗi khi xóa hàng loạt: " + err.message);
    }
  };

  // Batch favorite
  const handleBatchFavorite = async (isFav) => {
    if (selectedIds.length === 0) return;
    try {
      await batchFavoriteResources(selectedIds, isFav);
      showToast(isFav ? `Đã thêm ${selectedIds.length} liên kết vào Yêu thích!` : `Đã bỏ yêu thích ${selectedIds.length} liên kết!`, "success");
      await loadData();
    } catch (err) {
      alert("Lỗi cập nhật yêu thích hàng loạt: " + err.message);
    }
  };

  // Batch pin
  const handleBatchPin = async (isPinned) => {
    if (selectedIds.length === 0) return;
    try {
      await batchPinResources(selectedIds, isPinned);
      showToast(isPinned ? `Đã ghim ${selectedIds.length} liên kết lên đầu trang!` : `Đã bỏ ghim ${selectedIds.length} liên kết!`, "success");
      await loadData();
    } catch (err) {
      alert("Lỗi ghim hàng loạt: " + err.message);
    }
  };

  // Batch copy URLs
  const handleBatchCopyUrls = () => {
    if (selectedIds.length === 0) return;
    const selectedItems = resources.filter((r) => selectedIds.includes(r.id));
    const textList = selectedItems
      .map((r) => `- [${r.title}](${r.url}) : ${r.description || ""}`)
      .join("\n");
    navigator.clipboard.writeText(textList);
    showToast(`Đã sao chép danh sách ${selectedIds.length} liên kết vào bộ nhớ tạm!`, "success");
  };

  // Batch open in tabs
  const handleBatchOpenTabs = () => {
    if (selectedIds.length === 0) return;
    const selectedItems = resources.filter((r) => selectedIds.includes(r.id));
    selectedItems.forEach((r) => {
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
    showToast(`Đã mở ${selectedIds.length} liên kết trong các tab mới!`, "info");
  };

  return (
    <div className="view-content" style={{ display: "flex", flexDirection: "column", height: "100%", padding: "12px 18px", overflow: "hidden" }}>
      {/* Top Header & Overview Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(139, 92, 246, 0.35)" }}>
              <Bookmark size={17} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                Kho Link & Ghi Chú Tài Nguyên
                <span style={{ fontSize: "10.5px", fontWeight: 600, padding: "2px 7px", borderRadius: "10px", background: "rgba(139, 92, 246, 0.2)", color: "#c084fc", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
                  Resource Vault
                </span>
              </h1>
              <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "var(--text-muted)" }}>
                Lưu trữ link Prompt AI, Google Docs, Sheets, Drive và ghi chú chi tiết công dụng hoạt động
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Quick Stats Pills */}
          <div style={{ display: "flex", gap: "6px", marginRight: "6px", background: "rgba(255, 255, 255, 0.03)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Tổng cộng: <b style={{ color: "#fff" }}>{stats.total}</b> link
            </span>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
            <span style={{ fontSize: "11px", color: "#a855f7" }}>
              Prompt Hubs: <b>{stats.promptHubs}</b>
            </span>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
            <span style={{ fontSize: "11px", color: "#3b82f6" }}>
              Google Docs/Drive: <b>{stats.googleDocs}</b>
            </span>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsCategoryModalOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", fontSize: "11.5px" }}
          >
            <Folder size={13} />
            <span>Thư mục</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpenAddModal(null, "batch")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 11px",
              fontSize: "11.5px",
              background: "rgba(168, 85, 247, 0.15)",
              border: "1px solid rgba(168, 85, 247, 0.35)",
              color: "#c084fc",
              fontWeight: 600
            }}
            title="Quét hàng loạt link web đa luồng siêu tốc"
          >
            <Zap size={13} color="#c084fc" />
            <span>Quét Đa Luồng</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleOpenAddModal(null, "single")}
            style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 12px", fontSize: "11.5px", boxShadow: "0 4px 12px rgba(139, 92, 246, 0.35)" }}
          >
            <Plus size={14} color="#fff" />
            <span style={{ fontWeight: 600 }}>Thêm Link Mới</span>
          </button>
        </div>
      </div>

      {/* Main Layout Area: Left Sidebar (Categories) + Right Content (Resources List) */}
      <div style={{ display: "flex", gap: "12px", flex: 1, minHeight: 0 }}>
        {/* Left Category / Folder Sidebar */}
        <div style={{ width: "245px", flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--card-bg, #12131f)", borderRadius: "10px", border: "1px solid var(--border-color)", padding: "10px", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
              Thư mục lưu trữ
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <button
                className="icon-btn"
                onClick={() => setIsInlineAddingCat(prev => !prev)}
                title="Tạo nhanh thư mục mới"
                style={{ padding: "4px", color: isInlineAddingCat ? "#a855f7" : "var(--text-secondary)" }}
              >
                <Plus size={14} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setIsCategoryModalOpen(true)}
                title="Quản lý chi tiết thư mục"
                style={{ padding: "4px", color: "var(--text-secondary)" }}
              >
                <Folder size={13} />
              </button>
            </div>
          </div>

          {/* Folder List */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", paddingRight: "4px" }}>
            {/* Inline Add Category Input */}
            {isInlineAddingCat && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 7px",
                  background: "rgba(139, 92, 246, 0.15)",
                  borderRadius: "7px",
                  border: "1px dashed #8b5cf6",
                  marginBottom: "4px"
                }}
              >
                <Folder size={13} color="#8b5cf6" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Tên thư mục mới..."
                  value={inlineNewCatName}
                  onChange={(e) => setInlineNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateInlineCategory(inlineNewCatName);
                    } else if (e.key === "Escape") {
                      setIsInlineAddingCat(false);
                      setInlineNewCatName("");
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 500
                  }}
                />
                <button
                  className="icon-btn"
                  onClick={() => handleCreateInlineCategory(inlineNewCatName)}
                  title="Tạo thư mục"
                  style={{ padding: "2px", color: "#10b981" }}
                >
                  <Check size={13} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => {
                    setIsInlineAddingCat(false);
                    setInlineNewCatName("");
                  }}
                  title="Hủy"
                  style={{ padding: "2px", color: "var(--text-muted)" }}
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* All Resources Item */}
            <button
              onClick={() => {
                setActiveCategory("all");
                setShowFavoriteOnly(false);
                setSelectedIds([]);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 9px",
                borderRadius: "8px",
                border: "none",
                background: activeCategory === "all" && !showFavoriteOnly ? "rgba(139, 92, 246, 0.18)" : "transparent",
                color: activeCategory === "all" && !showFavoriteOnly ? "#fff" : "var(--text-secondary)",
                fontWeight: activeCategory === "all" && !showFavoriteOnly ? 600 : 500,
                fontSize: "12.5px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                <FolderOpen size={15} color={activeCategory === "all" && !showFavoriteOnly ? "#a855f7" : "currentColor"} />
                <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>Tất cả liên kết</span>
              </div>
              <span style={{ fontSize: "11px", opacity: 0.6, background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: "10px" }}>
                {resources.length}
              </span>
            </button>

            {/* Favorite & Pinned Item */}
            <button
              onClick={() => {
                setShowFavoriteOnly(true);
                setActiveCategory("all");
                setSelectedIds([]);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 9px",
                borderRadius: "8px",
                border: "none",
                background: showFavoriteOnly ? "rgba(245, 158, 11, 0.18)" : "transparent",
                color: showFavoriteOnly ? "#fbbf24" : "var(--text-secondary)",
                fontWeight: showFavoriteOnly ? 600 : 500,
                fontSize: "12.5px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                <Star size={15} fill={showFavoriteOnly ? "#fbbf24" : "none"} color="#fbbf24" />
                <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>Yêu thích & Đã ghim</span>
              </div>
              <span style={{ fontSize: "11px", opacity: 0.6, background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: "10px" }}>
                {stats.favorites}
              </span>
            </button>

            <div style={{ height: "1px", background: "rgba(255, 255, 255, 0.05)", margin: "4px 0" }} />

            {/* User Categories */}
            {categories.map((cat) => {
              const isSelected = activeCategory === cat.id && !showFavoriteOnly;
              const count = resources.filter(r => r.category_id === cat.id).length;
              const isHovered = hoveredCatId === cat.id;

              if (editingCatId === cat.id) {
                return (
                  <div
                    key={cat.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "5px 7px",
                      background: "rgba(139, 92, 246, 0.2)",
                      borderRadius: "7px",
                      border: "1px solid var(--accent-primary, #8b5cf6)"
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Folder size={13} color={cat.color || "#8b5cf6"} style={{ flexShrink: 0 }} />
                    <input
                      type="text"
                      autoFocus
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleRenameCategory(cat.id, editingCatName);
                        } else if (e.key === "Escape") {
                          setEditingCatId(null);
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 500
                      }}
                    />
                    <button
                      className="icon-btn"
                      onClick={() => handleRenameCategory(cat.id, editingCatName)}
                      title="Lưu tên mới"
                      style={{ padding: "2px", color: "#10b981" }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => setEditingCatId(null)}
                      title="Hủy"
                      style={{ padding: "2px", color: "var(--text-muted)" }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              }

              if (isSelected) {
                return (
                  <div
                    key={cat.id}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingCatId(cat.id);
                      setEditingCatName(cat.name);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      padding: "8px 9px",
                      borderRadius: "8px",
                      background: "rgba(139, 92, 246, 0.22)",
                      border: "1px solid rgba(139, 92, 246, 0.5)",
                      boxShadow: "0 2px 10px rgba(139, 92, 246, 0.2)",
                      transition: "all 0.15s ease",
                      position: "relative"
                    }}
                  >
                    {/* Top Row: Icon + Full Name + Count */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "7px", flex: 1, minWidth: 0 }}>
                        <Folder size={15} color={cat.color || "#8b5cf6"} style={{ flexShrink: 0, marginTop: "2px" }} />
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "12.5px",
                            lineHeight: "1.35",
                            color: "#fff",
                            wordBreak: "break-word"
                          }}
                          title={`${cat.name} (Nhấp đúp để sửa tên nhanh)`}
                        >
                          {cat.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 600,
                          background: "rgba(139, 92, 246, 0.4)",
                          color: "#fff",
                          padding: "1px 6px",
                          borderRadius: "10px",
                          flexShrink: 0
                        }}
                      >
                        {count}
                      </span>
                    </div>

                    {/* Dedicated Action Tools Row for Selected Folder */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        paddingTop: "6px",
                        marginTop: "2px",
                        borderTop: "1px solid rgba(139, 92, 246, 0.25)"
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Sửa tên */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditingCatName(cat.name);
                        }}
                        title="Đổi tên thư mục này"
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                          padding: "3px 4px",
                          fontSize: "11px",
                          background: "rgba(255, 255, 255, 0.08)",
                          color: "#e2e8f0",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          borderRadius: "5px",
                          cursor: "pointer"
                        }}
                      >
                        <Edit3 size={11} color="#c084fc" />
                        <span>Sửa</span>
                      </button>

                      {/* Thêm link */}
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(cat.id)}
                        title="Thêm link mới vào thư mục này"
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                          padding: "3px 4px",
                          fontSize: "11px",
                          background: "rgba(139, 92, 246, 0.35)",
                          color: "#fff",
                          border: "1px solid rgba(139, 92, 246, 0.5)",
                          borderRadius: "5px",
                          cursor: "pointer",
                          fontWeight: 500
                        }}
                      >
                        <Plus size={11} />
                        <span>+ Link</span>
                      </button>

                      {/* Xóa thư mục - LUÔN HIỂN THỊ */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCategory(cat.id, cat.name, e)}
                        title="Xóa thư mục này"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                          padding: "3px 6px",
                          fontSize: "11px",
                          background: "rgba(239, 68, 68, 0.18)",
                          color: "#f87171",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          borderRadius: "5px",
                          cursor: "pointer"
                        }}
                      >
                        <Trash2 size={11} />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setShowFavoriteOnly(false);
                    setSelectedIds([]);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingCatId(cat.id);
                    setEditingCatName(cat.name);
                  }}
                  onMouseEnter={() => setHoveredCatId(cat.id)}
                  onMouseLeave={() => setHoveredCatId(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 9px",
                    borderRadius: "8px",
                    background: isHovered ? "rgba(255, 255, 255, 0.05)" : "transparent",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "12.5px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    border: "1px solid transparent",
                    position: "relative"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", flex: 1, minWidth: 0, paddingRight: "4px" }}>
                    <Folder size={14} color={cat.color || "#8b5cf6"} style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        lineHeight: "1.35"
                      }}
                      title={`${cat.name} (Bấm để xem và mở công cụ)`}
                    >
                      {cat.name}
                    </span>
                  </div>

                  {/* Actions & Count: On hover, show quick action icons */}
                  <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {isHovered ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                        <button
                          className="icon-btn"
                          onClick={() => {
                            setEditingCatId(cat.id);
                            setEditingCatName(cat.name);
                          }}
                          title="Sửa tên thư mục"
                          style={{
                            padding: "3px 4px",
                            color: "var(--text-secondary)",
                            background: "rgba(255, 255, 255, 0.06)",
                            borderRadius: "4px"
                          }}
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => handleOpenAddModal(cat.id)}
                          title="Thêm link vào mục này"
                          style={{
                            padding: "3px 4px",
                            color: "#c084fc",
                            background: "rgba(139, 92, 246, 0.15)",
                            borderRadius: "4px"
                          }}
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={(e) => handleDeleteCategory(cat.id, cat.name, e)}
                          title="Xóa thư mục này"
                          style={{
                            padding: "3px 4px",
                            color: "#f87171",
                            background: "rgba(239, 68, 68, 0.12)",
                            borderRadius: "4px"
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                        <span style={{ fontSize: "11px", opacity: 0.85, background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: "10px" }}>
                          {count}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: "11px", opacity: 0.6, background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: "10px" }}>
                        {count}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {categories.length === 0 && (
              <div style={{ padding: "12px 6px", textAlign: "center", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px dashed rgba(255, 255, 255, 0.1)", marginTop: "4px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Chưa có thư mục nào
                </span>
                <button
                  type="button"
                  onClick={handleRestoreDefaultCategories}
                  style={{
                    fontSize: "10.5px",
                    color: "#c084fc",
                    background: "rgba(139, 92, 246, 0.12)",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    borderRadius: "5px",
                    padding: "3px 8px",
                    cursor: "pointer"
                  }}
                >
                  Khôi phục thư mục mẫu
                </button>
              </div>
            )}
          </div>

          {/* Quick Create Folder Button */}
          <button
            onClick={() => setIsInlineAddingCat(true)}
            style={{
              marginTop: "8px",
              padding: "6px 8px",
              borderRadius: "7px",
              border: "1px dashed rgba(139, 92, 246, 0.4)",
              background: "rgba(139, 92, 246, 0.06)",
              color: "#c084fc",
              fontSize: "11.5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(139, 92, 246, 0.06)"}
          >
            <Plus size={13} />
            <span>Tạo thư mục mới</span>
          </button>

          {/* Quick Add To Current Folder Button */}
          <button
            onClick={() => handleOpenAddModal(activeCategory !== "all" ? activeCategory : null)}
            style={{
              marginTop: "4px",
              padding: "6px 8px",
              borderRadius: "7px",
              border: "1px dashed rgba(255, 255, 255, 0.15)",
              background: "rgba(255, 255, 255, 0.02)",
              color: "var(--text-muted)",
              fontSize: "11.5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px"
            }}
          >
            <Plus size={13} />
            <span>Thêm link vào mục này</span>
          </button>
        </div>

        {/* Right Content Area: Filter Bar + Cards */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {/* Active Folder Header Banner with Full Name & Action Tools */}
          {activeCategory !== "all" && currentCategory && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 14px",
                marginBottom: "10px",
                background: "linear-gradient(90deg, rgba(139, 92, 246, 0.16), rgba(59, 130, 246, 0.1))",
                border: "1px solid rgba(139, 92, 246, 0.4)",
                borderRadius: "9px",
                flexWrap: "wrap",
                gap: "10px",
                flexShrink: 0
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Folder size={17} color={currentCategory.color || "#a855f7"} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                      {currentCategory.name}
                    </span>
                    <span style={{ fontSize: "11px", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: "12px", color: "var(--text-secondary)" }}>
                      {filteredResources.length} liên kết
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Đang xem thư mục này • Bấm các nút bên phải để sửa tên, xóa hoặc thêm link vào đây
                  </span>
                </div>
              </div>

              {/* Action tools for current folder */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setEditingCatId(currentCategory.id);
                    setEditingCatName(currentCategory.name);
                  }}
                  title="Đổi tên thư mục này"
                  style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", fontSize: "12px" }}
                >
                  <Edit3 size={13} color="#a855f7" />
                  <span>Sửa tên</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => handleDeleteCategory(currentCategory.id, currentCategory.name, e)}
                  title="Xóa thư mục này"
                  style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", fontSize: "12px", color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" }}
                >
                  <Trash2 size={13} />
                  <span>Xóa thư mục</span>
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleOpenAddModal(currentCategory.id)}
                  style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", fontSize: "12px", background: "linear-gradient(135deg, #8b5cf6, #6d28d9)" }}
                >
                  <Plus size={13} color="#fff" />
                  <span style={{ fontWeight: 600 }}>Thêm link vào mục này</span>
                </button>
              </div>
            </div>
          )}
          {/* Filter & Search Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px", flexShrink: 0, flexWrap: "nowrap" }}>
            {/* Search Input */}
            <div style={{ position: "relative", width: "230px", flexShrink: 0 }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Tìm link, URL, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px 6px 30px",
                  fontSize: "12px",
                  background: "var(--card-bg, #12131f)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  color: "#fff",
                  outline: "none"
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Type Filters */}
            <div style={{ display: "flex", alignItems: "center", gap: "5px", overflowX: "auto", flex: 1, minWidth: 0, paddingBottom: "2px", scrollbarWidth: "none" }}>
              <button
                className={`btn btn-sm ${activeType === "all" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveType("all")}
                style={{ fontSize: "11px", padding: "4px 9px", flexShrink: 0 }}
              >
                Tất cả
              </button>
              {Object.entries(TYPE_CONFIG).map(([typeKey, cfg]) => {
                const IconComponent = cfg.icon;
                const isSelected = activeType === typeKey;
                return (
                  <button
                    key={typeKey}
                    onClick={() => setActiveType(typeKey)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: isSelected ? `1px solid ${cfg.color}` : "1px solid var(--border-color)",
                      background: isSelected ? cfg.bg : "rgba(255, 255, 255, 0.03)",
                      color: isSelected ? cfg.color : "var(--text-secondary)",
                      fontSize: "11px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      fontWeight: isSelected ? 600 : 500,
                      flexShrink: 0
                    }}
                  >
                    <IconComponent size={12} color={cfg.color} />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Select All Toggle & View Mode Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSelectAll}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  background: selectedIds.length > 0 ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  borderColor: selectedIds.length > 0 ? "rgba(139, 92, 246, 0.5)" : "var(--border-color)",
                  color: selectedIds.length > 0 ? "#c084fc" : "var(--text-secondary)"
                }}
                title={selectedIds.length === filteredResources.length && filteredResources.length > 0 ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              >
                {selectedIds.length > 0 && selectedIds.length === filteredResources.length ? (
                  <CheckSquare size={14} color="#a855f7" />
                ) : (
                  <Square size={14} />
                )}
                <span>
                  {selectedIds.length > 0 ? `Đã chọn (${selectedIds.length}/${filteredResources.length})` : "Chọn tất cả"}
                </span>
              </button>

              <div style={{ display: "flex", gap: "2px", background: "rgba(255, 255, 255, 0.05)", padding: "2px", borderRadius: "6px" }}>
                <button
                  className="icon-btn"
                  onClick={() => setViewMode("grid")}
                  title="Dạng lưới thẻ (Grid)"
                  style={{ padding: "4px", background: viewMode === "grid" ? "rgba(139, 92, 246, 0.3)" : "transparent" }}
                >
                  <Grid size={15} color={viewMode === "grid" ? "#a855f7" : "currentColor"} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setViewMode("list")}
                  title="Dạng danh sách (List)"
                  style={{ padding: "4px", background: viewMode === "list" ? "rgba(139, 92, 246, 0.3)" : "transparent" }}
                >
                  <List size={15} color={viewMode === "list" ? "#a855f7" : "currentColor"} />
                </button>
              </div>
            </div>
          </div>

          {/* Batch Actions Bar (Floating/Sticky Toolbar) */}
          {selectedIds.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                padding: "8px 14px",
                marginBottom: "12px",
                background: "linear-gradient(90deg, rgba(139, 92, 246, 0.18), rgba(59, 130, 246, 0.15))",
                border: "1px solid rgba(139, 92, 246, 0.45)",
                borderRadius: "10px",
                backdropFilter: "blur(12px)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.28)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                    color: "#fff",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 600
                  }}
                >
                  <CheckSquare size={13} />
                  {selectedIds.length} đã chọn
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Thao tác hàng loạt:</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {/* Batch Move to folder */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Folder size={14} color="#a855f7" />
                  <select
                    value={batchMoveTarget}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBatchMoveTarget(val);
                      if (val) handleBatchMove(val);
                    }}
                    style={{
                      background: "rgba(10, 11, 20, 0.85)",
                      border: "1px solid rgba(139, 92, 246, 0.4)",
                      borderRadius: "6px",
                      color: "#fff",
                      padding: "4px 8px",
                      fontSize: "12px",
                      outline: "none",
                      cursor: "pointer"
                    }}
                  >
                    <option value="">📁 Chuyển thư mục...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Batch Favorite */}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleBatchFavorite(1)}
                  title="Thêm các mục đã chọn vào Yêu thích"
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 9px", fontSize: "12px" }}
                >
                  <Star size={13} color="#fbbf24" fill="#fbbf24" />
                  <span>Yêu thích</span>
                </button>

                {/* Batch Pin */}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleBatchPin(1)}
                  title="Ghim các mục đã chọn lên đầu"
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 9px", fontSize: "12px" }}
                >
                  <Pin size={13} color="#f59e0b" />
                  <span>Ghim</span>
                </button>

                {/* Batch Copy URLs */}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleBatchCopyUrls}
                  title="Sao chép toàn bộ URL của các mục đã chọn"
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 9px", fontSize: "12px" }}
                >
                  <Copy size={13} />
                  <span>Chép Link</span>
                </button>

                {/* Batch Open in new tabs */}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleBatchOpenTabs}
                  title="Mở tất cả link trong tab mới"
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 9px", fontSize: "12px" }}
                >
                  <ExternalLink size={13} />
                  <span>Mở tất cả</span>
                </button>

                {/* Batch Delete */}
                <button
                  className="btn btn-danger btn-sm"
                  onClick={handleBatchDelete}
                  title="Xóa tất cả mục đã chọn"
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 9px", fontSize: "12px", background: "rgba(239, 68, 68, 0.2)", borderColor: "rgba(239, 68, 68, 0.4)", color: "#f87171" }}
                >
                  <Trash2 size={13} />
                  <span>Xóa ({selectedIds.length})</span>
                </button>

                {/* Deselect */}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedIds([])}
                  title="Bỏ chọn tất cả"
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Resources Grid / List Container */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: "4px" }}>
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px", color: "var(--text-muted)" }}>
                <RefreshCw size={22} className="spin" style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ marginLeft: "10px" }}>Đang tải danh sách liên kết...</span>
              </div>
            ) : filteredResources.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", background: "var(--card-bg, #12131f)", borderRadius: "12px", border: "1px dashed rgba(255, 255, 255, 0.15)", padding: "24px", textAlign: "center" }}>
                <Bookmark size={40} color="var(--text-muted)" style={{ marginBottom: "12px", opacity: 0.5 }} />
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#fff" }}>
                  {activeCategory !== "all" && currentCategory
                    ? `Thư mục "${currentCategory.name}" chưa có liên kết`
                    : "Không tìm thấy liên kết nào"}
                </h3>
                <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-muted)", maxWidth: "450px", lineHeight: "1.5" }}>
                  {searchQuery
                    ? "Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc."
                    : activeCategory !== "all" && currentCategory
                    ? `Hiện chưa có đường dẫn nào trong thư mục này. Bạn có thể bấm nút bên dưới để thêm liên kết đầu tiên vào thư mục "${currentCategory.name}".`
                    : "Bắt đầu lưu trữ các đường dẫn link Prompt, tài liệu Word/Docs, Sheets, Drive hữu ích của bạn."}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenAddModal(activeCategory !== "all" ? activeCategory : null)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 16px", fontSize: "12.5px" }}
                  >
                    <Plus size={14} color="#fff" />
                    <span>
                      {activeCategory !== "all" && currentCategory
                        ? `Thêm Link Vào "${currentCategory.name}"`
                        : "Thêm Liên Kết Ngay"}
                    </span>
                  </button>

                  {activeCategory !== "all" && currentCategory && (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingCatId(currentCategory.id);
                          setEditingCatName(currentCategory.name);
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px", fontSize: "12px" }}
                      >
                        <Edit3 size={13} color="#c084fc" />
                        <span>Sửa Tên Thư Mục</span>
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => handleDeleteCategory(currentCategory.id, currentCategory.name, e)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px", fontSize: "12px", color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" }}
                      >
                        <Trash2 size={13} />
                        <span>Xóa Thư Mục</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : viewMode === "grid" ? (
              /* GRID VIEW */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px", paddingBottom: "16px" }}>
                {filteredResources.map((item) => {
                  const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.website;
                  const IconComp = typeCfg.icon;
                  const isCopied = copiedId === item.id;
                  const isSelected = selectedIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      style={{
                        background: isSelected ? "rgba(139, 92, 246, 0.08)" : "var(--card-bg, #12131f)",
                        borderRadius: "10px",
                        border: isSelected
                          ? "1.5px solid var(--accent-primary, #8b5cf6)"
                          : item.pinned
                          ? "1px solid rgba(245, 158, 11, 0.4)"
                          : "1px solid var(--border-color)",
                        boxShadow: isSelected
                          ? "0 0 16px rgba(139, 92, 246, 0.28)"
                          : item.pinned
                          ? "0 4px 16px rgba(245, 158, 11, 0.08)"
                          : "0 3px 12px rgba(0, 0, 0, 0.18)",
                        display: "flex",
                        flexDirection: "column",
                        padding: "11px 12px",
                        position: "relative",
                        transition: "transform 0.15s ease, border-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.borderColor = item.pinned ? "rgba(245, 158, 11, 0.4)" : "var(--border-color)";
                      }}
                    >
                      {/* Image Thumbnail Banner (Representative Image) */}
                      {item.image_url ? (
                        <div style={{ position: "relative", width: "100%", height: "105px", borderRadius: "7px", overflow: "hidden", marginBottom: "8px", background: "rgba(0, 0, 0, 0.45)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <img
                            src={item.image_url}
                            alt={item.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.25s ease" }}
                            onError={(e) => { e.target.style.display = "none"; }}
                            onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
                            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                          />

                          {/* Checkbox overlay in top-left */}
                          <div
                            onClick={(e) => toggleSelectResource(item.id, e)}
                            style={{
                              position: "absolute",
                              top: "7px",
                              left: "7px",
                              zIndex: 4,
                              background: isSelected ? "#8b5cf6" : "rgba(10, 11, 20, 0.75)",
                              border: isSelected ? "1px solid #c084fc" : "1px solid rgba(255, 255, 255, 0.4)",
                              borderRadius: "5px",
                              width: "22px",
                              height: "22px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              backdropFilter: "blur(6px)",
                              transition: "all 0.15s ease"
                            }}
                            title={isSelected ? "Bỏ chọn" : "Tích chọn"}
                          >
                            {isSelected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                          </div>

                          {/* Overlay Type Pill in top-left (shifted right to left: 34px) */}
                          <div style={{ position: "absolute", top: "7px", left: "34px", display: "flex", gap: "4px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background: "rgba(10, 11, 20, 0.8)",
                                backdropFilter: "blur(8px)",
                                color: typeCfg.color,
                                border: `1px solid ${typeCfg.color}55`
                              }}
                            >
                              <IconComp size={12} color={typeCfg.color} />
                              {typeCfg.label}
                            </span>
                          </div>

                          {/* Star button in top-right */}
                          <div style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(10, 11, 20, 0.8)", backdropFilter: "blur(8px)", borderRadius: "6px", padding: "1px" }}>
                            <button
                              className="icon-btn"
                              onClick={(e) => handleToggleFavorite(item.id, e)}
                              title={item.is_favorite ? "Bỏ yêu thích" : "Đánh dấu yêu thích"}
                              style={{ padding: "4px", color: item.is_favorite ? "#fbbf24" : "rgba(255,255,255,0.7)" }}
                            >
                              <Star size={14} fill={item.is_favorite ? "#fbbf24" : "none"} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Top Row: Checkbox + Type Badge + Category + Favorite Pin (When no image) */
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div
                              onClick={(e) => toggleSelectResource(item.id, e)}
                              style={{
                                background: isSelected ? "#8b5cf6" : "rgba(255, 255, 255, 0.05)",
                                border: isSelected ? "1px solid #c084fc" : "1px solid rgba(255, 255, 255, 0.25)",
                                borderRadius: "5px",
                                width: "20px",
                                height: "20px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                flexShrink: 0,
                                transition: "all 0.15s ease"
                              }}
                              title={isSelected ? "Bỏ chọn" : "Tích chọn"}
                            >
                              {isSelected ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                            </div>

                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background: typeCfg.bg,
                                color: typeCfg.color,
                                border: `1px solid ${typeCfg.color}33`
                              }}
                            >
                              <IconComp size={12} color={typeCfg.color} />
                              {typeCfg.label}
                            </span>

                            {item.category_name && (
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "2px 7px", borderRadius: "6px" }}>
                                {item.category_name}
                              </span>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                            <button
                              className="icon-btn"
                              onClick={(e) => handleToggleFavorite(item.id, e)}
                              title={item.is_favorite ? "Bỏ yêu thích" : "Đánh dấu yêu thích"}
                              style={{ padding: "4px", color: item.is_favorite ? "#fbbf24" : "var(--text-muted)" }}
                            >
                              <Star size={15} fill={item.is_favorite ? "#fbbf24" : "none"} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Category Tag under image (if image exists) */}
                      {item.image_url && item.category_name && (
                        <div style={{ marginBottom: "6px" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "2px 7px", borderRadius: "6px" }}>
                            📁 {item.category_name}
                          </span>
                        </div>
                      )}

                      {/* Title */}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: "13.5px",
                          fontWeight: 700,
                          color: "#fff",
                          textDecoration: "none",
                          lineHeight: "1.35",
                          marginBottom: "4px",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden"
                        }}
                        title={item.title}
                        onMouseEnter={(e) => e.target.style.color = "#c084fc"}
                        onMouseLeave={(e) => e.target.style.color = "#fff"}
                      >
                        {item.title}
                      </a>

                      {/* URL Line with Quick Copy */}
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(0, 0, 0, 0.25)", padding: "3px 6px", borderRadius: "5px", marginBottom: "6px" }}>
                        <Globe size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, fontFamily: "monospace" }}>
                          {item.url}
                        </span>
                        <button
                          onClick={(e) => handleCopyLink(item.url, item.id, e)}
                          title="Sao chép liên kết"
                          style={{
                            background: isCopied ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.06)",
                            border: "none",
                            borderRadius: "4px",
                            padding: "2px 5px",
                            color: isCopied ? "#10b981" : "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                            fontSize: "10px"
                          }}
                        >
                          {isCopied ? <Check size={10} /> : <Copy size={10} />}
                          <span>{isCopied ? "Đã chép" : "Copy"}</span>
                        </button>
                      </div>

                      {/* Description (Ghi chú mô tả hoạt động gì) */}
                      <div style={{ flex: 1, marginBottom: "6px" }}>
                        <p style={{
                          margin: 0,
                          fontSize: "11.5px",
                          color: "var(--text-secondary)",
                          lineHeight: "1.4",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden"
                        }}>
                          {item.description || <i style={{ color: "var(--text-muted)" }}>Chưa có ghi chú mô tả hoạt động của link này.</i>}
                        </p>
                      </div>

                      {/* Tags */}
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginBottom: "6px" }}>
                          {item.tags.map((t, idx) => (
                            <span
                              key={idx}
                              onClick={() => setSearchQuery(t)}
                              style={{
                                fontSize: "10px",
                                background: "rgba(255, 255, 255, 0.04)",
                                color: "var(--text-muted)",
                                padding: "1px 5px",
                                borderRadius: "4px",
                                cursor: "pointer"
                              }}
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Bottom Footer Actions */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "6px", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        {/* Open Button */}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 8px",
                            fontSize: "11px",
                            textDecoration: "none"
                          }}
                        >
                          <ExternalLink size={11} />
                          <span>Truy cập</span>
                        </a>

                        {/* Edit & Delete */}
                        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <button
                            className="icon-btn"
                            onClick={(e) => handleOpenEditModal(item, e)}
                            title="Chỉnh sửa thông tin link"
                            style={{ padding: "4px" }}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={(e) => handleDeleteResource(item.id, item.title, e)}
                            title="Xóa liên kết"
                            style={{ padding: "4px" }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* LIST VIEW */
              <div style={{ background: "var(--card-bg, #12131f)", borderRadius: "12px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", background: "rgba(255, 255, 255, 0.02)", color: "var(--text-muted)", fontSize: "12px" }}>
                      <th style={{ padding: "12px 12px", width: "36px", textAlign: "center" }}>
                        <div
                          onClick={handleSelectAll}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            color: selectedIds.length > 0 ? "#a855f7" : "var(--text-muted)"
                          }}
                          title={selectedIds.length === filteredResources.length && filteredResources.length > 0 ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                        >
                          {selectedIds.length > 0 && selectedIds.length === filteredResources.length ? (
                            <CheckSquare size={16} color="#a855f7" />
                          ) : (
                            <Square size={16} />
                          )}
                        </div>
                      </th>
                      <th style={{ padding: "12px 6px", width: "32px", textAlign: "center" }}></th>
                      <th style={{ padding: "12px 16px" }}>Tên & Đường dẫn liên kết</th>
                      <th style={{ padding: "12px 16px" }}>Mô tả hoạt động / Ghi chú</th>
                      <th style={{ padding: "12px 16px", width: "120px" }}>Loại</th>
                      <th style={{ padding: "12px 16px", width: "140px" }}>Thư mục</th>
                      <th style={{ padding: "12px 16px", width: "120px", textAlign: "right" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResources.map((item) => {
                      const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.website;
                      const IconComp = typeCfg.icon;
                      const isCopied = copiedId === item.id;
                      const isSelected = selectedIds.includes(item.id);

                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                            background: isSelected ? "rgba(139, 92, 246, 0.08)" : "transparent",
                            transition: "background 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {/* Checkbox Column */}
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <div
                              onClick={(e) => toggleSelectResource(item.id, e)}
                              style={{
                                background: isSelected ? "#8b5cf6" : "rgba(255, 255, 255, 0.05)",
                                border: isSelected ? "1px solid #c084fc" : "1px solid rgba(255, 255, 255, 0.25)",
                                borderRadius: "5px",
                                width: "18px",
                                height: "18px",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "all 0.15s ease"
                              }}
                              title={isSelected ? "Bỏ chọn" : "Tích chọn"}
                            >
                              {isSelected ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                            </div>
                          </td>

                          {/* Star Column */}
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            <button
                              className="icon-btn"
                              onClick={(e) => handleToggleFavorite(item.id, e)}
                              style={{ padding: "2px", color: item.is_favorite ? "#fbbf24" : "var(--text-muted)" }}
                            >
                              <Star size={14} fill={item.is_favorite ? "#fbbf24" : "none"} />
                            </button>
                          </td>

                          {/* Title & URL with Image Thumbnail */}
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt=""
                                  style={{ width: "40px", height: "40px", borderRadius: "6px", objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255, 255, 255, 0.1)" }}
                                  onError={(e) => { e.target.style.display = "none"; }}
                                />
                              ) : (
                                <div style={{ width: "36px", height: "36px", borderRadius: "6px", background: typeCfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <IconComp size={18} color={typeCfg.color} />
                                </div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "#fff", fontWeight: 600, textDecoration: "none", display: "block", marginBottom: "3px" }}
                                >
                                  {item.title}
                                </a>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                                    {item.url}
                                  </span>
                                  <button
                                    onClick={(e) => handleCopyLink(item.url, item.id, e)}
                                    style={{ background: "transparent", border: "none", color: isCopied ? "#10b981" : "var(--text-muted)", cursor: "pointer", padding: "0" }}
                                    title="Copy URL"
                                  >
                                    {isCopied ? <Check size={11} /> : <Copy size={11} />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Description */}
                          <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontSize: "12px", maxWidth: "300px" }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.description || "—"}
                            </div>
                          </td>

                          {/* Type */}
                          <td style={{ padding: "10px 16px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                background: typeCfg.bg,
                                color: typeCfg.color
                              }}
                            >
                              <IconComp size={11} />
                              {typeCfg.label}
                            </span>
                          </td>

                          {/* Category */}
                          <td style={{ padding: "10px 16px", color: "var(--text-muted)", fontSize: "12px" }}>
                            {item.category_name || "Mặc định"}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "10px 16px", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="icon-btn"
                                title="Mở link"
                                style={{ padding: "4px" }}
                              >
                                <ExternalLink size={13} />
                              </a>
                              <button
                                className="icon-btn"
                                onClick={(e) => handleOpenEditModal(item, e)}
                                title="Sửa"
                                style={{ padding: "4px" }}
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                className="icon-btn danger"
                                onClick={(e) => handleDeleteResource(item.id, item.title, e)}
                                title="Xóa"
                                style={{ padding: "4px" }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Thêm / Sửa Liên Kết */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (isBatchScraping) {
              if (window.confirm("Tiến trình quét đa luồng đang chạy. Bạn có chắc muốn dừng và đóng cửa sổ?")) {
                handleStopBatchScrape();
                setIsModalOpen(false);
              }
            } else {
              setIsModalOpen(false);
            }
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: modalMode === "batch" && !editingResource ? "920px" : "560px",
              width: "100%",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              transition: "max-width 0.25s ease"
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Bookmark size={18} color="#a855f7" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                  {editingResource ? "Chỉnh Sửa Liên Kết & Ghi Chú" : "Thêm Liên Kết / Tài Nguyên Mới"}
                </h3>
              </div>
              <button
                className="icon-btn"
                onClick={() => {
                  if (isBatchScraping) {
                    if (window.confirm("Tiến trình quét đa luồng đang chạy. Bạn có chắc muốn dừng và đóng cửa sổ?")) {
                      handleStopBatchScrape();
                      setIsModalOpen(false);
                    }
                  } else {
                    setIsModalOpen(false);
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Mode Switch Tabs (Only when adding new resource) */}
            {!editingResource && (
              <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.2)", padding: "0 16px" }}>
                <button
                  type="button"
                  onClick={() => setModalMode("single")}
                  style={{
                    padding: "9px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: modalMode === "single" ? "2px solid #8b5cf6" : "2px solid transparent",
                    color: modalMode === "single" ? "#fff" : "var(--text-secondary)",
                    fontWeight: modalMode === "single" ? 600 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12.5px"
                  }}
                >
                  <Globe size={14} color={modalMode === "single" ? "#8b5cf6" : "currentColor"} />
                  <span>Thêm Đơn Lẻ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode("batch")}
                  style={{
                    padding: "9px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: modalMode === "batch" ? "2px solid #a855f7" : "2px solid transparent",
                    color: modalMode === "batch" ? "#fff" : "var(--text-secondary)",
                    fontWeight: modalMode === "batch" ? 600 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12.5px"
                  }}
                >
                  <Zap size={14} color={modalMode === "batch" ? "#ec4899" : "currentColor"} />
                  <span>Quét Hàng Loạt Đa Luồng</span>
                  <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "10px", background: "linear-gradient(135deg, #ec4899, #8b5cf6)", color: "#fff", fontWeight: 700, letterSpacing: "0.4px" }}>
                    ⚡ ĐA LUỒNG
                  </span>
                </button>
              </div>
            )}

            {/* Modal Body: Either Batch Scraper or Single Form */}
            {modalMode === "batch" && !editingResource ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "82vh", overflow: "hidden" }}>
                {/* Scrollable Content */}
                <div style={{ padding: "18px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                  
                  {/* Info Banner */}
                  <div style={{
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(236, 72, 153, 0.1))",
                    border: "1px solid rgba(168, 85, 247, 0.25)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px"
                  }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg, #a855f7, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Zap size={15} color="#fff" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                        Quét Liên Kết Đa Luồng Siêu Tốc
                        <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                          Đồng thời 3 - 10 luồng
                        </span>
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px", lineHeight: "1.4" }}>
                        Dán danh sách các link bất kỳ (Website, AI Prompt Hub, Google Docs/Sheets/Drive, YouTube...). Hệ thống sẽ kích hoạt các luồng song song để tự động đọc Tiêu đề, Mô tả, Loại liên kết và Ảnh đại diện trang web.
                      </div>
                    </div>
                  </div>

                  {/* Textarea Input & Action Bar */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>Danh sách đường link (URL)</span>
                        <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={handlePasteClipboard}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "2px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
                          title="Dán nhanh từ clipboard"
                        >
                          <Clipboard size={12} />
                          <span>Dán Clipboard</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleFillSampleUrls}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "2px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", color: "#c084fc" }}
                          title="Dán link mẫu để thử nghiệm"
                        >
                          <Sparkles size={12} />
                          <span>Thử mẫu</span>
                        </button>
                        {batchText && (
                          <button
                            type="button"
                            onClick={() => { setBatchText(""); setBatchItems([]); }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: "2px 8px", fontSize: "11px", color: "#f87171" }}
                          >
                            Xóa trắng
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      rows={4}
                      disabled={isBatchScraping}
                      placeholder={`https://civitai.com/models/...\nhttps://docs.google.com/document/d/...\nhttps://flowgpt.com/...\nhttps://github.com/...\n(Hoặc dán đoạn văn bản có chứa nhiều link)`}
                      value={batchText}
                      onChange={(e) => setBatchText(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontSize: "12.5px",
                        fontFamily: "monospace",
                        background: "rgba(0, 0, 0, 0.35)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "#fff",
                        outline: "none",
                        resize: "vertical",
                        lineHeight: "1.5"
                      }}
                    />

                    {/* Detection Badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", fontSize: "11.5px" }}>
                      <span style={{ color: parsedBatchUrls.length > 0 ? "#10b981" : "var(--text-muted)", fontWeight: 500 }}>
                        {parsedBatchUrls.length > 0
                          ? `✓ Đã phát hiện ${parsedBatchUrls.length} đường link hợp lệ`
                          : "Chưa có đường link nào"}
                        {batchSkipExisting && duplicateCount > 0 && (
                          <span style={{ color: "#f59e0b", marginLeft: "6px" }}>
                            ({duplicateCount} link đã có trong kho sẽ được bỏ qua)
                          </span>
                        )}
                      </span>
                      {targetBatchUrls.length > 0 && (
                        <span style={{ color: "var(--text-secondary)" }}>
                          Sẽ quét: <b style={{ color: "#c084fc" }}>{targetBatchUrls.length}</b> link mới
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Config Row: Category, Concurrency, Tags */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr", gap: "10px", background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    {/* Category Selection */}
                    <div>
                      <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                        Thư mục lưu trữ
                      </label>
                      <select
                        disabled={isBatchScraping}
                        value={batchCategory}
                        onChange={(e) => setBatchCategory(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          fontSize: "12px",
                          background: "var(--card-bg, #12131f)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "6px",
                          color: "#fff"
                        }}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            📁 {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Concurrency Threads */}
                    <div>
                      <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                        Số luồng quét song song
                      </label>
                      <select
                        disabled={isBatchScraping}
                        value={batchConcurrency}
                        onChange={(e) => setBatchConcurrency(Number(e.target.value))}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          fontSize: "12px",
                          background: "var(--card-bg, #12131f)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "6px",
                          color: "#fff"
                        }}
                      >
                        <option value={3}>⚡ 3 luồng (Mượt mà)</option>
                        <option value={5}>🚀 5 luồng (Khuyên dùng)</option>
                        <option value={10}>🔥 10 luồng (Siêu tốc)</option>
                      </select>
                    </div>

                    {/* Default Tags */}
                    <div>
                      <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                        Tags / Nhãn chung
                      </label>
                      <input
                        type="text"
                        disabled={isBatchScraping}
                        placeholder="AI Prompt, Công cụ..."
                        value={batchTags}
                        onChange={(e) => setBatchTags(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontSize: "12px",
                          background: "rgba(255, 255, 255, 0.04)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "6px",
                          color: "#fff",
                          outline: "none"
                        }}
                      />
                    </div>
                  </div>

                  {/* Checkboxes Row */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px", color: "var(--text-secondary)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={batchSkipExisting}
                        onChange={(e) => setBatchSkipExisting(e.target.checked)}
                      />
                      <span>Bỏ qua các link đã có trong kho</span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(batchPinned)}
                        onChange={(e) => setBatchPinned(e.target.checked ? 1 : 0)}
                      />
                      <span>Ghim lên đầu trang</span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(batchFavorite)}
                        onChange={(e) => setBatchFavorite(e.target.checked ? 1 : 0)}
                      />
                      <span>Đánh dấu yêu thích</span>
                    </label>
                  </div>

                  {/* Scrape Trigger & Progress Control Bar */}
                  <div>
                    {!isBatchScraping ? (
                      <button
                        type="button"
                        onClick={handleStartBatchScrape}
                        disabled={targetBatchUrls.length === 0}
                        className="btn btn-primary"
                        style={{
                          width: "100%",
                          padding: "10px",
                          fontSize: "13px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          background: targetBatchUrls.length > 0 ? "linear-gradient(135deg, #8b5cf6, #ec4899)" : "rgba(255, 255, 255, 0.05)",
                          boxShadow: targetBatchUrls.length > 0 ? "0 4px 16px rgba(168, 85, 247, 0.35)" : "none",
                          cursor: targetBatchUrls.length === 0 ? "not-allowed" : "pointer",
                          opacity: targetBatchUrls.length === 0 ? 0.6 : 1
                        }}
                      >
                        <Zap size={16} />
                        <span>Bắt Đầu Quét Đa Luồng ({targetBatchUrls.length} liên kết)</span>
                      </button>
                    ) : (
                      <div style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fff", fontWeight: 600 }}>
                            <RefreshCw size={14} className="spin" color="#c084fc" />
                            <span>Đang quét đa luồng ({batchConcurrency} luồng song song)...</span>
                            <span style={{ color: "var(--text-muted)" }}>
                              {batchScrapeProgress.current} / {batchScrapeProgress.total} ({Math.round((batchScrapeProgress.current / (batchScrapeProgress.total || 1)) * 100)}%)
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}>✓ {batchScrapeProgress.success} thành công</span>
                            {batchScrapeProgress.error > 0 && (
                              <span style={{ fontSize: "11px", color: "#f87171", fontWeight: 600 }}>⚠️ {batchScrapeProgress.error} lỗi</span>
                            )}
                            <button
                              type="button"
                              onClick={handleStopBatchScrape}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "2px 8px", fontSize: "11px", color: "#f87171", borderColor: "rgba(248, 113, 113, 0.4)" }}
                            >
                              <StopCircle size={12} />
                              <span>Dừng quét</span>
                            </button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${(batchScrapeProgress.current / (batchScrapeProgress.total || 1)) * 100}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #8b5cf6, #ec4899)",
                              transition: "width 0.2s ease"
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scraped Results Table / List */}
                  {batchItems.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: 700, color: "#fff" }}>
                          <Layers size={15} color="#c084fc" />
                          <span>Danh Sách Kết Quả Quét ({batchItems.length})</span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                            (Bạn có thể sửa trực tiếp tên liên kết hoặc thể loại bên dưới trước khi lưu)
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const allSelected = batchItems.every(it => it.selected);
                              setBatchItems(prev => prev.map(it => ({ ...it, selected: !allSelected })));
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: "2px 8px", fontSize: "11px" }}
                          >
                            {batchItems.every(it => it.selected) ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                          </button>
                        </div>
                      </div>

                      {/* Items Container */}
                      <div style={{
                        maxHeight: "260px",
                        overflowY: "auto",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        background: "rgba(0,0,0,0.2)"
                      }}>
                        {batchItems.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "32px 52px 1fr 140px 100px 60px",
                              alignItems: "center",
                              gap: "10px",
                              padding: "8px 10px",
                              borderBottom: idx < batchItems.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                              background: item.status === "scraping" ? "rgba(139, 92, 246, 0.08)" : (item.selected ? "transparent" : "rgba(0,0,0,0.2)"),
                              opacity: item.selected ? 1 : 0.6,
                              transition: "background 0.2s ease"
                            }}
                          >
                            {/* Checkbox */}
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: checked } : it));
                                }}
                              />
                            </div>

                            {/* Thumbnail / Image */}
                            <div style={{ width: "48px", height: "34px", borderRadius: "5px", overflow: "hidden", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  onError={(e) => { e.target.style.display = "none"; }}
                                />
                              ) : (
                                <Globe size={18} color="var(--text-muted)" />
                              )}
                            </div>

                            {/* Title & URL (Editable Title) */}
                            <div style={{ minWidth: 0 }}>
                              <input
                                type="text"
                                value={item.title}
                                placeholder="Tiêu đề trang web..."
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, title: val } : it));
                                }}
                                style={{
                                  width: "100%",
                                  padding: "3px 6px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid transparent",
                                  borderRadius: "4px",
                                  color: "#fff",
                                  outline: "none"
                                }}
                                onFocus={(e) => { e.target.style.borderColor = "var(--accent-primary, #8b5cf6)"; e.target.style.background = "rgba(0,0,0,0.3)"; }}
                                onBlur={(e) => { e.target.style.borderColor = "transparent"; e.target.style.background = "rgba(255,255,255,0.04)"; }}
                              />
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", paddingLeft: "6px", marginTop: "2px" }}>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--text-muted)",
                                    textDecoration: "none",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    maxWidth: "280px"
                                  }}
                                  title={item.url}
                                >
                                  {item.url}
                                </a>
                                <ExternalLink size={10} color="var(--text-muted)" />
                              </div>
                            </div>

                            {/* Type Dropdown */}
                            <div>
                              <select
                                value={item.type}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, type: val } : it));
                                }}
                                style={{
                                  width: "100%",
                                  padding: "4px 6px",
                                  fontSize: "11px",
                                  background: "var(--card-bg, #12131f)",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "6px",
                                  color: "#fff"
                                }}
                              >
                                <option value="website">🌐 Website</option>
                                <option value="prompt_hub">🤖 Prompt Hub</option>
                                <option value="doc">📄 Google Docs</option>
                                <option value="sheet">📊 Google Sheets</option>
                                <option value="slide">📽️ Google Slides</option>
                                <option value="drive">📂 Google Drive</option>
                                <option value="pdf">📕 PDF</option>
                                <option value="chatbot">💬 Chatbot AI</option>
                              </select>
                            </div>

                            {/* Status Badge */}
                            <div>
                              {item.status === "pending" && (
                                <span style={{ fontSize: "10.5px", padding: "2px 7px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>
                                  ⏳ Chờ quét
                                </span>
                              )}
                              {item.status === "scraping" && (
                                <span style={{ fontSize: "10.5px", padding: "2px 7px", borderRadius: "10px", background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <RefreshCw size={10} className="spin" /> Đang quét
                                </span>
                              )}
                              {item.status === "done" && (
                                <span style={{ fontSize: "10.5px", padding: "2px 7px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                  <Check size={11} /> Đã lấy tin
                                </span>
                              )}
                              {item.status === "error" && (
                                <span
                                  style={{ fontSize: "10.5px", padding: "2px 7px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.2)", color: "#f87171", cursor: "pointer" }}
                                  title={item.error || "Không thể tải metadata từ link này"}
                                >
                                  ⚠️ Lỗi
                                </span>
                              )}
                            </div>

                            {/* Action Buttons: Retry & Delete */}
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => handleRetrySingleBatchItem(idx)}
                                title="Quét lại link này"
                                style={{ padding: "4px", color: "var(--text-secondary)" }}
                                disabled={item.status === "scraping"}
                              >
                                <RefreshCw size={13} className={item.status === "scraping" ? "spin" : ""} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn danger"
                                onClick={() => {
                                  setBatchItems(prev => prev.filter((_, i) => i !== idx));
                                }}
                                title="Xóa khỏi danh sách"
                                style={{ padding: "4px", color: "#f87171" }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Batch Modal Footer */}
                <div style={{
                  padding: "12px 20px",
                  borderTop: "1px solid var(--border-color)",
                  background: "rgba(0,0,0,0.25)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Đã chọn: <b style={{ color: "#fff" }}>{batchItems.filter(it => it.selected).length}</b> / {batchItems.length} liên kết
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (isBatchScraping) {
                          if (window.confirm("Tiến trình quét đang chạy. Bạn có muốn dừng và đóng?")) {
                            handleStopBatchScrape();
                            setIsModalOpen(false);
                          }
                        } else {
                          setIsModalOpen(false);
                        }
                      }}
                    >
                      Hủy
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAllBatchItems}
                      disabled={isBatchSaving || isBatchScraping || batchItems.filter(it => it.selected).length === 0}
                      className="btn btn-primary btn-sm"
                      style={{
                        padding: "7px 18px",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        boxShadow: "0 4px 12px rgba(139, 92, 246, 0.35)",
                        cursor: (isBatchSaving || isBatchScraping || batchItems.filter(it => it.selected).length === 0) ? "not-allowed" : "pointer"
                      }}
                    >
                      {isBatchSaving ? (
                        <>
                          <RefreshCw size={13} className="spin" />
                          <span>Đang lưu vào kho...</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Lưu Tất Cả ({batchItems.filter(it => it.selected).length}) Vào Kho</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Single Link Form */
              <form onSubmit={handleSaveResource} style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
                {/* URL Input with Auto-Scrape Button */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Đường dẫn liên kết (URL) <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      required
                      placeholder="https://lootprompt.com/# hoặc link Google Docs, Sheets, Drive..."
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: "13px",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "#fff",
                        outline: "none"
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAutoScrape}
                      disabled={isScraping || !formData.url}
                      className="btn btn-secondary btn-sm"
                      style={{ display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap", padding: "8px 12px" }}
                      title="Tự động đọc Tiêu đề, Mô tả và Loại link từ trang web"
                    >
                      <Zap size={13} color="#a855f7" className={isScraping ? "spin" : ""} />
                      <span>{isScraping ? "Đang đọc..." : "Tự động lấy tin"}</span>
                    </button>
                  </div>
                  {scrapeError && (
                    <span style={{ fontSize: "11px", color: "#f87171", marginTop: "4px", display: "block" }}>
                      {scrapeError}
                    </span>
                  )}
                </div>

                {/* Title Input */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Tên / Tiêu đề liên kết <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Prompts by Deniz Akkabak — AI Prompt Database"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "13px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "#fff",
                      outline: "none"
                    }}
                  />
                </div>

                {/* Description Input (Mô tả hoạt động / công dụng) */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Mô tả về đường dẫn hoạt động gì (Ghi chú chi tiết)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Mô tả công dụng: Kho prompt tổng hợp về gì, dùng cho tool nào, lưu ý khi sử dụng, kịch bản nội dung..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "13px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "#fff",
                      outline: "none",
                      resize: "vertical"
                    }}
                  />
                </div>

                {/* 2 Columns: Category & Type */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {/* Category Selection */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                      Thư mục phân loại
                    </label>
                    <select
                      value={formData.category_id}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "12.5px",
                        background: "var(--card-bg, #12131f)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "#fff"
                      }}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          📁 {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Type Selection */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                      Loại liên kết
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "12.5px",
                        background: "var(--card-bg, #12131f)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "#fff"
                      }}
                    >
                      <option value="prompt_hub">🤖 AI Prompt Hub / Thư viện Prompt</option>
                      <option value="doc">📄 Google Docs (Tài liệu Word)</option>
                      <option value="sheet">📊 Google Sheets (Bảng tính Excel)</option>
                      <option value="slide">📽️ Google Slides (Trình chiếu)</option>
                      <option value="drive">📂 Google Drive (Thư mục / Tệp)</option>
                      <option value="pdf">📕 PDF / Tài liệu đọc</option>
                      <option value="chatbot">💬 Chatbot AI / GPTs</option>
                      <option value="website">🌐 Website / Ứng dụng Web</option>
                    </select>
                  </div>
                </div>

                {/* Image URL Input & Preview */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Ảnh đại diện / Banner xem trước (Image URL)
                  </label>
                  <input
                    type="text"
                    placeholder="https://... (Tự động điền khi bấm 'Tự động lấy tin' hoặc dán link ảnh tùy thích)"
                    value={formData.image_url || ""}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "13px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "#fff",
                      outline: "none"
                    }}
                  />
                  {formData.image_url && (
                    <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "10px", background: "rgba(0,0,0,0.3)", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        style={{ width: "68px", height: "42px", objectFit: "cover", borderRadius: "4px" }}
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                      <div>
                        <span style={{ fontSize: "11.5px", color: "#10b981", fontWeight: 600, display: "block" }}>✓ Đã nhận diện ảnh đại diện</span>
                        <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Ảnh này sẽ được làm banner thẻ liên kết</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tags Input */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Tags / Nhãn (cách nhau bởi dấu phẩy)
                  </label>
                  <input
                    type="text"
                    placeholder="AI Prompt, Midjourney, Video, Ẩm thực..."
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "13px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "#fff",
                      outline: "none"
                    }}
                  />
                </div>

                {/* Checkboxes: Pinned & Favorite */}
                <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formData.pinned)}
                      onChange={(e) => setFormData({ ...formData, pinned: e.target.checked ? 1 : 0 })}
                    />
                    <span>Ghim lên đầu trang</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formData.is_favorite)}
                      onChange={(e) => setFormData({ ...formData, is_favorite: e.target.checked ? 1 : 0 })}
                    />
                    <span>Đánh dấu yêu thích</span>
                  </label>
                </div>

                {/* Modal Footer */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ padding: "6px 16px" }}
                  >
                    {editingResource ? "Cập Nhật" : "Lưu Liên Kết"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}


      {/* MODAL: Quản Lý Thư Mục */}
      {isCategoryModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCategoryModalOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "460px", width: "100%", padding: "20px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Folder size={18} color="#8b5cf6" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff" }}>Quản Lý Thư Mục</h3>
              </div>
              <button className="icon-btn" onClick={() => setIsCategoryModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Create New Folder Form */}
            <form onSubmit={handleCreateCategory} style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input
                type="text"
                placeholder="Tên thư mục mới (VD: sẵn prompt đủ loại)..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: "12.5px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  color: "#fff",
                  outline: "none"
                }}
              />
              <button type="submit" className="btn btn-primary btn-sm" style={{ padding: "0 14px" }}>
                Thêm
              </button>
            </form>

            {/* Folder List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "250px", overflowY: "auto" }}>
              {categories.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: "8px",
                    fontSize: "13px"
                  }}
                >
                  {modalEditingCatId === c.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                      <Folder size={15} color={c.color || "#8b5cf6"} />
                      <input
                        type="text"
                        autoFocus
                        value={modalEditingCatName}
                        onChange={(e) => setModalEditingCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleRenameCategory(c.id, modalEditingCatName);
                          } else if (e.key === "Escape") {
                            setModalEditingCatId(null);
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          fontSize: "12.5px",
                          background: "rgba(0, 0, 0, 0.35)",
                          border: "1px solid var(--accent-primary, #8b5cf6)",
                          borderRadius: "6px",
                          color: "#fff",
                          outline: "none"
                        }}
                      />
                      <button
                        className="icon-btn"
                        onClick={() => handleRenameCategory(c.id, modalEditingCatName)}
                        title="Lưu tên"
                        style={{ padding: "4px", color: "#10b981" }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => setModalEditingCatId(null)}
                        title="Hủy"
                        style={{ padding: "4px", color: "var(--text-muted)" }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Folder size={15} color={c.color || "#8b5cf6"} />
                        <span style={{ color: "#fff", fontWeight: 500 }}>{c.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <button
                          className="icon-btn"
                          onClick={() => {
                            setModalEditingCatId(c.id);
                            setModalEditingCatName(c.name);
                          }}
                          title="Đổi tên thư mục"
                          style={{ padding: "4px", color: "var(--text-secondary)" }}
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={(e) => handleDeleteCategory(c.id, c.name, e)}
                          title="Xóa thư mục"
                          style={{ padding: "4px", color: "#f87171" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Batch Toast Notification */}
      {batchToast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: batchToast.type === "info" ? "#1e293b" : "linear-gradient(135deg, #10b981, #059669)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            fontWeight: 500
          }}
        >
          <Check size={16} />
          <span>{batchToast.message}</span>
        </div>
      )}
    </div>
  );
}
