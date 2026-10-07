import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import {
  createChannelCategory,
  updateChannelCategory,
  deleteChannelCategory
} from "../api";

export default function ChannelCategoryModal({
  isOpen,
  onClose,
  categories = [],
  onCategoriesChanged,
  initialEditingCat = null,
  initialParentId = ""
}) {
  const [editingCat, setEditingCat] = useState(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [color, setColor] = useState("#8b5cf6");
  const [parentId, setParentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const presetIcons = [
    { id: "folder", label: "Thư mục" },
    { id: "award", label: "Chính / Brand" },
    { id: "film", label: "Nội dung / Phim" },
    { id: "music", label: "Âm nhạc" },
    { id: "gamepad", label: "Game" },
    { id: "shoppingBag", label: "Affiliate" },
    { id: "sparkles", label: "Viral / Nổi bật" },
    { id: "book", label: "Kiến thức" },
    { id: "video", label: "Video Edit" },
    { id: "zap", label: "AI / Tech" },
    { id: "globe", label: "Vệ tinh / MXH" },
    { id: "user", label: "Cá nhân" },
    { id: "star", label: "Đánh giá" },
    { id: "heart", label: "Cảm xúc" },
  ];

  const presetColors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
    "#f59e0b", "#10b981", "#06b6d4", "#38bdf8",
    "#3b82f6", "#14b8a6", "#f97316", "#a855f7"
  ];

  // Phân cấp cây danh mục: root và children
  const { rootCategories, childrenMap } = useMemo(() => {
    const roots = [];
    const children = {};
    const validParentIds = new Set();

    categories.forEach((cat) => {
      if (!cat.parent_id) {
        roots.push(cat);
        validParentIds.add(cat.id);
      }
    });

    categories.forEach((cat) => {
      if (cat.parent_id) {
        if (!children[cat.parent_id]) {
          children[cat.parent_id] = [];
        }
        children[cat.parent_id].push(cat);
      }
    });

    return { rootCategories: roots, childrenMap: children };
  }, [categories]);

  // Reset form
  const resetForm = () => {
    setEditingCat(null);
    setName("");
    setIcon("folder");
    setColor("#8b5cf6");
    setParentId("");
    setErrorMsg("");
  };

  useEffect(() => {
    if (isOpen) {
      if (initialEditingCat) {
        setEditingCat(initialEditingCat);
        setName(initialEditingCat.name || "");
        setIcon(initialEditingCat.icon || "folder");
        setColor(initialEditingCat.color || "#8b5cf6");
        setParentId(initialEditingCat.parent_id || "");
      } else {
        resetForm();
        if (initialParentId) {
          setParentId(initialParentId);
        }
      }
      setSuccessMsg("");
      setErrorMsg("");
      setConfirmDeleteCat(null);
    }
  }, [isOpen, initialEditingCat, initialParentId]);

  if (!isOpen) return null;

  const handleStartEdit = (cat) => {
    setEditingCat(cat);
    setName(cat.name || "");
    setIcon(cat.icon || "folder");
    setColor(cat.color || "#8b5cf6");
    setParentId(cat.parent_id || "");
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleAddChildFor = (parentCat) => {
    setEditingCat(null);
    setName("");
    setIcon(parentCat.icon || "folder");
    setColor(parentCat.color || "#8b5cf6");
    setParentId(parentCat.id);
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Vui lòng nhập tên danh mục!");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg("");

      const payload = {
        name: name.trim(),
        icon,
        color,
        parent_id: parentId && parentId !== "__none__" ? parentId : null
      };

      if (editingCat) {
        await updateChannelCategory(editingCat.id, payload);
        setSuccessMsg(`Đã cập nhật danh mục "${name.trim()}"!`);
      } else {
        await createChannelCategory(payload);
        setSuccessMsg(`Đã tạo mới danh mục "${name.trim()}"!`);
      }

      resetForm();
      if (onCategoriesChanged) {
        await onCategoriesChanged();
      }
    } catch (err) {
      setErrorMsg(err.message || "Đã xảy ra lỗi khi lưu danh mục");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestDelete = (cat) => {
    setConfirmDeleteCat(cat);
  };

  const handleExecuteDelete = async () => {
    if (!confirmDeleteCat) return;
    try {
      setIsDeleting(true);
      setErrorMsg("");
      await deleteChannelCategory(confirmDeleteCat.id);
      setSuccessMsg(`Đã xóa danh mục "${confirmDeleteCat.name}" thành công!`);
      if (editingCat && editingCat.id === confirmDeleteCat.id) {
        resetForm();
      }
      setConfirmDeleteCat(null);
      if (onCategoriesChanged) {
        await onCategoriesChanged();
      }
    } catch (err) {
      setErrorMsg(err.message || "Lỗi khi xóa danh mục");
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px"
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          backgroundColor: "#13151f",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          borderRadius: "14px",
          boxShadow: "0 20px 45px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.08))"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #6366f1, #a855f7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 2px 8px rgba(139, 92, 246, 0.4)"
              }}
            >
              <Icon name="folder" size={17} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                Quản Lý Danh Mục Kênh Mạng Xã Hội
              </h3>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)" }}>
                Phân loại danh mục thuộc loại danh mục (Cấu trúc phân cấp Cha - Con)
              </p>
            </div>
          </div>

          <button
            className="icon-btn"
            onClick={onClose}
            style={{ padding: "6px", color: "var(--text-muted)" }}
            title="Đóng"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div style={{ margin: "10px 20px 0", padding: "8px 12px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", color: "#fca5a5", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="alertCircle" size={14} />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div style={{ margin: "10px 20px 0", padding: "8px 12px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#6ee7b7", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="checkCircle" size={14} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body (Form + List) */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Form Create / Edit */}
          <form
            onSubmit={handleSubmit}
            style={{
              background: "rgba(255, 255, 255, 0.025)",
              border: editingCat ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border-color)",
              borderRadius: "10px",
              padding: "14px",
              boxShadow: editingCat ? "0 0 15px rgba(245, 158, 11, 0.1)" : "none",
              transition: "all 0.2s ease"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: editingCat ? "#f59e0b" : "var(--accent-primary)", display: "flex", alignItems: "center", gap: "5px" }}>
                <Icon name={editingCat ? "edit" : "plus"} size={13} />
                <span>{editingCat ? `Đang chỉnh sửa: "${editingCat.name}"` : "Thêm Danh Mục Kênh Mới"}</span>
              </span>

              {editingCat && (
                <button
                  type="button"
                  onClick={resetForm}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "11px", cursor: "pointer", textDecoration: "underline" }}
                >
                  Hủy chỉnh sửa
                </button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr", gap: "10px", marginBottom: "10px" }}>
              {/* Tên danh mục */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px", fontWeight: "600" }}>
                  Tên danh mục <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ví dụ: Kênh Affiliate, Học Edit, Giải Trí..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: "100%", height: "32px", fontSize: "12px", padding: "4px 10px" }}
                  autoFocus={Boolean(editingCat)}
                />
              </div>

              {/* Thuộc loại danh mục cha */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px", fontWeight: "600" }}>
                  Thuộc loại danh mục (Phân cấp)
                </label>
                <select
                  className="input-field"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  style={{ width: "100%", height: "32px", fontSize: "11.5px", padding: "4px 8px" }}
                >
                  <option value="">-- Là loại danh mục chính (Cấp cao nhất) --</option>
                  {rootCategories
                    .filter((r) => !editingCat || r.id !== editingCat.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        ↳ Thuộc loại: {r.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Icon & Color Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
              {/* Icon selector */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px", fontWeight: "600" }}>
                  Biểu tượng (Icon)
                </label>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", maxHeight: "68px", overflowY: "auto", padding: "2px" }}>
                  {presetIcons.map((item) => {
                    const isSelected = icon === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setIcon(item.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "3px 6px",
                          borderRadius: "5px",
                          border: isSelected ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                          background: isSelected ? "rgba(139, 92, 246, 0.25)" : "rgba(255, 255, 255, 0.03)",
                          color: isSelected ? "#fff" : "var(--text-secondary)",
                          fontSize: "10.5px",
                          cursor: "pointer"
                        }}
                      >
                        <Icon name={item.id} size={11} color={isSelected ? "var(--accent-primary)" : "currentColor"} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color selector */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px", fontWeight: "600" }}>
                  Màu sắc nhận diện
                </label>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  {presetColors.map((c) => {
                    const isSelected = color === c;
                    return (
                      <div
                        key={c}
                        onClick={() => setColor(c)}
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: c,
                          cursor: "pointer",
                          border: isSelected ? "2px solid #fff" : "2px solid transparent",
                          boxShadow: isSelected ? `0 0 8px ${c}` : "none",
                          transform: isSelected ? "scale(1.15)" : "scale(1)",
                          transition: "all 0.15s ease"
                        }}
                        title={c}
                      />
                    );
                  })}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", background: "transparent" }}
                    title="Tùy chọn mã màu bất kỳ"
                  />
                </div>
              </div>
            </div>

            {/* Submit button */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              {editingCat && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={resetForm}
                  style={{ padding: "5px 12px", fontSize: "11.5px" }}
                >
                  Hủy
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={isSubmitting}
                style={{ padding: "5px 16px", fontSize: "11.5px", gap: "5px", display: "flex", alignItems: "center" }}
              >
                {isSubmitting ? (
                  <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                ) : (
                  <Icon name="check" size={13} />
                )}
                <span>{editingCat ? "Cập Nhật Danh Mục" : "Lưu Danh Mục Mới"}</span>
              </button>
            </div>
          </form>

          {/* List of categories */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                Cây danh mục kênh hiện có ({categories.length})
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {rootCategories.length} loại chính • {categories.length - rootCategories.length} mục con
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {rootCategories.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px" }}>
                  Chưa có danh mục nào. Hãy tạo loại danh mục đầu tiên ở biểu mẫu trên!
                </div>
              ) : (
                rootCategories.map((parent) => {
                  const children = childrenMap[parent.id] || [];
                  const isCurrentEditing = editingCat && editingCat.id === parent.id;

                  return (
                    <div
                      key={parent.id}
                      style={{
                        background: isCurrentEditing ? "rgba(245, 158, 11, 0.08)" : "rgba(255, 255, 255, 0.02)",
                        border: isCurrentEditing ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border-color)",
                        borderRadius: "8px",
                        padding: "8px 10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px"
                      }}
                    >
                      {/* Parent row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "6px",
                              background: `${parent.color || "#8b5cf6"}25`,
                              border: `1px solid ${parent.color || "#8b5cf6"}60`,
                              color: parent.color || "#8b5cf6",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0
                            }}
                          >
                            <Icon name={parent.icon || "folder"} size={13} />
                          </div>
                          <span style={{ fontSize: "12.5px", fontWeight: "700", color: "#fff" }}>
                            {parent.name}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "600",
                              padding: "1px 6px",
                              borderRadius: "10px",
                              background: "rgba(255, 255, 255, 0.06)",
                              color: "var(--text-secondary)"
                            }}
                            title={`Tổng cộng: ${parent.count || 0} kênh (${parent.direct_count || 0} trực tiếp + ${(parent.count || 0) - (parent.direct_count || 0)} từ mục con)`}
                          >
                            {parent.count || 0} kênh
                          </span>
                        </div>

                        {/* Actions for Parent */}
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => handleAddChildFor(parent)}
                            title={`Thêm danh mục con cho "${parent.name}"`}
                            style={{ padding: "3px 6px", color: "var(--accent-primary)", fontSize: "10.5px", display: "inline-flex", alignItems: "center", gap: "3px", background: "rgba(139, 92, 246, 0.12)", borderRadius: "4px" }}
                          >
                            <Icon name="plus" size={11} />
                            <span>Mục con</span>
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => handleStartEdit(parent)}
                            title="Sửa danh mục này"
                            style={{ padding: "4px", color: "var(--text-secondary)" }}
                          >
                            <Icon name="edit" size={12} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => handleRequestDelete(parent)}
                            title="Xóa danh mục này"
                            style={{ padding: "4px", color: "#f87171" }}
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Children list */}
                      {children.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            paddingLeft: "26px",
                            borderLeft: `2px dashed ${parent.color || "rgba(139, 92, 246, 0.4)"}`,
                            marginLeft: "11px",
                            marginTop: "2px"
                          }}
                        >
                          {children.map((child) => {
                            const isChildEditing = editingCat && editingCat.id === child.id;

                            return (
                              <div
                                key={child.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  background: isChildEditing ? "rgba(245, 158, 11, 0.12)" : "rgba(255, 255, 255, 0.015)",
                                  border: isChildEditing ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(255, 255, 255, 0.04)",
                                  borderRadius: "6px",
                                  padding: "4px 8px"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>↳</span>
                                  <div
                                    style={{
                                      width: "18px",
                                      height: "18px",
                                      borderRadius: "4px",
                                      background: `${child.color || "#a855f7"}20`,
                                      color: child.color || "#a855f7",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center"
                                    }}
                                  >
                                    <Icon name={child.icon || "folder"} size={10} />
                                  </div>
                                  <span style={{ fontSize: "11.5px", fontWeight: "600", color: isChildEditing ? "#f59e0b" : "var(--text-primary)" }}>
                                    {child.name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "9.5px",
                                      padding: "0 5px",
                                      borderRadius: "8px",
                                      background: "rgba(255, 255, 255, 0.05)",
                                      color: "var(--text-muted)"
                                    }}
                                  >
                                    {child.direct_count || 0}
                                  </span>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => handleStartEdit(child)}
                                    title="Sửa danh mục con"
                                    style={{ padding: "3px", color: "var(--text-secondary)" }}
                                  >
                                    <Icon name="edit" size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => handleRequestDelete(child)}
                                    title="Xóa danh mục con"
                                    style={{ padding: "3px", color: "#f87171" }}
                                  >
                                    <Icon name="trash" size={11} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end"
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ padding: "6px 16px", fontSize: "12px" }}
          >
            Đóng
          </button>
        </div>

        {/* Custom Confirmation Popup for Deleting Category */}
        {confirmDeleteCat && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteCat(null);
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: "20px"
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#181a29",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "12px",
                padding: "20px",
                maxWidth: "440px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(239, 68, 68, 0.2)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#f87171",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Icon name="trash" size={18} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "#fff" }}>
                    Xác Nhận Xóa Danh Mục
                  </h4>
                  <span style={{ fontSize: "12px", color: "var(--accent-primary)", fontWeight: "600" }}>
                    "{confirmDeleteCat.name}"
                  </span>
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5", marginBottom: "16px", background: "rgba(255, 255, 255, 0.03)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                {(childrenMap[confirmDeleteCat.id] || []).length > 0 && (
                  <p style={{ margin: "0 0 8px 0", color: "#fbbf24", fontWeight: "600" }}>
                    ⚠️ Danh mục này có {(childrenMap[confirmDeleteCat.id] || []).length} danh mục con. Khi xóa, các danh mục con sẽ trở thành danh mục chính.
                  </p>
                )}
                <p style={{ margin: 0 }}>
                  Các kênh thuộc danh mục này sẽ được chuyển về <b>"Mặc định (Chưa phân loại)"</b> mà không bị xóa kênh.
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setConfirmDeleteCat(null)}
                  disabled={isDeleting}
                  style={{ padding: "6px 14px", fontSize: "12px" }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleExecuteDelete}
                  disabled={isDeleting}
                  style={{ padding: "6px 16px", fontSize: "12px", background: "#ef4444", borderColor: "#dc2626", color: "#fff", display: "flex", alignItems: "center", gap: "5px" }}
                >
                  {isDeleting ? (
                    <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                  ) : (
                    <Icon name="trash" size={13} />
                  )}
                  <span>Xóa Vĩnh Viễn</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
