import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import ChannelModal from "./ChannelModal";
import FollowersExtractorModal from "./FollowersExtractorModal";
import ChannelCategoryModal from "./ChannelCategoryModal";
import {
  fetchSocialChannels,
  createSocialChannel,
  updateSocialChannel,
  deleteSocialChannel,
  refreshSocialChannelStats,
  batchDeleteSocialChannels,
  batchUpdateSocialChannelStatus,
  batchUpdateSocialChannels,
  batchRefreshSocialChannels,
  clearChannelNewVideos,
  fetchChannelCategories,
  batchUpdateChannelCategory,
  deleteChannelCategory,
  refreshAllSocialChannels
} from "../api";

export default function ChannelManager({ onOpenChannelScanner, uiScale = "80", setUiScale }) {
  const [channels, setChannels] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    oriented: 0,
    need_orientation: 0,
    total_followers: 0,
    by_platform: {}
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("channel_view_mode") || "table"; // "table" or "grid"
  });

  // Refresh All State
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshAllStatus, setRefreshAllStatus] = useState(null);

  // Category State
  const [categories, setCategories] = useState([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryModalEditingCat, setCategoryModalEditingCat] = useState(null);
  const [categoryModalInitialParentId, setCategoryModalInitialParentId] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [categoryContextMenu, setCategoryContextMenu] = useState(null); // { x, y, category }

  // Phân cấp cây danh mục (Loại danh mục cha -> Danh mục con)
  const { rootCategories, childrenMap } = useMemo(() => {
    const roots = [];
    const children = {};
    (categories || []).forEach((c) => {
      if (!c.parent_id) {
        roots.push(c);
      } else {
        if (!children[c.parent_id]) {
          children[c.parent_id] = [];
        }
        children[c.parent_id].push(c);
      }
    });
    return { rootCategories: roots, childrenMap: children };
  }, [categories]);

  // Tìm danh mục cha hiện tại nếu người dùng chọn 1 danh mục con
  const activeParentCategory = useMemo(() => {
    if (selectedCategory === "all") return null;
    const cat = categories.find((c) => c.id === selectedCategory);
    if (!cat) return null;
    if (!cat.parent_id) return cat; // Chính là parent
    return categories.find((c) => c.id === cat.parent_id) || null;
  }, [selectedCategory, categories]);

  const loadCategories = async () => {
    try {
      const res = await fetchChannelCategories();
      if (res) {
        setCategories(res || []);
      }
    } catch (err) {
      console.error("Lỗi khi tải danh mục kênh:", err);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Category action handlers: Thêm, Sửa, Xóa
  const handleOpenAddCategory = () => {
    setCategoryContextMenu(null);
    setCategoryModalEditingCat(null);
    setCategoryModalInitialParentId("");
    setIsCategoryModalOpen(true);
  };

  const handleOpenAddSubCategory = (parentCat, e) => {
    if (e) e.stopPropagation();
    setCategoryContextMenu(null);
    setCategoryModalEditingCat(null);
    setCategoryModalInitialParentId(parentCat.id);
    setIsCategoryModalOpen(true);
  };

  const handleOpenEditCategory = (cat, e) => {
    if (e) e.stopPropagation();
    setCategoryContextMenu(null);
    setCategoryModalEditingCat(cat);
    setCategoryModalInitialParentId("");
    setIsCategoryModalOpen(true);
  };

  const handleRequestDeleteCategory = (cat, e) => {
    if (e) e.stopPropagation();
    setCategoryContextMenu(null);
    setCategoryToDelete(cat);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      setIsDeletingCategory(true);
      await deleteChannelCategory(categoryToDelete.id);
      if (selectedCategory === categoryToDelete.id) {
        setSelectedCategory("all");
      }
      setCategoryToDelete(null);
      await loadCategories();
      await loadChannels();
    } catch (err) {
      alert("Lỗi khi xóa danh mục: " + (err.message || err));
    } finally {
      setIsDeletingCategory(false);
    }
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => setCategoryContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Tỷ lệ hiển thị đồng bộ toàn hệ thống (mặc định 80% - giảm 20%)
  const handleScaleChange = (val) => {
    if (setUiScale) {
      setUiScale(val);
    }
    localStorage.setItem("ui_scale", val);
    if (val && val !== "100") {
      document.documentElement.style.zoom = `${val}%`;
    } else {
      document.documentElement.style.zoom = "";
    }
  };

  // Selection State
  const [selectedIds, setSelectedIds] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [followersModalChannel, setFollowersModalChannel] = useState(null);

  // Batch Edit Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchFormData, setBatchFormData] = useState({
    status: "",
    email: "",
    orientation: ""
  });

  // Refreshing State per channel & batch refreshing
  const [refreshingIds, setRefreshingIds] = useState(new Set());
  const [isBatchRefreshing, setIsBatchRefreshing] = useState(false);

  // Ref for indeterminate checkbox
  const headerCheckboxRef = useRef(null);

  const loadChannels = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetchSocialChannels({
        platform: selectedPlatform,
        status: selectedStatus,
        category_id: selectedCategory,
        search: searchQuery
      });
      if (res) {
        setChannels(res.channels || []);
        setStats(res.stats || {
          total: 0,
          oriented: 0,
          need_orientation: 0,
          total_followers: 0,
          by_platform: {}
        });
      }
    } catch (err) {
      setError(err.message || "Không thể tải danh sách kênh mạng xã hội");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [selectedPlatform, selectedStatus, selectedCategory]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadChannels();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync indeterminate state of select-all checkbox
  const isAllSelected = channels.length > 0 && selectedIds.length === channels.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < channels.length;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected, isAllSelected]);

  const handleToggleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("channel_view_mode", mode);
  };

  // Selection Handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(channels.map((c) => c.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  // Modal Handlers
  const handleOpenCreateModal = () => {
    setEditingChannel(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ch) => {
    setEditingChannel(ch);
    setIsModalOpen(true);
  };

  const handleSaveChannel = async (formData) => {
    try {
      if (editingChannel) {
        await updateSocialChannel(editingChannel.id, formData);
      } else {
        await createSocialChannel(formData);
      }
      setIsModalOpen(false);
      setEditingChannel(null);
      await loadChannels();
    } catch (err) {
      alert("Lỗi khi lưu kênh: " + err.message);
    }
  };

  const handleDeleteChannel = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa kênh "${name}" khỏi hệ thống?`)) {
      return;
    }
    try {
      await deleteSocialChannel(id);
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      await loadChannels();
    } catch (err) {
      alert("Lỗi khi xóa kênh: " + err.message);
    }
  };

  const handleRefreshStats = async (id) => {
    try {
      setRefreshingIds((prev) => new Set(prev).add(id));
      await refreshSocialChannelStats(id);
      await loadChannels();
    } catch (err) {
      alert("Lỗi làm mới số liệu: " + err.message);
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleScanChannelAction = async (ch) => {
    if (!ch) return;
    if (ch.has_new_videos) {
      try {
        await clearChannelNewVideos(ch.id);
        setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, has_new_videos: 0, new_videos_count: 0 } : c));
      } catch (e) {}
    }
    if (onOpenChannelScanner) {
      onOpenChannelScanner(ch.url || ch.handle, ch.platform || "douyin");
    }
  };

  // Batch Operations
  const handleBatchStatusChange = async (status) => {
    if (!status) return;
    try {
      await batchUpdateSocialChannelStatus(selectedIds, status);
      await loadChannels();
      setSelectedIds([]);
    } catch (err) {
      alert("Lỗi cập nhật trạng thái hàng loạt: " + err.message);
    }
  };

  const handleBatchCategoryChange = async (catId) => {
    if (!catId || selectedIds.length === 0) return;
    try {
      await batchUpdateChannelCategory(selectedIds, catId);
      await loadChannels();
      await loadCategories();
      setSelectedIds([]);
    } catch (err) {
      alert("Lỗi khi chuyển danh mục hàng loạt: " + err.message);
    }
  };

  const handleBatchRefresh = async () => {
    if (selectedIds.length === 0) return;
    try {
      setIsBatchRefreshing(true);
      const res = await batchRefreshSocialChannels(selectedIds);
      await loadChannels();
      const count = res?.refreshed_count ?? selectedIds.length;
      alert(`Đã làm mới số liệu cho ${count} kênh thành công!`);
    } catch (err) {
      alert("Lỗi làm mới số liệu hàng loạt: " + err.message);
    } finally {
      setIsBatchRefreshing(false);
    }
  };

  const handleRefreshAllChannels = async () => {
    try {
      setIsRefreshingAll(true);
      setRefreshAllStatus({ loading: true, message: `Đang cào & cập nhật số liệu mới nhất cho toàn bộ ${channels.length} kênh mạng xã hội...` });
      const res = await refreshAllSocialChannels();
      await loadChannels();
      const count = res?.refreshed_count ?? channels.length;
      const newVids = res?.new_videos_found ?? 0;
      setRefreshAllStatus({
        success: true,
        message: `Đã làm mới số liệu cho ${count}/${res?.target_channels || channels.length} kênh thành công!${newVids > 0 ? ` (🔥 Phát hiện ${newVids} kênh có video mới!)` : ""}`
      });
      setTimeout(() => setRefreshAllStatus(null), 6000);
    } catch (err) {
      setRefreshAllStatus({
        error: true,
        message: "Lỗi làm mới số liệu toàn bộ kênh: " + err.message
      });
      setTimeout(() => setRefreshAllStatus(null), 7000);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} kênh đã chọn khỏi hệ thống? Hành động này không thể hoàn tác.`)) {
      return;
    }
    try {
      await batchDeleteSocialChannels(selectedIds);
      setSelectedIds([]);
      await loadChannels();
    } catch (err) {
      alert("Lỗi khi xóa hàng loạt kênh: " + err.message);
    }
  };

  const handleOpenBatchModal = () => {
    setBatchFormData({
      status: "",
      email: "",
      orientation: ""
    });
    setIsBatchModalOpen(true);
  };

  const handleSaveBatchModal = async (e) => {
    e.preventDefault();
    const updatePayload = {};
    if (batchFormData.status) updatePayload.status = batchFormData.status;
    if (batchFormData.email.trim()) updatePayload.email = batchFormData.email.trim();
    if (batchFormData.orientation.trim()) updatePayload.orientation = batchFormData.orientation.trim();

    if (Object.keys(updatePayload).length === 0) {
      alert("Vui lòng nhập ít nhất một thông tin cần cập nhật!");
      return;
    }

    try {
      await batchUpdateSocialChannels(selectedIds, updatePayload);
      setIsBatchModalOpen(false);
      setSelectedIds([]);
      await loadChannels();
    } catch (err) {
      alert("Lỗi cập nhật hàng loạt: " + err.message);
    }
  };

  const formatNumber = (num) => {
    if (!num || isNaN(num)) return "0";
    const n = Number(num);
    if (n >= 1000000) {
      return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    if (n >= 1000) {
      return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    }
    return n.toLocaleString("vi-VN");
  };

  const getPlatformBadge = (platform) => {
    const p = (platform || "other").toLowerCase();
    switch (p) {
      case "youtube":
        return {
          label: "YouTube",
          icon: "youtube",
          bg: "rgba(255, 0, 0, 0.12)",
          color: "#ff4b4b",
          border: "rgba(255, 0, 0, 0.3)"
        };
      case "tiktok":
        return {
          label: "TikTok",
          icon: "tiktok",
          bg: "rgba(0, 242, 254, 0.12)",
          color: "#00f2fe",
          border: "rgba(0, 242, 254, 0.3)"
        };
      case "instagram":
        return {
          label: "Instagram",
          icon: "instagram",
          bg: "rgba(225, 48, 108, 0.12)",
          color: "#f43f5e",
          border: "rgba(225, 48, 108, 0.3)"
        };
      case "facebook":
        return {
          label: "Facebook",
          icon: "facebook",
          bg: "rgba(24, 119, 242, 0.12)",
          color: "#3b82f6",
          border: "rgba(24, 119, 242, 0.3)"
        };
      case "x":
        return {
          label: "X",
          icon: "xTwitter",
          bg: "rgba(255, 255, 255, 0.08)",
          color: "#e2e8f0",
          border: "rgba(255, 255, 255, 0.2)"
        };
      case "douyin":
        return {
          label: "Douyin",
          icon: "tiktok",
          bg: "rgba(255, 0, 80, 0.12)",
          color: "#ff0050",
          border: "rgba(255, 0, 80, 0.3)"
        };
      default:
        return {
          label: "Khác",
          icon: "globe",
          bg: "rgba(139, 92, 246, 0.12)",
          color: "#a855f7",
          border: "rgba(139, 92, 246, 0.3)"
        };
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "active":
        return {
          label: "Đã có định hướng",
          bg: "rgba(16, 185, 129, 0.15)",
          color: "#10b981",
          border: "rgba(16, 185, 129, 0.3)",
          dot: "#10b981"
        };
      case "need_orientation":
        return {
          label: "Cần định hướng",
          bg: "rgba(245, 158, 11, 0.15)",
          color: "#f59e0b",
          border: "rgba(245, 158, 11, 0.3)",
          dot: "#f59e0b"
        };
      case "planning":
        return {
          label: "Cần lên kế hoạch",
          bg: "rgba(59, 130, 246, 0.15)",
          color: "#3b82f6",
          border: "rgba(59, 130, 246, 0.3)",
          dot: "#3b82f6"
        };
      case "paused":
        return {
          label: "Tạm dừng",
          bg: "rgba(148, 163, 184, 0.15)",
          color: "#94a3b8",
          border: "rgba(148, 163, 184, 0.3)",
          dot: "#94a3b8"
        };
      default:
        return {
          label: "Chưa phân loại",
          bg: "rgba(255, 255, 255, 0.08)",
          color: "#cbd5e1",
          border: "rgba(255, 255, 255, 0.15)",
          dot: "#cbd5e1"
        };
    }
  };

  const platformsList = [
    { id: "all", label: "Tất cả", icon: "grid" },
    { id: "youtube", label: "YouTube", icon: "youtube" },
    { id: "tiktok", label: "TikTok", icon: "tiktok" },
    { id: "instagram", label: "Instagram", icon: "instagram" },
    { id: "facebook", label: "Facebook", icon: "facebook" },
    { id: "x", label: "X / Twitter", icon: "xTwitter" },
    { id: "douyin", label: "Douyin", icon: "tiktok" },
  ];

  return (
    <div 
      className="main-content-view channel-manager-view" 
      style={{ 
        flex: 1,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: "12px 18px", 
        overflowY: "auto",
        overflowX: "hidden"
      }}
    >
      
      {/* 1. Header Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
            <div style={{ 
              width: "28px", 
              height: "28px", 
              borderRadius: "8px", 
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              color: "#fff",
              boxShadow: "0 2px 8px rgba(139, 92, 246, 0.3)",
              flexShrink: 0
            }}>
              <Icon name="users" size={15} />
            </div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Bảng Quản Lý Hệ Thống Kênh Mạng Xã Hội
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)" }}>
            Theo dõi số liệu tăng trưởng, định hướng nội dung & tài khoản quản trị đa nền tảng
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {/* Zoom / Scale Selector for Channel Manager */}
          <div 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "5px", 
              background: "var(--bg-surface)", 
              padding: "3px 8px", 
              borderRadius: "8px", 
              border: "1px solid var(--border-color)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)"
            }}
            title="Thu nhỏ / Phóng to giao diện toàn hệ thống (giảm 20-30%)"
          >
            <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "3px" }}>
              🔍 Tỷ lệ:
            </span>
            <select
              value={uiScale || "80"}
              onChange={(e) => handleScaleChange(e.target.value)}
              style={{
                fontSize: "11px",
                fontWeight: "600",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "5px",
                padding: "2px 6px",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="70">70% (-30% Siêu gọn)</option>
              <option value="75">75% (-25% Rất vừa)</option>
              <option value="80">80% (-20% Khuyên dùng)</option>
              <option value="85">85% (-15%)</option>
              <option value="90">90% (-10%)</option>
              <option value="100">100% (Gốc 1:1)</option>
              <option value="110">110% (+10%)</option>
            </select>
          </div>

          {/* Nút Làm Mới Tất Cả Số Liệu */}
          <button
            className="btn btn-secondary"
            onClick={handleRefreshAllChannels}
            disabled={isRefreshingAll}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              padding: "6px 13px", 
              fontSize: "12px", 
              fontWeight: "600",
              background: "linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(14, 165, 233, 0.15))",
              border: "1px solid rgba(6, 182, 212, 0.4)",
              color: "var(--accent-cyan)",
              boxShadow: "0 2px 8px rgba(6, 182, 212, 0.15)",
              cursor: isRefreshingAll ? "not-allowed" : "pointer"
            }}
            title={`Cào & làm mới toàn bộ số liệu (Followers, Likes, Video mới) cho tất cả ${channels.length} kênh`}
          >
            {isRefreshingAll ? (
              <span className="spinner" style={{ width: "13px", height: "13px", borderWidth: "2px", borderColor: "var(--accent-cyan) transparent var(--accent-cyan) transparent" }} />
            ) : (
              <Icon name="refreshCw" size={13} color="var(--accent-cyan)" />
            )}
            <span>{isRefreshingAll ? "Đang Làm Mới..." : "Làm Mới Tất Cả Số Liệu"}</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleOpenAddCategory}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              padding: "6px 12px", 
              fontSize: "12px", 
              fontWeight: "600",
              background: "rgba(139, 92, 246, 0.12)",
              border: "1px solid rgba(139, 92, 246, 0.35)",
              color: "var(--accent-secondary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
            }}
            title="Quản lý và thiết lập danh mục phân cấp cho hệ thống kênh"
          >
            <Icon name="folder" size={14} />
            <span>Quản Lý Danh Mục</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={handleOpenCreateModal}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              padding: "6px 14px", 
              fontSize: "12px", 
              fontWeight: "600",
              boxShadow: "0 3px 10px rgba(139, 92, 246, 0.35)"
            }}
          >
            <Icon name="plus" size={14} />
            <span>Thêm Kênh Mới</span>
          </button>
        </div>
      </div>

      {/* Live Refresh Status Banner */}
      {refreshAllStatus && (
        <div style={{
          marginBottom: "12px",
          padding: "8px 14px",
          borderRadius: "8px",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: refreshAllStatus.error ? "rgba(239, 68, 68, 0.15)" : refreshAllStatus.loading ? "rgba(6, 182, 212, 0.15)" : "rgba(16, 185, 129, 0.15)",
          border: `1px solid ${refreshAllStatus.error ? "rgba(239, 68, 68, 0.4)" : refreshAllStatus.loading ? "rgba(6, 182, 212, 0.4)" : "rgba(16, 185, 129, 0.4)"}`,
          color: refreshAllStatus.error ? "#fca5a5" : refreshAllStatus.loading ? "#67e8f9" : "#6ee7b7",
          boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
          transition: "all 0.2s ease"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {refreshAllStatus.loading ? (
              <span className="spinner" style={{ width: "13px", height: "13px", borderWidth: "2px", borderColor: "#67e8f9 transparent #67e8f9 transparent" }} />
            ) : refreshAllStatus.error ? (
              <Icon name="alertCircle" size={15} />
            ) : (
              <Icon name="checkCircle" size={15} />
            )}
            <span style={{ fontWeight: "500" }}>{refreshAllStatus.message}</span>
          </div>
          <button 
            onClick={() => setRefreshAllStatus(null)} 
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "2px 4px", opacity: 0.7 }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {/* 2. KPI Summary Cards (100% Responsive Grid) */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", 
        gap: "8px", 
        marginBottom: "12px",
        width: "100%",
        boxSizing: "border-box"
      }}>
        {/* Card 1: Tổng số kênh */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid var(--border-color)", 
          borderRadius: "8px", 
          padding: "8px 12px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.03em" }}>
              Tổng Số Kênh
            </span>
            <div style={{ padding: "4px", borderRadius: "5px", background: "rgba(139, 92, 246, 0.12)", color: "var(--accent-primary)" }}>
              <Icon name="grid" size={13} />
            </div>
          </div>
          <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-primary)", lineHeight: 1 }}>
            {stats.total || 0}
          </div>
          <div style={{ marginTop: "3px", fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Toàn bộ các nền tảng MXH
          </div>
        </div>

        {/* Card 2: Đã có định hướng */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid rgba(16, 185, 129, 0.3)", 
          borderRadius: "8px", 
          padding: "8px 12px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: "600", textTransform: "uppercase", color: "#10b981", letterSpacing: "0.03em" }}>
              Đã Có Định Hướng
            </span>
            <div style={{ padding: "4px", borderRadius: "5px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
              <Icon name="checkCircle" size={13} />
            </div>
          </div>
          <div style={{ fontSize: "18px", fontWeight: "800", color: "#10b981", lineHeight: 1 }}>
            {stats.oriented || 0}
          </div>
          <div style={{ marginTop: "3px", fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Đã xác định chủ đề & tệp khán giả
          </div>
        </div>

        {/* Card 3: Cần lên kế hoạch */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid rgba(245, 158, 11, 0.3)", 
          borderRadius: "8px", 
          padding: "8px 12px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: "600", textTransform: "uppercase", color: "#f59e0b", letterSpacing: "0.03em" }}>
              Cần Lên Kế Hoạch
            </span>
            <div style={{ padding: "4px", borderRadius: "5px", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
              <Icon name="calendar" size={13} />
            </div>
          </div>
          <div style={{ fontSize: "18px", fontWeight: "800", color: "#f59e0b", lineHeight: 1 }}>
            {stats.need_orientation || 0}
          </div>
          <div style={{ marginTop: "3px", fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Cần xây dựng kịch bản & định hướng
          </div>
        </div>

        {/* Card 4: Tổng quy mô người theo dõi */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid var(--border-color)", 
          borderRadius: "8px", 
          padding: "8px 12px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.03em" }}>
              Quy Mô Người Theo Dõi
            </span>
            <div style={{ padding: "4px", borderRadius: "5px", background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}>
              <Icon name="users" size={13} />
            </div>
          </div>
          <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-primary)", lineHeight: 1 }}>
            {formatNumber(stats.total_followers || 0)}
          </div>
          <div style={{ marginTop: "3px", fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Followers toàn hệ thống
          </div>
        </div>
      </div>

      {/* 2.5. Channel Category Navigation Bar (Phân Cấp Loại Danh Mục Cha - Con) */}
      <div 
        style={{ 
          background: "var(--bg-surface)",
          border: "1px solid var(--border-color)",
          borderRadius: "10px",
          padding: "8px 12px",
          marginBottom: "10px",
          width: "100%",
          boxSizing: "border-box"
        }}
      >
        {/* Row 1: Root Categories */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap", minWidth: 0, flex: "1 1 auto" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.04em", marginRight: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              <Icon name="folder" size={12} color="var(--accent-primary)" />
              <span>Danh mục:</span>
            </span>

            {/* "Tất cả" Pill */}
            <button
              onClick={() => setSelectedCategory("all")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: selectedCategory === "all" ? "700" : "500",
                border: selectedCategory === "all" ? "1px solid var(--accent-primary)" : "1px solid transparent",
                cursor: "pointer",
                background: selectedCategory === "all" ? "linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.2))" : "rgba(255, 255, 255, 0.03)",
                color: selectedCategory === "all" ? "#ffffff" : "var(--text-secondary)",
                transition: "all 0.15s ease"
              }}
            >
              <Icon name="grid" size={11} color={selectedCategory === "all" ? "var(--accent-primary)" : "currentColor"} />
              <span>Tất cả</span>
              <span style={{
                fontSize: "9.5px",
                padding: "0 5px",
                borderRadius: "8px",
                background: selectedCategory === "all" ? "var(--accent-primary)" : "rgba(255, 255, 255, 0.08)",
                color: "#fff"
              }}>
                {stats.total || channels.length}
              </span>
            </button>

            {/* Root Category Pills */}
            {rootCategories.map((root) => {
              const isSelected = selectedCategory === root.id || (activeParentCategory && activeParentCategory.id === root.id);
              const subs = childrenMap[root.id] || [];
              const catColor = root.color || "#8b5cf6";

              return (
                <div
                  key={root.id}
                  style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: root });
                  }}
                >
                  <button
                    onClick={() => setSelectedCategory(root.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 8px 4px 10px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: isSelected ? "700" : "500",
                      border: isSelected ? `1px solid ${catColor}` : "1px solid transparent",
                      cursor: "pointer",
                      background: isSelected ? `${catColor}25` : "rgba(255, 255, 255, 0.03)",
                      color: isSelected ? "#ffffff" : "var(--text-secondary)",
                      transition: "all 0.15s ease"
                    }}
                    title={`Loại danh mục: ${root.name} (${root.count || 0} kênh${subs.length > 0 ? `, ${subs.length} mục con` : ""}) • Click phải để mở menu thao tác`}
                  >
                    <Icon name={root.icon || "folder"} size={11} color={isSelected ? catColor : "currentColor"} />
                    <span>{root.name}</span>
                    <span style={{
                      fontSize: "9.5px",
                      padding: "0 5px",
                      borderRadius: "8px",
                      background: isSelected ? catColor : "rgba(255, 255, 255, 0.08)",
                      color: "#fff"
                    }}>
                      {root.count || 0}
                    </span>
                    {subs.length > 0 && (
                      <span style={{ fontSize: "9px", opacity: 0.6 }}>▾</span>
                    )}

                    {/* Quick action buttons on Root Pill */}
                    <span 
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                        marginLeft: "4px",
                        paddingLeft: "4px",
                        borderLeft: "1px solid rgba(255, 255, 255, 0.12)"
                      }}
                    >
                      <span
                        onClick={(e) => handleOpenAddSubCategory(root, e)}
                        title={`Thêm danh mục con cho "${root.name}"`}
                        style={{
                          padding: "1px 3px",
                          borderRadius: "3px",
                          cursor: "pointer",
                          color: "var(--accent-secondary)",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                      >
                        <Icon name="plus" size={9} />
                      </span>
                      <span
                        onClick={(e) => handleOpenEditCategory(root, e)}
                        title={`Sửa danh mục "${root.name}"`}
                        style={{
                          padding: "1px 3px",
                          borderRadius: "3px",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#fff"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                      >
                        <Icon name="edit" size={9} />
                      </span>
                      <span
                        onClick={(e) => handleRequestDeleteCategory(root, e)}
                        title={`Xóa danh mục "${root.name}"`}
                        style={{
                          padding: "1px 3px",
                          borderRadius: "3px",
                          cursor: "pointer",
                          color: "rgba(248, 113, 113, 0.7)",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "rgba(248, 113, 113, 0.7)"}
                      >
                        <Icon name="trash" size={9} />
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Right Action: Button to open category management modal */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleOpenAddCategory}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: "600",
                color: "var(--accent-secondary)",
                borderColor: "rgba(139, 92, 246, 0.35)",
                background: "rgba(139, 92, 246, 0.1)"
              }}
              title="Thêm danh mục mới hoặc quản lý danh mục phân cấp"
            >
              <Icon name="plus" size={11} />
              <span>+ Thêm danh mục</span>
            </button>
          </div>
        </div>

        {/* Row 2: Subcategories (shown if an active parent has children) */}
        {activeParentCategory && (
          <div
            style={{
              marginTop: "8px",
              paddingTop: "6px",
              borderTop: "1px dashed rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              flexWrap: "wrap",
              paddingLeft: "6px"
            }}
          >
            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px", marginRight: "2px" }}>
              <span>↳</span>
              <span style={{ color: activeParentCategory.color || "var(--accent-primary)", fontWeight: "600" }}>{activeParentCategory.name}:</span>
            </span>

            {/* "Tất cả mục con trong loại này" */}
            <button
              onClick={() => setSelectedCategory(activeParentCategory.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "5px",
                fontSize: "10.5px",
                fontWeight: selectedCategory === activeParentCategory.id ? "700" : "500",
                border: selectedCategory === activeParentCategory.id ? "1px solid var(--accent-primary)" : "1px solid rgba(255, 255, 255, 0.05)",
                background: selectedCategory === activeParentCategory.id ? "rgba(139, 92, 246, 0.2)" : "transparent",
                color: selectedCategory === activeParentCategory.id ? "#fff" : "var(--text-secondary)",
                cursor: "pointer"
              }}
            >
              <span>Tất cả mục con</span>
              <span style={{ fontSize: "9px", opacity: 0.75 }}>({activeParentCategory.count || 0})</span>
            </button>

            {/* Subcategory Pills */}
            {(childrenMap[activeParentCategory.id] || []).map((sub) => {
              const isSubSelected = selectedCategory === sub.id;
              const subColor = sub.color || activeParentCategory.color || "#8b5cf6";

              return (
                <div
                  key={sub.id}
                  style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: sub });
                  }}
                >
                  <button
                    onClick={() => setSelectedCategory(sub.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 6px 2px 8px",
                      borderRadius: "5px",
                      fontSize: "10.5px",
                      fontWeight: isSubSelected ? "700" : "500",
                      border: isSubSelected ? `1px solid ${subColor}` : "1px solid rgba(255, 255, 255, 0.05)",
                      background: isSubSelected ? `${subColor}25` : "rgba(255, 255, 255, 0.02)",
                      color: isSubSelected ? "#ffffff" : "var(--text-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                    title={`Danh mục con: ${sub.name} (thuộc loại ${activeParentCategory.name}) • Click phải để mở menu`}
                  >
                    <Icon name={sub.icon || "folder"} size={10} color={isSubSelected ? subColor : "currentColor"} />
                    <span>{sub.name}</span>
                    <span style={{
                      fontSize: "9px",
                      padding: "0 4px",
                      borderRadius: "6px",
                      background: isSubSelected ? subColor : "rgba(255, 255, 255, 0.06)",
                      color: "#fff"
                    }}>
                      {sub.direct_count || 0}
                    </span>

                    {/* Quick action buttons on Subcategory */}
                    <span 
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                        marginLeft: "3px",
                        paddingLeft: "3px",
                        borderLeft: "1px solid rgba(255, 255, 255, 0.12)"
                      }}
                    >
                      <span
                        onClick={(e) => handleOpenEditCategory(sub, e)}
                        title={`Sửa danh mục con "${sub.name}"`}
                        style={{
                          padding: "1px 2px",
                          borderRadius: "2px",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#fff"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                      >
                        <Icon name="edit" size={8.5} />
                      </span>
                      <span
                        onClick={(e) => handleRequestDeleteCategory(sub, e)}
                        title={`Xóa danh mục con "${sub.name}"`}
                        style={{
                          padding: "1px 2px",
                          borderRadius: "2px",
                          cursor: "pointer",
                          color: "rgba(248, 113, 113, 0.7)",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "rgba(248, 113, 113, 0.7)"}
                      >
                        <Icon name="trash" size={8.5} />
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}

            {/* Quick button to add child under active parent */}
            <button
              onClick={(e) => handleOpenAddSubCategory(activeParentCategory, e)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "2px 7px",
                borderRadius: "5px",
                fontSize: "10.5px",
                fontWeight: "600",
                border: "1px dashed rgba(139, 92, 246, 0.4)",
                background: "rgba(139, 92, 246, 0.08)",
                color: "var(--accent-secondary)",
                cursor: "pointer"
              }}
              title={`Thêm danh mục con mới vào loại "${activeParentCategory.name}"`}
            >
              <Icon name="plus" size={10} />
              <span>Thêm con</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Toolbar: Platform Filter, Status, Search, View Switcher */}
      <div style={{ 
        display: "flex", 
        flexWrap: "wrap", 
        alignItems: "center", 
        justifyContent: "space-between", 
        gap: "8px", 
        marginBottom: "10px",
        background: "var(--bg-surface)",
        padding: "6px 10px",
        borderRadius: "8px",
        border: "1px solid var(--border-color)",
        width: "100%",
        boxSizing: "border-box"
      }}>
        {/* Platform Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "3px", overflowX: "auto", maxWidth: "100%" }}>
          {platformsList.map((p) => {
            const isActive = selectedPlatform === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: isActive ? "600" : "500",
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? "var(--accent-primary)" : "transparent",
                  color: isActive ? "#ffffff" : "var(--text-secondary)",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap"
                }}
              >
                <Icon name={p.icon} size={12} />
                <span>{p.label}</span>
                {stats.by_platform && stats.by_platform[p.id] && (
                  <span style={{ 
                    fontSize: "9px", 
                    padding: "0px 4px", 
                    borderRadius: "8px", 
                    background: isActive ? "rgba(255, 255, 255, 0.25)" : "var(--border-color)" 
                  }}>
                    {stats.by_platform[p.id].count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Controls: Status filter, Search, View Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {/* Status Dropdown */}
          <select
            className="input-field"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ fontSize: "11px", padding: "3px 6px", height: "28px" }}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">🟢 Đã có định hướng</option>
            <option value="need_orientation">🟡 Cần định hướng</option>
            <option value="planning">🔵 Cần lên kế hoạch</option>
            <option value="paused">⚪ Tạm dừng</option>
          </select>

          {/* Search Input */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              className="input-field"
              placeholder="Tìm kiếm kênh, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: "11px", padding: "3px 6px 3px 26px", height: "28px", width: "160px" }}
            />
            <div style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
              <Icon name="search" size={11} />
            </div>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: "flex", background: "var(--bg-input)", borderRadius: "6px", padding: "2px", border: "1px solid var(--border-color)" }}>
            <button
              onClick={() => handleToggleViewMode("table")}
              title="Chế độ Bảng tính (Google Sheet)"
              style={{
                padding: "3px 6px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                background: viewMode === "table" ? "var(--bg-surface)" : "transparent",
                color: viewMode === "table" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: viewMode === "table" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "11px"
              }}
            >
              <Icon name="fileText" size={12} />
              <span>Bảng</span>
            </button>
            <button
              onClick={() => handleToggleViewMode("grid")}
              title="Chế độ Thẻ (Grid Cards)"
              style={{
                padding: "3px 6px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                background: viewMode === "grid" ? "var(--bg-surface)" : "transparent",
                color: viewMode === "grid" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: viewMode === "grid" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "11px"
              }}
            >
              <Icon name="grid" size={12} />
              <span>Thẻ</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Batch Actions Bar (Displayed when 1 or more channels are selected) */}
      {selectedIds.length > 0 && (
        <div
          className="batch-actions-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(139, 92, 246, 0.22), rgba(6, 182, 212, 0.18))",
            border: "1px solid rgba(139, 92, 246, 0.5)",
            borderRadius: "10px",
            padding: "6px 12px",
            marginBottom: "10px",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
            flexWrap: "wrap",
            gap: "8px",
            animation: "fadeIn 0.2s ease"
          }}
        >
          {/* Left: Count & Select All */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "11px",
                padding: "3px 10px",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
            >
              <Icon name="check" size={11} color="#fff" />
              <span>Đã chọn: {selectedIds.length} / {channels.length} kênh</span>
            </span>

            {selectedIds.length < channels.length && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSelectAll}
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  background: "rgba(139, 92, 246, 0.25)",
                  borderColor: "rgba(139, 92, 246, 0.6)",
                  color: "#fff",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                title="Chọn toàn bộ các kênh còn lại trong danh sách"
              >
                <Icon name="check" size={12} color="var(--accent-secondary)" />
                <span>Chọn tất cả ({channels.length})</span>
              </button>
            )}
          </div>

          {/* Right: Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {/* Batch Status Dropdown */}
            <select
              className="input-field"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBatchStatusChange(e.target.value);
                  e.target.value = "";
                }
              }}
              style={{ fontSize: "11.5px", padding: "3px 8px", height: "28px", background: "rgba(16, 18, 29, 0.9)" }}
            >
              <option value="" disabled>Đổi trạng thái ({selectedIds.length})...</option>
              <option value="active">🟢 Đã có định hướng</option>
              <option value="need_orientation">🟡 Cần định hướng</option>
              <option value="planning">🔵 Cần lên kế hoạch</option>
              <option value="paused">⚪ Tạm dừng</option>
            </select>

            {/* Batch Category Dropdown */}
            <select
              className="input-field"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBatchCategoryChange(e.target.value);
                  e.target.value = "";
                }
              }}
              style={{ fontSize: "11.5px", padding: "3px 8px", height: "28px", background: "rgba(16, 18, 29, 0.9)" }}
            >
              <option value="" disabled>Chuyển danh mục ({selectedIds.length})...</option>
              <option value="none">-- Hủy danh mục (Không phân loại) --</option>
              {categories.map((cat) => (
                <React.Fragment key={cat.id}>
                  <option value={cat.id} style={{ fontWeight: "700" }}>
                    📁 {cat.name}
                  </option>
                  {(cat.children || []).map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      &nbsp;&nbsp;&nbsp;&nbsp;↳ {sub.name}
                    </option>
                  ))}
                </React.Fragment>
              ))}
            </select>

            {/* Batch Refresh Stats */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleBatchRefresh}
              disabled={isBatchRefreshing}
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "var(--accent-cyan)",
                borderColor: "rgba(6, 182, 212, 0.4)"
              }}
              title="Cào và cập nhật số liệu mới nhất cho các kênh đã chọn"
            >
              {isBatchRefreshing ? (
                <span className="spinner" style={{ width: "11px", height: "11px", borderWidth: "2px" }} />
              ) : (
                <Icon name="sparkles" size={12} />
              )}
              <span>Làm mới số liệu ({selectedIds.length})</span>
            </button>

            {/* Batch Edit Email & Orientation */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleOpenBatchModal}
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
              title="Gán nhanh Email quản lý hoặc Định hướng nội dung"
            >
              <Icon name="edit" size={12} />
              <span>Gán Email & Định hướng</span>
            </button>

            {/* Batch Delete */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleBatchDelete}
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#f87171",
                borderColor: "rgba(248, 113, 113, 0.4)",
                background: "rgba(239, 68, 68, 0.1)"
              }}
              title="Xóa các kênh đã chọn khỏi hệ thống"
            >
              <Icon name="trash" size={12} />
              <span>Xóa ({selectedIds.length})</span>
            </button>

            {/* Clear Selection */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleClearSelection}
              style={{
                fontSize: "11px",
                padding: "3px 6px",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center"
              }}
              title="Bỏ chọn tất cả"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        </div>
      )}

      {/* 5. Content View: Table or Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
          <span className="spinner" style={{ width: "24px", height: "24px", borderWidth: "3px", margin: "0 auto 12px" }} />
          <p style={{ margin: 0, fontSize: "13px" }}>Đang tải danh sách hệ thống kênh...</p>
        </div>
      ) : channels.length === 0 ? (
        <div style={{ 
          textAlign: "center", 
          padding: "60px 20px", 
          background: "var(--bg-surface)", 
          borderRadius: "12px", 
          border: "1px dashed var(--border-color)" 
        }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(139, 92, 246, 0.12)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Icon name="users" size={24} />
          </div>
          <h4 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "var(--text-primary)" }}>Chưa có kênh nào được thêm</h4>
          <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-secondary)", maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
            Bắt đầu xây dựng hệ thống quản lý kênh mạng xã hội của bạn bằng cách thêm kênh YouTube, TikTok, Instagram đầu tiên.
          </p>
          <button className="btn btn-primary" onClick={handleOpenCreateModal} style={{ gap: "6px", display: "inline-flex", alignItems: "center" }}>
            <Icon name="plus" size={14} />
            <span>Thêm Kênh Đầu Tiên</span>
          </button>
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW (Google Sheet Style with Checkboxes) */
        <div style={{ 
          background: "var(--bg-surface)", 
          borderRadius: "10px", 
          border: "1px solid var(--border-color)", 
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ overflowX: "auto", width: "100%", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "860px", borderCollapse: "collapse", textAlign: "left", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "rgba(22, 25, 41, 0.95)", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                  {/* Select All Checkbox */}
                  <th style={{ padding: "8px 8px", width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      ref={headerCheckboxRef}
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      style={{ cursor: "pointer", width: "14px", height: "14px", accentColor: "var(--accent-primary)" }}
                      title={isAllSelected ? "Bỏ chọn tất cả" : "Chọn tất cả kênh"}
                    />
                  </th>
                  <th style={{ padding: "8px 8px", width: "40px", textAlign: "center", fontWeight: "600" }}>STT</th>
                  <th style={{ padding: "8px 10px", width: "100px", fontWeight: "600" }}>Nền tảng</th>
                  <th style={{ padding: "8px 10px", minWidth: "170px", fontWeight: "600" }}>Kênh / Tác giả</th>
                  <th style={{ padding: "8px 10px", minWidth: "140px", fontWeight: "600" }}>Danh mục</th>
                  <th style={{ padding: "8px 10px", minWidth: "150px", fontWeight: "600" }}>Email quản lý</th>
                  <th style={{ padding: "8px 10px", minWidth: "100px", fontWeight: "600" }}>Link liên kết</th>
                  <th style={{ padding: "8px 10px", minWidth: "180px", fontWeight: "600" }}>Định hướng nội dung</th>
                  <th style={{ padding: "8px 10px", minWidth: "150px", fontWeight: "600" }}>Số liệu tăng trưởng</th>
                  <th style={{ padding: "8px 10px", minWidth: "120px", fontWeight: "600" }}>Trạng thái</th>
                  <th style={{ padding: "8px 10px", width: "95px", textAlign: "center", fontWeight: "600" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch, idx) => {
                  const pBadge = getPlatformBadge(ch.platform);
                  const sBadge = getStatusBadge(ch.status);
                  const isRefreshing = refreshingIds.has(ch.id);
                  const isSelected = selectedIds.includes(ch.id);

                  return (
                    <tr 
                      key={ch.id} 
                      style={{ 
                        borderBottom: "1px solid var(--border-color)", 
                        background: isSelected 
                          ? "rgba(139, 92, 246, 0.12)" 
                          : idx % 2 === 1 ? "rgba(255, 255, 255, 0.015)" : "transparent",
                        transition: "background 0.15s ease"
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "rgba(139, 92, 246, 0.05)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = idx % 2 === 1 ? "rgba(255, 255, 255, 0.015)" : "transparent";
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(ch.id)}
                          style={{ cursor: "pointer", width: "14px", height: "14px", accentColor: "var(--accent-primary)" }}
                        />
                      </td>

                      {/* STT */}
                      <td style={{ padding: "7px 8px", textAlign: "center", color: "var(--text-muted)", fontWeight: "500", fontSize: "11px" }}>
                        {idx + 1}
                      </td>

                      {/* Nền tảng */}
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ 
                          display: "inline-flex", 
                          alignItems: "center", 
                          gap: "4px", 
                          padding: "2px 7px", 
                          borderRadius: "5px", 
                          fontSize: "10.5px", 
                          fontWeight: "600",
                          background: pBadge.bg, 
                          color: pBadge.color, 
                          border: `1px solid ${pBadge.border}` 
                        }}>
                          <Icon name={pBadge.icon} size={11} />
                          <span>{pBadge.label}</span>
                        </span>
                      </td>

                      {/* Kênh / Tác giả */}
                      <td style={{ padding: "7px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {ch.avatar_url ? (
                            <img 
                              src={ch.avatar_url} 
                              alt={ch.name} 
                              style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-color)", flexShrink: 0 }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div style={{ 
                              width: "26px", 
                              height: "26px", 
                              borderRadius: "50%", 
                              background: "rgba(139, 92, 246, 0.15)", 
                              color: "var(--accent-primary)", 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "center",
                              fontWeight: "700",
                              fontSize: "11.5px",
                              flexShrink: 0
                            }}>
                              {(ch.name || "K")[0].toUpperCase()}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: "600", fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {ch.name}
                            </div>
                            {ch.handle && (
                              <div style={{ fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Danh mục */}
                      <td style={{ padding: "7px 10px" }}>
                        {ch.category_name ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategory(ch.category_id);
                            }}
                            title={`Thuộc: ${ch.parent_category_name ? `${ch.parent_category_name} > ${ch.category_name}` : ch.category_name} (Bấm để lọc)`}
                            style={{
                              display: "inline-flex",
                              flexDirection: "column",
                              gap: "2px",
                              cursor: "pointer"
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 7px",
                                borderRadius: "6px",
                                fontSize: "10.5px",
                                fontWeight: "600",
                                background: `${ch.category_color || "#8b5cf6"}18`,
                                color: ch.category_color || "#a78bfa",
                                border: `1px solid ${ch.category_color || "#8b5cf6"}33`,
                                transition: "all 0.15s ease"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = ch.category_color || "#8b5cf6";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = `${ch.category_color || "#8b5cf6"}33`;
                              }}
                            >
                              <Icon name={ch.category_icon || "folder"} size={11} />
                              <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ch.category_name}
                              </span>
                            </span>
                            {ch.parent_category_name && (
                              <span style={{ fontSize: "9px", color: "var(--text-muted)", paddingLeft: "2px" }}>
                                ↳ {ch.parent_category_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span 
                            onClick={() => handleOpenEditModal(ch)}
                            style={{ 
                              fontStyle: "italic", 
                              fontSize: "10.5px", 
                              color: "var(--text-muted)", 
                              cursor: "pointer",
                              opacity: 0.7 
                            }}
                            title="Bấm để chọn danh mục"
                          >
                            + Phân loại
                          </span>
                        )}
                      </td>

                      {/* Email quản lý */}
                      <td style={{ padding: "7px 10px", color: ch.email ? "var(--text-secondary)" : "var(--text-muted)" }}>
                        {ch.email ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ fontSize: "11px" }}>{ch.email}</span>
                          </div>
                        ) : (
                          <span style={{ fontStyle: "italic", fontSize: "10.5px" }}>Chưa cập nhật</span>
                        )}
                      </td>

                      {/* Link liên kết */}
                      <td style={{ padding: "7px 10px" }}>
                        {ch.url ? (
                          <a
                            href={ch.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ 
                              display: "inline-flex", 
                              alignItems: "center", 
                              gap: "3px", 
                              color: "var(--accent-primary)", 
                              textDecoration: "none",
                              fontSize: "11px",
                              fontWeight: "500"
                            }}
                          >
                            <span>Mở link</span>
                            <Icon name="externalLink" size={11} />
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "10.5px" }}>—</span>
                        )}
                      </td>

                      {/* Định hướng nội dung */}
                      <td style={{ padding: "7px 10px" }}>
                        {ch.orientation ? (
                          <span style={{ 
                            display: "inline-block", 
                            background: "rgba(255, 255, 255, 0.04)", 
                            padding: "3px 7px", 
                            borderRadius: "5px", 
                            fontSize: "11px", 
                            color: "var(--text-primary)" 
                          }}>
                            {ch.orientation}
                          </span>
                        ) : (
                          <span style={{ fontStyle: "italic", fontSize: "10.5px", color: "var(--text-muted)" }}>
                            Chưa có định hướng cụ thể
                          </span>
                        )}
                      </td>

                      {/* Số liệu tăng trưởng */}
                      <td style={{ padding: "7px 10px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                          <div 
                            style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", cursor: "pointer" }}
                            onClick={() => setFollowersModalChannel(ch)}
                            title="Bấm để xem & trích xuất danh sách Followers"
                          >
                            <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>{formatNumber(ch.followers_count)}</span>
                            <span style={{ color: "var(--accent-primary)", fontSize: "10px", fontWeight: "600" }}>Followers ↗</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted)", flexWrap: "wrap" }}>
                            {ch.likes_count > 0 && (
                              <span>{formatNumber(ch.likes_count)} Likes</span>
                            )}
                            {ch.posts_count > 0 && (
                              <span>{formatNumber(ch.posts_count)} Video</span>
                            )}
                            {Boolean(ch.has_new_videos) && (
                              <span
                                style={{
                                  background: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                                  color: "#fff",
                                  fontSize: "9px",
                                  fontWeight: "700",
                                  padding: "1px 5px",
                                  borderRadius: "6px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "2px",
                                  boxShadow: "0 2px 5px rgba(239, 68, 68, 0.35)",
                                  cursor: "pointer"
                                }}
                                title="Kênh có video mới đăng! Bấm để quét và tải ngay"
                                onClick={() => handleScanChannelAction(ch)}
                              >
                                🔥 {ch.new_videos_count ? `+${ch.new_videos_count}` : "Mới"}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ 
                          display: "inline-flex", 
                          alignItems: "center", 
                          gap: "5px", 
                          padding: "2px 8px", 
                          borderRadius: "10px", 
                          fontSize: "10.5px", 
                          fontWeight: "600",
                          background: sBadge.bg, 
                          color: sBadge.color, 
                          border: `1px solid ${sBadge.border}` 
                        }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: sBadge.dot }} />
                          <span>{sBadge.label}</span>
                        </span>
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
                          {/* Nút Quét Kênh */}
                          <button
                            className="icon-btn"
                            title="Quét & Tải video kênh (Douyin / TikTok)"
                            onClick={() => handleScanChannelAction(ch)}
                            style={{ padding: "4px", color: "#38bdf8" }}
                          >
                            <Icon name="video" size={13} />
                          </button>

                          {/* Nút Trích xuất Followers */}
                          <button
                            className="icon-btn"
                            title="Trích xuất & Quản lý Followers (Xuất 2 file .txt)"
                            onClick={() => setFollowersModalChannel(ch)}
                            style={{ padding: "4px", color: "#ec4899" }}
                          >
                            <Icon name="users" size={13} />
                          </button>

                          {/* Nút làm mới */}
                          <button
                            className="icon-btn"
                            title="Làm mới số liệu từ URL gốc"
                            onClick={() => handleRefreshStats(ch.id)}
                            disabled={isRefreshing || !ch.url}
                            style={{ padding: "4px", color: "var(--accent-primary)" }}
                          >
                            {isRefreshing ? (
                              <span className="spinner" style={{ width: "11px", height: "11px", borderWidth: "2px" }} />
                            ) : (
                              <Icon name="sparkles" size={13} />
                            )}
                          </button>

                          {/* Nút sửa */}
                          <button
                            className="icon-btn"
                            title="Chỉnh sửa thông tin kênh"
                            onClick={() => handleOpenEditModal(ch)}
                            style={{ padding: "4px", color: "var(--text-secondary)" }}
                          >
                            <Icon name="edit" size={13} />
                          </button>

                          {/* Nút xóa */}
                          <button
                            className="icon-btn"
                            title="Xóa kênh"
                            onClick={() => handleDeleteChannel(ch.id, ch.name)}
                            style={{ padding: "4px", color: "#f87171" }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID CARDS VIEW (Studio OS Cards with Checkboxes) */
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", 
          gap: "10px" 
        }}>
          {channels.map((ch) => {
            const pBadge = getPlatformBadge(ch.platform);
            const sBadge = getStatusBadge(ch.status);
            const isRefreshing = refreshingIds.has(ch.id);
            const isSelected = selectedIds.includes(ch.id);

            return (
              <div
                key={ch.id}
                style={{
                  background: isSelected ? "rgba(139, 92, 246, 0.08)" : "var(--bg-surface)",
                  border: isSelected ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: isSelected ? "0 0 14px rgba(139, 92, 246, 0.25)" : "var(--shadow-sm)",
                  transition: "all 0.15s ease",
                  position: "relative"
                }}
              >
                <div>
                  {/* Top Card: Checkbox, Platform & Status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(ch.id)}
                        style={{ cursor: "pointer", width: "14px", height: "14px", accentColor: "var(--accent-primary)" }}
                      />
                      <span style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        gap: "4px", 
                        padding: "2px 7px", 
                        borderRadius: "5px", 
                        fontSize: "10.5px", 
                        fontWeight: "600",
                        background: pBadge.bg, 
                        color: pBadge.color, 
                        border: `1px solid ${pBadge.border}` 
                      }}>
                        <Icon name={pBadge.icon} size={11} />
                        <span>{pBadge.label}</span>
                      </span>
                    </div>

                    <span style={{ 
                      display: "inline-flex", 
                      alignItems: "center", 
                      gap: "4px", 
                      padding: "2px 7px", 
                      borderRadius: "8px", 
                      fontSize: "10.5px", 
                      fontWeight: "600",
                      background: sBadge.bg, 
                      color: sBadge.color, 
                      border: `1px solid ${sBadge.border}` 
                    }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: sBadge.dot }} />
                      <span>{sBadge.label}</span>
                    </span>
                  </div>

                  {/* Channel Identity */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    {ch.avatar_url ? (
                      <img 
                        src={ch.avatar_url} 
                        alt={ch.name} 
                        style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-color)", flexShrink: 0 }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ 
                        width: "34px", 
                        height: "34px", 
                        borderRadius: "50%", 
                        background: "rgba(139, 92, 246, 0.15)", 
                        color: "var(--accent-primary)", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        fontWeight: "700",
                        fontSize: "14px",
                        flexShrink: 0
                      }}>
                        {(ch.name || "K")[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{ margin: "0 0 2px 0", fontSize: "13px", fontWeight: "700", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ch.name}
                      </h4>
                      {ch.handle && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`}
                        </div>
                      )}
                      {ch.category_name && (
                        <div style={{ marginTop: "3px" }}>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategory(ch.category_id);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: "600",
                              background: `${ch.category_color || "#8b5cf6"}20`,
                              color: ch.category_color || "#a78bfa",
                              border: `1px solid ${ch.category_color || "#8b5cf6"}40`,
                              cursor: "pointer"
                            }}
                            title={`Thuộc: ${ch.parent_category_name ? `${ch.parent_category_name} > ` : ""}${ch.category_name} (Bấm để lọc)`}
                          >
                            <Icon name={ch.category_icon || "folder"} size={10} />
                            <span>{ch.parent_category_name ? `${ch.parent_category_name} > ` : ""}{ch.category_name}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(3, 1fr)", 
                    gap: "6px", 
                    background: "var(--bg-input)", 
                    padding: "7px 8px", 
                    borderRadius: "8px", 
                    border: "1px solid var(--border-color)",
                    marginBottom: "10px",
                    textAlign: "center"
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
                        {formatNumber(ch.followers_count)}
                      </div>
                      <div style={{ fontSize: "9.5px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Followers
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
                        {formatNumber(ch.following_count)}
                      </div>
                      <div style={{ fontSize: "9.5px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Following
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
                        <span>{formatNumber(ch.posts_count || ch.likes_count)}</span>
                        {Boolean(ch.has_new_videos) && (
                          <span
                            style={{
                              background: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                              color: "#fff",
                              fontSize: "8.5px",
                              fontWeight: "700",
                              padding: "1px 4px",
                              borderRadius: "4px",
                              cursor: "pointer"
                            }}
                            title="Có video mới! Bấm để quét"
                            onClick={() => handleScanChannelAction(ch)}
                          >
                            🔥
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "9.5px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        {ch.posts_count ? "Videos" : "Likes"}
                      </div>
                    </div>
                  </div>

                  {/* Orientation Box */}
                  <div style={{ marginBottom: "8px" }}>
                    <span style={{ fontSize: "10.5px", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "3px" }}>
                      Định hướng nội dung:
                    </span>
                    <div style={{ 
                      fontSize: "11px", 
                      color: ch.orientation ? "var(--text-primary)" : "var(--text-muted)",
                      background: "rgba(255, 255, 255, 0.03)",
                      padding: "4px 8px",
                      borderRadius: "5px",
                      lineHeight: "1.4"
                    }}>
                      {ch.orientation || "Chưa có định hướng cụ thể"}
                    </div>
                  </div>

                  {/* Email & Notes */}
                  {ch.email && (
                    <div style={{ fontSize: "10.5px", color: "var(--text-secondary)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ color: "var(--text-muted)" }}>Email:</span>
                      <span>{ch.email}</span>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  paddingTop: "8px", 
                  borderTop: "1px solid var(--border-color)",
                  marginTop: "8px" 
                }}>
                  <div>
                    {ch.url && (
                      <a
                        href={ch.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ 
                          display: "inline-flex", 
                          alignItems: "center", 
                          gap: "3px", 
                          color: "var(--accent-primary)", 
                          textDecoration: "none",
                          fontSize: "11px",
                          fontWeight: "500"
                        }}
                      >
                        <span>Mở kênh</span>
                        <Icon name="externalLink" size={11} />
                      </a>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {/* Nút Quét Kênh */}
                    <button
                      className="icon-btn"
                      title="Quét & Tải video kênh (Douyin / TikTok)"
                      onClick={() => handleScanChannelAction(ch)}
                      style={{ padding: "4px", color: "#38bdf8" }}
                    >
                      <Icon name="video" size={13} />
                    </button>

                    {/* Nút Trích xuất Followers */}
                    <button
                      className="icon-btn"
                      title="Trích xuất & Quản lý Followers (Xuất 2 file .txt)"
                      onClick={() => setFollowersModalChannel(ch)}
                      style={{ padding: "4px", color: "#ec4899" }}
                    >
                      <Icon name="users" size={13} />
                    </button>

                    <button
                      className="icon-btn"
                      title="Làm mới số liệu"
                      onClick={() => handleRefreshStats(ch.id)}
                      disabled={isRefreshing || !ch.url}
                      style={{ padding: "4px", color: "var(--accent-primary)" }}
                    >
                      {isRefreshing ? (
                        <span className="spinner" style={{ width: "11px", height: "11px", borderWidth: "2px" }} />
                      ) : (
                        <Icon name="sparkles" size={13} />
                      )}
                    </button>

                    <button
                      className="icon-btn"
                      title="Sửa"
                      onClick={() => handleOpenEditModal(ch)}
                      style={{ padding: "4px", color: "var(--text-secondary)" }}
                    >
                      <Icon name="edit" size={13} />
                    </button>

                    <button
                      className="icon-btn"
                      title="Xóa"
                      onClick={() => handleDeleteChannel(ch.id, ch.name)}
                      style={{ padding: "4px", color: "#f87171" }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Single Create/Edit Channel Modal */}
      <ChannelModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingChannel(null);
        }}
        channel={editingChannel}
        onSave={handleSaveChannel}
        categories={categories}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
      />

      {/* 6.5 Followers Extractor & Manager Modal */}
      {Boolean(followersModalChannel) && (
        <FollowersExtractorModal
          isOpen={true}
          channel={followersModalChannel}
          onClose={() => setFollowersModalChannel(null)}
          onFollowersUpdated={loadChannels}
        />
      )}

      {/* 7. Batch Edit Modal (Gán Email & Định hướng hàng loạt) */}
      {isBatchModalOpen && createPortal(
        <div 
          className="modal-overlay" 
          onClick={() => setIsBatchModalOpen(false)} 
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
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "16px",
            boxSizing: "border-box"
          }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: "560px", 
              width: "100%",
              borderRadius: "16px",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(139, 92, 246, 0.25)",
              margin: "auto",
              background: "#121422",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              position: "relative"
            }}
          >
            <div className="modal-header" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.15)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="edit" size={16} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "600", color: "var(--text-primary)" }}>
                    Cập Nhật Hàng Loạt ({selectedIds.length} kênh)
                  </h3>
                  <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-secondary)" }}>
                    Chỉ điền các thông tin bạn muốn thay đổi đồng loạt cho các kênh đã chọn
                  </p>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setIsBatchModalOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveBatchModal} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "6px" }}>
                  Trạng thái định hướng mới
                </label>
                <select
                  className="input-field"
                  value={batchFormData.status}
                  onChange={(e) => setBatchFormData({ ...batchFormData, status: e.target.value })}
                  style={{ width: "100%", fontSize: "13px" }}
                >
                  <option value="">-- Giữ nguyên trạng thái hiện tại --</option>
                  <option value="active">🟢 Đã có định hướng</option>
                  <option value="need_orientation">🟡 Cần định hướng</option>
                  <option value="planning">🔵 Cần lên kế hoạch</option>
                  <option value="paused">⚪ Tạm dừng</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "6px" }}>
                  Email quản lý mới (để trống nếu không muốn đổi)
                </label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="VD: tuantainguyen13579@gmail.com"
                  value={batchFormData.email}
                  onChange={(e) => setBatchFormData({ ...batchFormData, email: e.target.value })}
                  style={{ width: "100%", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "6px" }}>
                  Định hướng nội dung mới (để trống nếu không muốn đổi)
                </label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="VD: Kênh làm video Affiliate marketing, Xây dựng kịch bản nội dung..."
                  value={batchFormData.orientation}
                  onChange={(e) => setBatchFormData({ ...batchFormData, orientation: e.target.value })}
                  style={{ width: "100%", fontSize: "13px", resize: "none" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsBatchModalOpen(false)}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" style={{ gap: "6px", display: "flex", alignItems: "center" }}>
                  <Icon name="check" size={14} />
                  <span>Cập Nhật Cho {selectedIds.length} Kênh</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 8. Channel Category Management Modal */}
      <ChannelCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setCategoryModalEditingCat(null);
          setCategoryModalInitialParentId("");
        }}
        categories={categories}
        initialEditingCat={categoryModalEditingCat}
        initialParentId={categoryModalInitialParentId}
        onCategoriesChanged={async () => {
          await loadCategories();
          await loadChannels();
        }}
      />

      {/* 9. Category Deletion Confirmation Modal */}
      {categoryToDelete && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setCategoryToDelete(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999,
            padding: "16px"
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#181a29",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "14px",
              padding: "20px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 25px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(239, 68, 68, 0.2)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#f87171",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <Icon name="trash" size={20} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#fff" }}>
                  Xác Nhận Xóa Danh Mục
                </h4>
                <div style={{ fontSize: "12.5px", color: categoryToDelete.color || "var(--accent-primary)", fontWeight: "600", marginTop: "2px" }}>
                  "{categoryToDelete.name}" {categoryToDelete.parent_id ? "(Danh mục con)" : "(Loại danh mục chính)"}
                </div>
              </div>
            </div>

            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5", marginBottom: "18px", background: "rgba(255, 255, 255, 0.03)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              {(childrenMap[categoryToDelete.id] || []).length > 0 && (
                <p style={{ margin: "0 0 8px 0", color: "#fbbf24", fontWeight: "600" }}>
                  ⚠️ Danh mục này có {(childrenMap[categoryToDelete.id] || []).length} danh mục con. Khi xóa, các danh mục con sẽ trở thành danh mục chính.
                </p>
              )}
              <p style={{ margin: 0 }}>
                Các kênh đang thuộc danh mục này sẽ được chuyển về trạng thái <b>"Mặc định (Chưa phân loại)"</b> mà không làm mất kênh hay số liệu.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCategoryToDelete(null)}
                disabled={isDeletingCategory}
                style={{ padding: "6px 14px", fontSize: "12px" }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmDeleteCategory}
                disabled={isDeletingCategory}
                style={{ padding: "6px 18px", fontSize: "12px", background: "#ef4444", borderColor: "#dc2626", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {isDeletingCategory ? (
                  <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                ) : (
                  <Icon name="trash" size={13} />
                )}
                <span>Xóa Vĩnh Viễn</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 10. Category Context Menu (Right Click on Pills) */}
      {categoryContextMenu && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: categoryContextMenu.y,
            left: categoryContextMenu.x,
            background: "#181a29",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "8px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(139, 92, 246, 0.25)",
            zIndex: 1000000,
            padding: "4px",
            minWidth: "175px"
          }}
        >
          <div style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", fontSize: "11px", fontWeight: "700", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name={categoryContextMenu.category.icon || "folder"} size={12} color={categoryContextMenu.category.color || "var(--accent-primary)"} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {categoryContextMenu.category.name}
            </span>
          </div>

          {!categoryContextMenu.category.parent_id && (
            <button
              onClick={(e) => handleOpenAddSubCategory(categoryContextMenu.category, e)}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "none",
                border: "none",
                color: "var(--text-primary)",
                fontSize: "11.5px",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                cursor: "pointer",
                borderRadius: "5px",
                textAlign: "left"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >
              <Icon name="plus" size={12} color="var(--accent-secondary)" />
              <span>Thêm danh mục con</span>
            </button>
          )}

          <button
            onClick={(e) => handleOpenEditCategory(categoryContextMenu.category, e)}
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "none",
              border: "none",
              color: "var(--text-primary)",
              fontSize: "11.5px",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              cursor: "pointer",
              borderRadius: "5px",
              textAlign: "left"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "none"}
          >
            <Icon name="edit" size={12} color="var(--text-secondary)" />
            <span>Chỉnh sửa danh mục</span>
          </button>

          <button
            onClick={(e) => handleRequestDeleteCategory(categoryContextMenu.category, e)}
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "none",
              border: "none",
              color: "#f87171",
              fontSize: "11.5px",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              cursor: "pointer",
              borderRadius: "5px",
              textAlign: "left"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "none"}
          >
            <Icon name="trash" size={12} color="#f87171" />
            <span>Xóa danh mục</span>
          </button>
        </div>,
        document.body
      )}

    </div>
  );
}
