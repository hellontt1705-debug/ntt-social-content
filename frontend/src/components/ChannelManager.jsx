import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import ChannelModal from "./ChannelModal";
import FollowersExtractorModal from "./FollowersExtractorModal";
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
  clearChannelNewVideos
} from "../api";

export default function ChannelManager({ onOpenChannelScanner }) {
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
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("channel_view_mode") || "table"; // "table" or "grid"
  });

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
  }, [selectedPlatform, selectedStatus]);

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

  const handleBatchRefresh = async () => {
    if (selectedIds.length === 0) return;
    try {
      setIsBatchRefreshing(true);
      const res = await batchRefreshSocialChannels(selectedIds);
      await loadChannels();
      alert(`Đã làm mới số liệu cho ${res.refreshed_count} kênh thành công!`);
    } catch (err) {
      alert("Lỗi làm mới số liệu hàng loạt: " + err.message);
    } finally {
      setIsBatchRefreshing(false);
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
    <div className="main-content-view" style={{ padding: "20px 24px", overflowY: "auto" }}>
      
      {/* 1. Header Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div style={{ 
              width: "36px", 
              height: "36px", 
              borderRadius: "10px", 
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(139, 92, 246, 0.3)"
            }}>
              <Icon name="users" size={20} />
            </div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Bảng Quản Lý Hệ Thống Kênh Mạng Xã Hội
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
            Theo dõi số liệu tăng trưởng, định hướng nội dung & tài khoản quản trị đa nền tảng
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleOpenCreateModal}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "8px", 
            padding: "9px 18px", 
            fontSize: "13px", 
            fontWeight: "600",
            boxShadow: "0 4px 14px rgba(139, 92, 246, 0.4)"
          }}
        >
          <Icon name="plus" size={16} />
          <span>Thêm Kênh Mới</span>
        </button>
      </div>

      {/* 2. KPI Summary Cards */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", 
        gap: "14px", 
        marginBottom: "24px" 
      }}>
        {/* Card 1: Tổng số kênh */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid var(--border-color)", 
          borderRadius: "12px", 
          padding: "16px 20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
              Tổng Số Kênh
            </span>
            <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.12)", color: "var(--accent-primary)" }}>
              <Icon name="grid" size={16} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-primary)", lineHeight: 1 }}>
            {stats.total || 0}
          </div>
          <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>
            Toàn bộ các nền tảng mạng xã hội
          </div>
        </div>

        {/* Card 2: Đã có định hướng */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid rgba(16, 185, 129, 0.3)", 
          borderRadius: "12px", 
          padding: "16px 20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#10b981", letterSpacing: "0.05em" }}>
              Đã Có Định Hướng
            </span>
            <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
              <Icon name="checkCircle" size={16} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#10b981", lineHeight: 1 }}>
            {stats.oriented || 0}
          </div>
          <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>
            Kênh đã xác định rõ chủ đề & tệp khán giả
          </div>
        </div>

        {/* Card 3: Cần lên kế hoạch */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid rgba(245, 158, 11, 0.3)", 
          borderRadius: "12px", 
          padding: "16px 20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#f59e0b", letterSpacing: "0.05em" }}>
              Cần Lên Kế Hoạch
            </span>
            <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
              <Icon name="calendar" size={16} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#f59e0b", lineHeight: 1 }}>
            {stats.need_orientation || 0}
          </div>
          <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>
            Kênh cần xây dựng kịch bản & định hướng
          </div>
        </div>

        {/* Card 4: Tổng quy mô người theo dõi */}
        <div style={{ 
          background: "var(--bg-surface)", 
          border: "1px solid var(--border-color)", 
          borderRadius: "12px", 
          padding: "16px 20px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
              Quy Mô Người Theo Dõi
            </span>
            <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}>
              <Icon name="users" size={16} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-primary)", lineHeight: 1 }}>
            {formatNumber(stats.total_followers || 0)}
          </div>
          <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>
            Tổng Followers/Subscribers toàn hệ thống
          </div>
        </div>
      </div>

      {/* 3. Toolbar: Platform Filter, Status, Search, View Switcher */}
      <div style={{ 
        display: "flex", 
        flexWrap: "wrap", 
        alignItems: "center", 
        justifyContent: "space-between", 
        gap: "12px", 
        marginBottom: "16px",
        background: "var(--bg-surface)",
        padding: "10px 14px",
        borderRadius: "10px",
        border: "1px solid var(--border-color)"
      }}>
        {/* Platform Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" }}>
          {platformsList.map((p) => {
            const isActive = selectedPlatform === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: isActive ? "600" : "500",
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? "var(--accent-primary)" : "transparent",
                  color: isActive ? "#ffffff" : "var(--text-secondary)",
                  transition: "all 0.15s ease"
                }}
              >
                <Icon name={p.icon} size={14} />
                <span>{p.label}</span>
                {stats.by_platform && stats.by_platform[p.id] && (
                  <span style={{ 
                    fontSize: "10px", 
                    padding: "1px 5px", 
                    borderRadius: "10px", 
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Status Dropdown */}
          <select
            className="input-field"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ fontSize: "12px", padding: "6px 10px", height: "34px" }}
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
              placeholder="Tìm kiếm kênh, email, định hướng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: "12px", padding: "6px 10px 6px 30px", height: "34px", width: "220px" }}
            />
            <div style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
              <Icon name="search" size={13} />
            </div>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: "flex", background: "var(--bg-input)", borderRadius: "8px", padding: "2px", border: "1px solid var(--border-color)" }}>
            <button
              onClick={() => handleToggleViewMode("table")}
              title="Chế độ Bảng tính (Google Sheet)"
              style={{
                padding: "6px 10px",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                background: viewMode === "table" ? "var(--bg-surface)" : "transparent",
                color: viewMode === "table" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: viewMode === "table" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px"
              }}
            >
              <Icon name="fileText" size={14} />
              <span>Bảng</span>
            </button>
            <button
              onClick={() => handleToggleViewMode("grid")}
              title="Chế độ Thẻ (Grid Cards)"
              style={{
                padding: "6px 10px",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                background: viewMode === "grid" ? "var(--bg-surface)" : "transparent",
                color: viewMode === "grid" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: viewMode === "grid" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px"
              }}
            >
              <Icon name="grid" size={14} />
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
            borderRadius: "12px",
            padding: "10px 16px",
            marginBottom: "16px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
            flexWrap: "wrap",
            gap: "10px",
            animation: "fadeIn 0.2s ease"
          }}
        >
          {/* Left: Count & Select All */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <Icon name="check" size={12} color="#fff" />
              <span>Đã chọn: {selectedIds.length} / {channels.length} kênh</span>
            </span>

            {selectedIds.length < channels.length && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSelectAll}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  background: "rgba(139, 92, 246, 0.25)",
                  borderColor: "rgba(139, 92, 246, 0.6)",
                  color: "#fff",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}
                title="Chọn toàn bộ các kênh còn lại trong danh sách"
              >
                <Icon name="check" size={13} color="var(--accent-secondary)" />
                <span>Chọn tất cả ({channels.length})</span>
              </button>
            )}
          </div>

          {/* Right: Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
              style={{ fontSize: "12px", padding: "4px 10px", height: "32px", background: "rgba(16, 18, 29, 0.9)" }}
            >
              <option value="" disabled>Đổi trạng thái ({selectedIds.length})...</option>
              <option value="active">🟢 Đã có định hướng</option>
              <option value="need_orientation">🟡 Cần định hướng</option>
              <option value="planning">🔵 Cần lên kế hoạch</option>
              <option value="paused">⚪ Tạm dừng</option>
            </select>

            {/* Batch Refresh Stats */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleBatchRefresh}
              disabled={isBatchRefreshing}
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: "var(--accent-cyan)",
                borderColor: "rgba(6, 182, 212, 0.4)"
              }}
              title="Cào và cập nhật số liệu mới nhất cho các kênh đã chọn"
            >
              {isBatchRefreshing ? (
                <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
              ) : (
                <Icon name="sparkles" size={13} />
              )}
              <span>Làm mới số liệu ({selectedIds.length})</span>
            </button>

            {/* Batch Edit Email & Orientation */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleOpenBatchModal}
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              title="Gán nhanh Email quản lý hoặc Định hướng nội dung"
            >
              <Icon name="edit" size={13} />
              <span>Gán Email & Định hướng</span>
            </button>

            {/* Batch Delete */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleBatchDelete}
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: "#f87171",
                borderColor: "rgba(248, 113, 113, 0.4)",
                background: "rgba(239, 68, 68, 0.1)"
              }}
              title="Xóa các kênh đã chọn khỏi hệ thống"
            >
              <Icon name="trash" size={13} />
              <span>Xóa ({selectedIds.length})</span>
            </button>

            {/* Clear Selection */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleClearSelection}
              style={{
                fontSize: "12px",
                padding: "4px 8px",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center"
              }}
              title="Bỏ chọn tất cả"
            >
              <Icon name="x" size={14} />
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
          borderRadius: "12px", 
          border: "1px solid var(--border-color)", 
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)"
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ background: "rgba(22, 25, 41, 0.95)", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                  {/* Select All Checkbox */}
                  <th style={{ padding: "12px 10px", width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      ref={headerCheckboxRef}
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      style={{ cursor: "pointer", width: "15px", height: "15px", accentColor: "var(--accent-primary)" }}
                      title={isAllSelected ? "Bỏ chọn tất cả" : "Chọn tất cả kênh"}
                    />
                  </th>
                  <th style={{ padding: "12px 10px", width: "45px", textAlign: "center", fontWeight: "600" }}>STT</th>
                  <th style={{ padding: "12px 14px", width: "110px", fontWeight: "600" }}>Nền tảng</th>
                  <th style={{ padding: "12px 14px", minWidth: "200px", fontWeight: "600" }}>Kênh / Tác giả</th>
                  <th style={{ padding: "12px 14px", minWidth: "180px", fontWeight: "600" }}>Email quản lý</th>
                  <th style={{ padding: "12px 14px", minWidth: "130px", fontWeight: "600" }}>Link liên kết</th>
                  <th style={{ padding: "12px 14px", minWidth: "220px", fontWeight: "600" }}>Định hướng nội dung</th>
                  <th style={{ padding: "12px 14px", minWidth: "180px", fontWeight: "600" }}>Số liệu tăng trưởng</th>
                  <th style={{ padding: "12px 14px", minWidth: "140px", fontWeight: "600" }}>Trạng thái</th>
                  <th style={{ padding: "12px 14px", width: "110px", textAlign: "center", fontWeight: "600" }}>Thao tác</th>
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
                      <td style={{ padding: "12px 10px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(ch.id)}
                          style={{ cursor: "pointer", width: "15px", height: "15px", accentColor: "var(--accent-primary)" }}
                        />
                      </td>

                      {/* STT */}
                      <td style={{ padding: "12px 10px", textAlign: "center", color: "var(--text-muted)", fontWeight: "500" }}>
                        {idx + 1}
                      </td>

                      {/* Nền tảng */}
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ 
                          display: "inline-flex", 
                          alignItems: "center", 
                          gap: "5px", 
                          padding: "3px 8px", 
                          borderRadius: "6px", 
                          fontSize: "11.5px", 
                          fontWeight: "600",
                          background: pBadge.bg, 
                          color: pBadge.color, 
                          border: `1px solid ${pBadge.border}` 
                        }}>
                          <Icon name={pBadge.icon} size={13} />
                          <span>{pBadge.label}</span>
                        </span>
                      </td>

                      {/* Kênh / Tác giả */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {ch.avatar_url ? (
                            <img 
                              src={ch.avatar_url} 
                              alt={ch.name} 
                              style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-color)", flexShrink: 0 }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div style={{ 
                              width: "32px", 
                              height: "32px", 
                              borderRadius: "50%", 
                              background: "rgba(139, 92, 246, 0.15)", 
                              color: "var(--accent-primary)", 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "center",
                              fontWeight: "700",
                              fontSize: "13px",
                              flexShrink: 0
                            }}>
                              {(ch.name || "K")[0].toUpperCase()}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: "600", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {ch.name}
                            </div>
                            {ch.handle && (
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email quản lý */}
                      <td style={{ padding: "12px 14px", color: ch.email ? "var(--text-secondary)" : "var(--text-muted)" }}>
                        {ch.email ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "12px" }}>{ch.email}</span>
                          </div>
                        ) : (
                          <span style={{ fontStyle: "italic", fontSize: "11px" }}>Chưa cập nhật</span>
                        )}
                      </td>

                      {/* Link liên kết */}
                      <td style={{ padding: "12px 14px" }}>
                        {ch.url ? (
                          <a
                            href={ch.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ 
                              display: "inline-flex", 
                              alignItems: "center", 
                              gap: "4px", 
                              color: "var(--accent-primary)", 
                              textDecoration: "none",
                              fontSize: "11.5px",
                              fontWeight: "500"
                            }}
                          >
                            <span>Mở link</span>
                            <Icon name="externalLink" size={12} />
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>—</span>
                        )}
                      </td>

                      {/* Định hướng nội dung */}
                      <td style={{ padding: "12px 14px" }}>
                        {ch.orientation ? (
                          <span style={{ 
                            display: "inline-block", 
                            background: "rgba(255, 255, 255, 0.04)", 
                            padding: "4px 8px", 
                            borderRadius: "6px", 
                            fontSize: "12px", 
                            color: "var(--text-primary)" 
                          }}>
                            {ch.orientation}
                          </span>
                        ) : (
                          <span style={{ fontStyle: "italic", fontSize: "11.5px", color: "var(--text-muted)" }}>
                            Chưa có định hướng cụ thể
                          </span>
                        )}
                      </td>

                      {/* Số liệu tăng trưởng */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <div 
                            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}
                            onClick={() => setFollowersModalChannel(ch)}
                            title="Bấm để xem & trích xuất danh sách Followers"
                          >
                            <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>{formatNumber(ch.followers_count)}</span>
                            <span style={{ color: "var(--accent-primary)", fontSize: "10.5px", fontWeight: "600" }}>Followers ↗</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10.5px", color: "var(--text-muted)", flexWrap: "wrap" }}>
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
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  padding: "2px 7px",
                                  borderRadius: "8px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  boxShadow: "0 2px 6px rgba(239, 68, 68, 0.4)",
                                  cursor: "pointer"
                                }}
                                title="Kênh có video mới đăng! Bấm để quét và tải ngay"
                                onClick={() => handleScanChannelAction(ch)}
                              >
                                🔥 {ch.new_videos_count ? `+${ch.new_videos_count} video mới` : "Có video mới"}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ 
                          display: "inline-flex", 
                          alignItems: "center", 
                          gap: "6px", 
                          padding: "3px 10px", 
                          borderRadius: "12px", 
                          fontSize: "11.5px", 
                          fontWeight: "600",
                          background: sBadge.bg, 
                          color: sBadge.color, 
                          border: `1px solid ${sBadge.border}` 
                        }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: sBadge.dot }} />
                          <span>{sBadge.label}</span>
                        </span>
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                          {/* Nút Quét Kênh */}
                          <button
                            className="icon-btn"
                            title="Quét & Tải video kênh (Douyin / TikTok)"
                            onClick={() => handleScanChannelAction(ch)}
                            style={{ padding: "5px", color: "#38bdf8" }}
                          >
                            <Icon name="video" size={14} />
                          </button>

                          {/* Nút Trích xuất Followers */}
                          <button
                            className="icon-btn"
                            title="Trích xuất & Quản lý Followers (Xuất 2 file .txt)"
                            onClick={() => setFollowersModalChannel(ch)}
                            style={{ padding: "5px", color: "#ec4899" }}
                          >
                            <Icon name="users" size={14} />
                          </button>

                          {/* Nút làm mới */}
                          <button
                            className="icon-btn"
                            title="Làm mới số liệu từ URL gốc"
                            onClick={() => handleRefreshStats(ch.id)}
                            disabled={isRefreshing || !ch.url}
                            style={{ padding: "5px", color: "var(--accent-primary)" }}
                          >
                            {isRefreshing ? (
                              <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                            ) : (
                              <Icon name="sparkles" size={14} />
                            )}
                          </button>

                          {/* Nút sửa */}
                          <button
                            className="icon-btn"
                            title="Chỉnh sửa thông tin kênh"
                            onClick={() => handleOpenEditModal(ch)}
                            style={{ padding: "5px", color: "var(--text-secondary)" }}
                          >
                            <Icon name="edit" size={14} />
                          </button>

                          {/* Nút xóa */}
                          <button
                            className="icon-btn"
                            title="Xóa kênh"
                            onClick={() => handleDeleteChannel(ch.id, ch.name)}
                            style={{ padding: "5px", color: "#f87171" }}
                          >
                            <Icon name="trash" size={14} />
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
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", 
          gap: "16px" 
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
                  borderRadius: "14px",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: isSelected ? "0 0 16px rgba(139, 92, 246, 0.3)" : "var(--shadow-sm)",
                  transition: "all 0.15s ease",
                  position: "relative"
                }}
              >
                <div>
                  {/* Top Card: Checkbox, Platform & Status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(ch.id)}
                        style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "var(--accent-primary)" }}
                      />
                      <span style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        gap: "5px", 
                        padding: "3px 8px", 
                        borderRadius: "6px", 
                        fontSize: "11px", 
                        fontWeight: "600",
                        background: pBadge.bg, 
                        color: pBadge.color, 
                        border: `1px solid ${pBadge.border}` 
                      }}>
                        <Icon name={pBadge.icon} size={12} />
                        <span>{pBadge.label}</span>
                      </span>
                    </div>

                    <span style={{ 
                      display: "inline-flex", 
                      alignItems: "center", 
                      gap: "5px", 
                      padding: "3px 8px", 
                      borderRadius: "10px", 
                      fontSize: "11px", 
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
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                    {ch.avatar_url ? (
                      <img 
                        src={ch.avatar_url} 
                        alt={ch.name} 
                        style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-color)", flexShrink: 0 }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ 
                        width: "44px", 
                        height: "44px", 
                        borderRadius: "50%", 
                        background: "rgba(139, 92, 246, 0.15)", 
                        color: "var(--accent-primary)", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        fontWeight: "700",
                        fontSize: "16px",
                        flexShrink: 0
                      }}>
                        {(ch.name || "K")[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{ margin: "0 0 2px 0", fontSize: "15px", fontWeight: "700", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ch.name}
                      </h4>
                      {ch.handle && (
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(3, 1fr)", 
                    gap: "8px", 
                    background: "var(--bg-input)", 
                    padding: "10px", 
                    borderRadius: "10px", 
                    border: "1px solid var(--border-color)",
                    marginBottom: "14px",
                    textAlign: "center"
                  }}>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-primary)" }}>
                        {formatNumber(ch.followers_count)}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Followers
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-primary)" }}>
                        {formatNumber(ch.following_count)}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Following
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                        <span>{formatNumber(ch.posts_count || ch.likes_count)}</span>
                        {Boolean(ch.has_new_videos) && (
                          <span
                            style={{
                              background: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                              color: "#fff",
                              fontSize: "9px",
                              fontWeight: "700",
                              padding: "1px 5px",
                              borderRadius: "6px",
                              cursor: "pointer"
                            }}
                            title="Có video mới! Bấm để quét"
                            onClick={() => handleScanChannelAction(ch)}
                          >
                            🔥
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        {ch.posts_count ? "Videos" : "Likes"}
                      </div>
                    </div>
                  </div>

                  {/* Orientation Box */}
                  <div style={{ marginBottom: "10px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                      Định hướng nội dung:
                    </span>
                    <div style={{ 
                      fontSize: "12px", 
                      color: ch.orientation ? "var(--text-primary)" : "var(--text-muted)",
                      background: "rgba(255, 255, 255, 0.03)",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      lineHeight: "1.4"
                    }}>
                      {ch.orientation || "Chưa có định hướng cụ thể"}
                    </div>
                  </div>

                  {/* Email & Notes */}
                  {ch.email && (
                    <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
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
                  paddingTop: "12px", 
                  borderTop: "1px solid var(--border-color)",
                  marginTop: "10px" 
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
                          gap: "4px", 
                          color: "var(--accent-primary)", 
                          textDecoration: "none",
                          fontSize: "12px",
                          fontWeight: "500"
                        }}
                      >
                        <span>Mở kênh</span>
                        <Icon name="externalLink" size={12} />
                      </a>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {/* Nút Quét Kênh */}
                    <button
                      className="icon-btn"
                      title="Quét & Tải video kênh (Douyin / TikTok)"
                      onClick={() => handleScanChannelAction(ch)}
                      style={{ padding: "6px", color: "#38bdf8" }}
                    >
                      <Icon name="video" size={15} />
                    </button>

                    {/* Nút Trích xuất Followers */}
                    <button
                      className="icon-btn"
                      title="Trích xuất & Quản lý Followers (Xuất 2 file .txt)"
                      onClick={() => setFollowersModalChannel(ch)}
                      style={{ padding: "6px", color: "#ec4899" }}
                    >
                      <Icon name="users" size={15} />
                    </button>

                    <button
                      className="icon-btn"
                      title="Làm mới số liệu"
                      onClick={() => handleRefreshStats(ch.id)}
                      disabled={isRefreshing || !ch.url}
                      style={{ padding: "6px", color: "var(--accent-primary)" }}
                    >
                      {isRefreshing ? (
                        <span className="spinner" style={{ width: "13px", height: "13px", borderWidth: "2px" }} />
                      ) : (
                        <Icon name="sparkles" size={15} />
                      )}
                    </button>

                    <button
                      className="icon-btn"
                      title="Sửa"
                      onClick={() => handleOpenEditModal(ch)}
                      style={{ padding: "6px", color: "var(--text-secondary)" }}
                    >
                      <Icon name="edit" size={15} />
                    </button>

                    <button
                      className="icon-btn"
                      title="Xóa"
                      onClick={() => handleDeleteChannel(ch.id, ch.name)}
                      style={{ padding: "6px", color: "#f87171" }}
                    >
                      <Icon name="trash" size={15} />
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

    </div>
  );
}
