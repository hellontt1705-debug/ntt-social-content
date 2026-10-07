import React, { useState, useEffect } from "react";
import { Icon } from "../Icons";
import { 
  getDubbingAssets, 
  exportDubbingZip, 
  renderDubbingVideo, 
  API_BASE 
} from "../../api";

export default function DubbingExportModal({ isOpen, onClose, project, onProjectUpdated }) {
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [zipDownloading, setZipDownloading] = useState(false);

  useEffect(() => {
    if (isOpen && project?.id) {
      loadAssets();
      if (project.pipeline_status?.render === "PROCESSING") {
        setIsRendering(true);
        simulateRenderProgress();
      }
    }
  }, [isOpen, project]);

  const loadAssets = async () => {
    try {
      setIsLoading(true);
      const res = await getDubbingAssets(project.id);
      if (res.success) {
        setAssets(res.assets || []);
      }
    } catch (e) {
      console.error("Failed to load assets:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const simulateRenderProgress = () => {
    let p = 5;
    const timer = setInterval(() => {
      p += Math.floor(Math.random() * 10) + 5;
      if (p >= 100) {
        p = 100;
        clearInterval(timer);
        setIsRendering(false);
        loadAssets();
        if (onProjectUpdated) onProjectUpdated();
      }
      setRenderProgress(p);
    }, 1200);
  };

  const handleStartRender = async () => {
    try {
      setIsRendering(true);
      setRenderProgress(5);
      await renderDubbingVideo(project.id);
      simulateRenderProgress();
    } catch (e) {
      alert("Lỗi khi gửi yêu cầu render: " + e.message);
      setIsRendering(false);
    }
  };

  const handleDownloadZip = async () => {
    try {
      setZipDownloading(true);
      const res = await exportDubbingZip(project.id);
      if (res.success) {
        window.open(`${API_BASE}/dubbing/assets/download/${project.id}/bundle_zip`, "_blank");
      }
    } catch (e) {
      alert("Lỗi tải file ZIP: " + e.message);
    } finally {
      setZipDownloading(false);
    }
  };

  if (!isOpen) return null;

  const finalVideoAsset = assets.find(a => a.asset_type === "FINAL_MP4");

  return (
    <div className="modal-overlay" style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      backdropFilter: "blur(4px)"
    }}>
      <div className="modal-content" style={{
        background: "#18181b", color: "#f4f4f5", width: "620px", maxWidth: "95vw",
        borderRadius: "14px", border: "1px solid #27272a", boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
        overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #27272a",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "8px", background: "#27272a",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Icon name="film" size={20} color="#10b981" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>Tải về</h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#a1a1aa" }}>
                Tải các tệp Studio hiện tại. Video hoàn chỉnh sẽ được render theo yêu cầu.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: "#a1a1aa",
              cursor: "pointer", padding: "4px", borderRadius: "6px"
            }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" }}>
          
          {/* Main MP4 Render Card */}
          <div style={{
            background: "#27272a", borderRadius: "10px", padding: "16px",
            border: "1px solid #3f3f46"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{
                  background: "#10b981", color: "#000", fontWeight: "700",
                  fontSize: "11px", padding: "4px 8px", borderRadius: "4px"
                }}>
                  MP4
                </span>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>Video hoàn chỉnh</div>
                  <div style={{ fontSize: "12px", color: "#a1a1aa" }}>
                    Tải bản video hoàn chỉnh (phụ đề + lồng tiếng) mới nhất về máy.
                  </div>
                </div>
              </div>

              {isRendering ? (
                <button 
                  disabled
                  style={{
                    background: "#3f3f46", color: "#a1a1aa", border: "none",
                    padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "500",
                    cursor: "not-allowed"
                  }}
                >
                  Đang xử lý... {renderProgress}%
                </button>
              ) : finalVideoAsset ? (
                <a 
                  href={`${API_BASE}/dubbing/assets/download/${project.id}/final_mp4`}
                  download
                  style={{
                    background: "#10b981", color: "#000", border: "none", textDecoration: "none",
                    padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600",
                    display: "inline-flex", alignItems: "center", gap: "6px"
                  }}
                >
                  <Icon name="download" size={15} /> Tải MP4
                </a>
              ) : (
                <button 
                  onClick={handleStartRender}
                  style={{
                    background: "#10b981", color: "#000", border: "none",
                    padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Render ngay
                </button>
              )}
            </div>

            {/* Folder badge & Subtext */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#a1a1aa", marginTop: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="folder" size={13} color="#3b82f6" />
                <span>Thư mục: <strong style={{ color: "#fff" }}>{project.folder_name || "ketqua-11-9"}</strong></span>
              </div>
              {isRendering && <span>{renderProgress}%</span>}
            </div>

            {/* Progress bar */}
            {isRendering && (
              <div style={{
                marginTop: "10px", width: "100%", height: "6px",
                background: "#18181b", borderRadius: "4px", overflow: "hidden"
              }}>
                <div style={{
                  height: "100%", width: `${renderProgress}%`,
                  background: "#10b981", transition: "width 0.3s ease"
                }} />
              </div>
            )}
          </div>

          {/* Asset Hub Section */}
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "10px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "#d4d4d8" }}>
                  Tài nguyên ({assets.length})
                </span>
                <span title="Tất cả các file thành phần của project" style={{ cursor: "pointer", color: "#71717a" }}>
                  <Icon name="info" size={13} />
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button 
                  onClick={handleDownloadZip}
                  disabled={zipDownloading}
                  style={{
                    background: "#27272a", color: "#f4f4f5", border: "1px solid #3f3f46",
                    padding: "5px 12px", borderRadius: "6px", fontSize: "12px",
                    display: "flex", alignItems: "center", gap: "6px", cursor: "pointer"
                  }}
                >
                  <Icon name="archive" size={14} color="#10b981" />
                  {zipDownloading ? "Đang nén..." : "Tải tất cả (ZIP)"}
                </button>
                <button 
                  onClick={loadAssets}
                  style={{
                    background: "#10b981", color: "#000", border: "none",
                    padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
                    display: "flex", alignItems: "center", gap: "4px", cursor: "pointer"
                  }}
                >
                  <Icon name="plus" size={14} /> Thêm
                </button>
              </div>
            </div>

            {/* Asset Items List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {assets.map((asset) => {
                const badgeColor = 
                  asset.asset_type.includes("MP4") ? "#10b981" :
                  asset.asset_type.includes("JSON") ? "#f59e0b" :
                  asset.asset_type.includes("ASS") ? "#ec4899" :
                  asset.asset_type.includes("WAV") ? "#8b5cf6" : "#3b82f6";

                return (
                  <div key={asset.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "#27272a", borderRadius: "8px",
                    border: "1px solid #3f3f46"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{
                        background: badgeColor, color: "#000", fontWeight: "700",
                        fontSize: "10px", padding: "3px 6px", borderRadius: "4px", minWidth: "38px", textAlign: "center"
                      }}>
                        {asset.asset_type.split("_")[0]}
                      </span>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "500" }}>{asset.filename}</div>
                        <div style={{ fontSize: "11px", color: "#a1a1aa" }}>
                          {asset.asset_type} • {asset.status === "READY" ? "Sẵn sàng" : asset.status}
                        </div>
                      </div>
                    </div>

                    <a 
                      href={`${API_BASE}/dubbing/assets/download/${project.id}/${asset.asset_type.toLowerCase()}`}
                      download
                      style={{
                        background: "#3f3f46", color: "#f4f4f5", textDecoration: "none",
                        padding: "5px 10px", borderRadius: "6px", fontSize: "12px",
                        display: "flex", alignItems: "center", gap: "4px"
                      }}
                    >
                      <Icon name="download" size={13} /> Tải
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pipeline Stage Tracker */}
          <div style={{
            background: "#202023", borderRadius: "10px", padding: "14px 16px",
            border: "1px solid #2e2e33"
          }}>
            <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#a1a1aa", marginBottom: "10px" }}>
              Trạng thái quy trình
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon name="fileText" size={15} color="#10b981" /> Lời thoại
                </span>
                <span style={{ background: "#064e3b", color: "#34d399", fontSize: "11px", padding: "2px 8px", borderRadius: "12px" }}>
                  ● Sẵn sàng
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon name="globe" size={15} color="#10b981" /> Dịch
                </span>
                <span style={{ background: "#064e3b", color: "#34d399", fontSize: "11px", padding: "2px 8px", borderRadius: "12px" }}>
                  ● Sẵn sàng (VI)
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon name="mic" size={15} color="#10b981" /> Lồng tiếng
                </span>
                <span style={{ background: "#064e3b", color: "#34d399", fontSize: "11px", padding: "2px 8px", borderRadius: "12px" }}>
                  ● Sẵn sàng
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon name="type" size={15} color="#10b981" /> Phụ đề
                </span>
                <span style={{ background: "#064e3b", color: "#34d399", fontSize: "11px", padding: "2px 8px", borderRadius: "12px" }}>
                  ● ASS sẵn sàng
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon name="play" size={15} color="#10b981" /> Xuất video
                </span>
                <span style={{ 
                  background: isRendering ? "#78350f" : "#064e3b", 
                  color: isRendering ? "#fde047" : "#34d399", 
                  fontSize: "11px", padding: "2px 8px", borderRadius: "12px" 
                }}>
                  {isRendering ? `● đang render ${renderProgress}%` : "● Đã hoàn thành"}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
