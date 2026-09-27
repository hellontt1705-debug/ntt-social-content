import React from "react";
import { Icon } from "./Icons";

export default function ConfirmModal({
  isOpen,
  type = "confirm", // "confirm" | "danger" | "success" | "info"
  title,
  message,
  confirmText,
  cancelText = "Hủy bỏ",
  onConfirm,
  onClose,
  showCancel
}) {
  if (!isOpen) return null;

  const isSuccess = type === "success";
  const isDanger = type === "danger" || type === "confirm";
  const isInfo = type === "info";

  // By default, show cancel for confirm/danger unless explicitly overridden
  const shouldShowCancel = showCancel !== undefined ? showCancel : !isSuccess;
  const defaultConfirmText = isSuccess ? "Đồng ý" : isDanger ? "Xác nhận loại bỏ" : "Xác nhận";
  const finalConfirmText = confirmText || defaultConfirmText;

  const defaultTitle = isSuccess
    ? "Thành Công"
    : isDanger
    ? "Xác Nhận Loại Bỏ"
    : "Thông Báo";
  const finalTitle = title || defaultTitle;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        animation: "fadeIn 0.15s ease-out"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0d121f",
          border: isSuccess
            ? "1px solid rgba(16, 185, 129, 0.3)"
            : isDanger
            ? "1px solid rgba(239, 68, 68, 0.3)"
            : "1px solid rgba(139, 92, 246, 0.3)",
          borderRadius: "16px",
          width: "90%",
          maxWidth: "400px",
          padding: "26px 22px 20px 22px",
          textAlign: "center",
          boxShadow: isSuccess
            ? "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.15)"
            : isDanger
            ? "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(239, 68, 68, 0.15)"
            : "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(139, 92, 246, 0.15)",
          boxSizing: "border-box",
          position: "relative"
        }}
      >
        {/* Top Icon Badge */}
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            margin: "0 auto 16px auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isSuccess
              ? "radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0.05) 100%)"
              : isDanger
              ? "radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.05) 100%)"
              : "radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, rgba(139, 92, 246, 0.05) 100%)",
            border: isSuccess
              ? "1px solid rgba(16, 185, 129, 0.4)"
              : isDanger
              ? "1px solid rgba(239, 68, 68, 0.4)"
              : "1px solid rgba(139, 92, 246, 0.4)",
            boxShadow: isSuccess
              ? "0 0 20px rgba(16, 185, 129, 0.3)"
              : isDanger
              ? "0 0 20px rgba(239, 68, 68, 0.3)"
              : "0 0 20px rgba(139, 92, 246, 0.3)"
          }}
        >
          {isSuccess ? (
            <Icon name="checkCircle" size={30} color="#10b981" />
          ) : isDanger ? (
            <Icon name="trash" size={24} color="#ef4444" />
          ) : (
            <Icon name="calendar" size={26} color="#8b5cf6" />
          )}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#fff",
            marginBottom: "8px"
          }}
        >
          {finalTitle}
        </div>

        {/* Message */}
        <div
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            marginBottom: "22px",
            whiteSpace: "pre-line"
          }}
        >
          {message}
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            justifyContent: "center"
          }}
        >
          {shouldShowCancel && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{
                flex: 1,
                height: "36px",
                fontSize: "12.5px",
                fontWeight: 600,
                borderRadius: "8px"
              }}
            >
              {cancelText}
            </button>
          )}

          <button
            type="button"
            className="btn"
            onClick={() => {
              if (onConfirm) onConfirm();
              if (onClose) onClose();
            }}
            style={{
              flex: 1,
              height: "36px",
              fontSize: "12.5px",
              fontWeight: 600,
              borderRadius: "8px",
              border: "none",
              color: "#fff",
              background: isSuccess
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : isDanger
                ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                : "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              boxShadow: isSuccess
                ? "0 4px 14px rgba(16, 185, 129, 0.4)"
                : isDanger
                ? "0 4px 14px rgba(239, 68, 68, 0.4)"
                : "0 4px 14px rgba(139, 92, 246, 0.4)",
              cursor: "pointer"
            }}
          >
            {finalConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
