import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0d0f1a",
            color: "#f8fafc",
            fontFamily: "system-ui, -apple-system, sans-serif",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              maxWidth: "540px",
              width: "100%",
              background: "#16192b",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "16px",
              padding: "28px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "26px",
                margin: "0 auto 16px auto",
              }}
            >
              ⚠️
            </div>

            <h2 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: "700", color: "#f8fafc" }}>
              Đã Xảy Ra Sự Cố Hiển Thị
            </h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#94a3b8", lineHeight: "1.5" }}>
              Một thành phần giao diện đã gặp lỗi tạm thời. Vui lòng bấm nút bên dưới để tải lại trang.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "#f87171",
                  textAlign: "left",
                  marginBottom: "20px",
                  overflowX: "auto",
                  maxHeight: "120px",
                }}
              >
                {this.state.error.toString()}
              </div>
            )}

            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                border: "none",
                padding: "10px 24px",
                borderRadius: "8px",
                fontSize: "13.5px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(139, 92, 246, 0.4)",
              }}
            >
              🔄 Tải Lại Trang (F5)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
