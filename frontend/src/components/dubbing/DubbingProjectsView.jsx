import React, { useState, useEffect, useRef } from "react";
import { Icon } from "../Icons";
import { 
  getDubbingFolders, 
  createDubbingFolder, 
  updateDubbingFolder,
  deleteDubbingFolder,
  getDubbingProjects, 
  createDubbingProject,
  updateDubbingProject,
  deleteDubbingProject,
  bulkDeleteDubbingProjects,
  uploadDubbingVideo,
  importDubbingUrl,
  autoLocalizeDubbingProject,
  getDubbingCredits,
  getDubbingPipelineProgress,
  getAllDubbingProgress 
} from "../../api";

export default function DubbingProjectsView({ onOpenStudio }) {
  const [folders, setFolders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [credits, setCredits] = useState({ balance: 20000, expire_days: 7 });

  // Chế độ tích chọn (Multi-select Mode) để Xóa / Sửa hàng loạt
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);

  // Edit / Delete Modals & Context Menus State
  const [activeMenuProjectId, setActiveMenuProjectId] = useState(null);
  const [editingProject, setEditingProject] = useState(null); // { id, name, folder_id }
  const [editingFolder, setEditingFolder] = useState(null); // { id, name }
  const [movingProjectIds, setMovingProjectIds] = useState(null); // array of IDs to move
  const [targetMoveFolderId, setTargetMoveFolderId] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(null); // { type: 'single' | 'bulk' | 'folder', data: ... }

  // Modal Thêm Video
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState("upload"); // Default to upload as seen in user workflow
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [targetFolderId, setTargetFolderId] = useState("");
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [copyrightAccepted, setCopyrightAccepted] = useState(true);
  const [extractMode, setExtractMode] = useState("SPEECH"); // SPEECH or OCR
  const [sourceLang, setSourceLang] = useState("auto");
  const [autoFullPipeline, setAutoFullPipeline] = useState(true);

  // File Upload State
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgressText, setSubmitProgressText] = useState("");

  // Detailed Pipeline Workflow Progress State (Modal view)
  const [pipelineProgress, setPipelineProgress] = useState({
    active: false,
    projectId: null,
    projectName: "",
    percent: 0,
    stage: "idle",
    message: "Đang chuẩn bị...",
    currentStep: 1,
    logs: []
  });

  // Multi-threading Background Tasks (Hỗ trợ chạy đồng thời nhiều video)
  const [backgroundTasks, setBackgroundTasks] = useState({}); // { [id]: { id, name, percent, stage, message, currentStep, totalSteps, logs, isCompleted } }
  const [isMiniWidgetCollapsed, setIsMiniWidgetCollapsed] = useState(false);
  const [activeLogTaskId, setActiveLogTaskId] = useState(null);
  const [isMiniLogOpen, setIsMiniLogOpen] = useState(false);

  // Modal Tạo Thư mục
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    loadData();
  }, [selectedFolderId, searchQuery]);

  const loadData = async () => {
    try {
      const [fRes, pRes, cRes] = await Promise.all([
        getDubbingFolders(),
        getDubbingProjects(selectedFolderId, searchQuery),
        getDubbingCredits()
      ]);
      if (fRes.success) setFolders(fRes.folders || []);
      if (pRes.success) setProjects(pRes.projects || []);
      if (cRes.success) setCredits(cRes.credits || { balance: 20000, expire_days: 7 });
    } catch (e) {
      console.error("Error loading dubbing projects data:", e);
    }
  };

  // Polling loop đa luồng cho các tiến trình chạy ngầm
  useEffect(() => {
    const hasRunning = Object.values(backgroundTasks).some(t => !t.isCompleted);
    if (!hasRunning) return;

    const pollTimer = setInterval(async () => {
      try {
        const res = await getAllDubbingProgress();
        if (res?.success && res.progress) {
          const sProg = res.progress;
          let newlyDone = false;

          setBackgroundTasks(prev => {
            const next = { ...prev };
            for (const [pId, pInfo] of Object.entries(sProg)) {
              if (next[pId]) {
                const wasDone = next[pId].isCompleted;
                const isDone = (pInfo.percent >= 100 || pInfo.stage === "completed" || pInfo.stage === "ready");
                if (!wasDone && isDone) {
                  newlyDone = true;
                }
                next[pId] = {
                  ...next[pId],
                  name: pInfo.project_name || next[pId].name,
                  percent: pInfo.percent,
                  stage: pInfo.stage,
                  message: pInfo.message,
                  currentStep: pInfo.current_step,
                  totalSteps: pInfo.total_steps || 5,
                  logs: pInfo.logs || next[pId].logs,
                  isCompleted: isDone
                };

                // Đồng bộ nếu modal to đang mở task này
                if (pipelineProgress.active && pipelineProgress.projectId === pId) {
                  setPipelineProgress(prevProg => ({
                    ...prevProg,
                    percent: pInfo.percent,
                    stage: pInfo.stage,
                    message: pInfo.message,
                    currentStep: pInfo.current_step,
                    logs: pInfo.logs || prevProg.logs
                  }));
                }
              }
            }
            return next;
          });

          if (newlyDone) {
            loadData();
          }
        }
      } catch (err) {
        console.warn("Error polling all background progress:", err);
      }
    }, 1000);

    return () => clearInterval(pollTimer);
  }, [backgroundTasks, pipelineProgress.active, pipelineProgress.projectId]);

  // Selection & Bulk Operations
  const toggleSelectProject = (projectId) => {
    setSelectedProjectIds(prev => 
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSelectAll = () => {
    if (selectedProjectIds.length === projects.length) {
      setSelectedProjectIds([]);
    } else {
      setSelectedProjectIds(projects.map(p => p.id));
    }
  };

  const handleDeleteSingleProject = async (projectId) => {
    try {
      await deleteDubbingProject(projectId);
      setDeleteDialog(null);
      setActiveMenuProjectId(null);
      setSelectedProjectIds(prev => prev.filter(id => id !== projectId));
      loadData();
    } catch (e) {
      alert("Lỗi khi xóa video: " + e.message);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedProjectIds.length) return;
    try {
      await bulkDeleteDubbingProjects(selectedProjectIds);
      setDeleteDialog(null);
      setSelectedProjectIds([]);
      setIsSelectMode(false);
      loadData();
    } catch (e) {
      alert("Lỗi khi xóa hàng loạt: " + e.message);
    }
  };

  const handleSaveProjectEdit = async (e) => {
    e.preventDefault();
    if (!editingProject) return;
    try {
      await updateDubbingProject(editingProject.id, {
        name: editingProject.name.trim(),
        folder_id: editingProject.folder_id || null
      });
      setEditingProject(null);
      loadData();
    } catch (e) {
      alert("Lỗi khi cập nhật video: " + e.message);
    }
  };

  const handleBulkMove = async (folderId) => {
    if (!movingProjectIds || !movingProjectIds.length) return;
    try {
      await Promise.all(
        movingProjectIds.map(pid => updateDubbingProject(pid, { folder_id: folderId || null }))
      );
      setMovingProjectIds(null);
      setSelectedProjectIds([]);
      setIsSelectMode(false);
      loadData();
    } catch (e) {
      alert("Lỗi khi di chuyển video: " + e.message);
    }
  };

  const handleSaveFolderEdit = async (e) => {
    e.preventDefault();
    if (!editingFolder) return;
    try {
      await updateDubbingFolder(editingFolder.id, { name: editingFolder.name.trim() });
      setEditingFolder(null);
      loadData();
    } catch (e) {
      alert("Lỗi khi đổi tên thư mục: " + e.message);
    }
  };

  const handleDeleteFolder = async (folderId, deleteContents = false) => {
    try {
      await deleteDubbingFolder(folderId, deleteContents);
      setDeleteDialog(null);
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      loadData();
    } catch (e) {
      alert("Lỗi khi xóa thư mục: " + e.message);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|webm|mkv|avi|flv|wmv|m4v)$/i)) {
      alert("Vui lòng chọn định dạng file video (MP4, MOV, WebM, MKV...)");
      return;
    }
    setSelectedFile(file);
    if (!videoTitle.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      setVideoTitle(cleanName);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await createDubbingFolder(newFolderName.trim());
      setNewFolderName("");
      setShowFolderModal(false);
      loadData();
    } catch (e) {
      alert("Lỗi tạo thư mục: " + e.message);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!copyrightAccepted) {
      alert("Vui lòng đồng ý xác nhận bản quyền trước khi tiếp tục.");
      return;
    }

    setIsSubmitting(true);
    const startTimestamp = new Date().toLocaleTimeString("vi-VN", { hour12: false });
    const pTitle = videoTitle.trim() || (selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : "Dự án mới");
    
    // Khởi tạo trạng thái Pipeline Progress cho Modal
    setPipelineProgress({
      active: true,
      projectId: null,
      projectName: pTitle,
      percent: 10,
      stage: "upload",
      message: "Đang tải video lên và phân tích thông số kỹ thuật...",
      currentStep: 1,
      logs: [
        { time: `[${startTimestamp}]`, text: "Bắt đầu tải video lên hệ thống Studio...", highlight: true }
      ]
    });

    try {
      let res;
      if (addMode === "upload") {
        if (!selectedFile) {
          alert("Vui lòng bấm chọn hoặc kéo thả một file video vào ô tải lên.");
          setIsSubmitting(false);
          setPipelineProgress(prev => ({ ...prev, active: false }));
          return;
        }
        res = await uploadDubbingVideo(selectedFile, {
          name: pTitle,
          folder_id: targetFolderId || selectedFolderId || (folders[0]?.id || null),
          auto_transcribe: autoTranscribe
        });
      } else {
        if (!videoUrl.trim()) {
          alert("Vui lòng nhập link video từ TikTok, Douyin hoặc YouTube.");
          setIsSubmitting(false);
          setPipelineProgress(prev => ({ ...prev, active: false }));
          return;
        }
        res = await importDubbingUrl({
          url: videoUrl.trim(),
          name: pTitle,
          folder_id: targetFolderId || selectedFolderId || (folders[0]?.id || null),
          auto_transcribe: autoTranscribe
        });
      }

      if (res && res.success && res.project?.id) {
        const pId = res.project.id;
        const pName = res.project.name || pTitle;
        const uploadTime = new Date().toLocaleTimeString("vi-VN", { hour12: false });

        const initialTask = {
          id: pId,
          name: pName,
          percent: 25,
          stage: "detect",
          message: "Tải video lên thành công! Đang kích hoạt AI nhận diện ngôn ngữ & bóc tách câu thoại...",
          currentStep: 2,
          totalSteps: 5,
          logs: [
            { time: `[${startTimestamp}]`, text: "Bắt đầu tải video lên hệ thống Studio...", highlight: true },
            { time: `[${uploadTime}]`, text: `Khởi tạo dự án thành công: ${pName}`, highlight: true },
            { time: `[${uploadTime}]`, text: "Kích hoạt luồng tự động hoá đa tác vụ...", highlight: false }
          ],
          isCompleted: false
        };

        // Đăng ký vào danh sách đa luồng Background Tasks
        setBackgroundTasks(prev => ({
          ...prev,
          [pId]: initialTask
        }));

        // Cập nhật modal view
        setPipelineProgress({
          active: true,
          projectId: pId,
          projectName: pName,
          percent: 25,
          stage: "detect",
          message: "Tải video lên thành công! Đang kích hoạt AI nhận diện ngôn ngữ & bóc tách câu thoại...",
          currentStep: 2,
          logs: initialTask.logs
        });

        setActiveLogTaskId(pId);

        // Kích hoạt luồng chạy ngầm đa luồng (is_async = true)
        if (autoFullPipeline) {
          autoLocalizeDubbingProject(pId, {
            mode: extractMode,
            source_lang: sourceLang,
            auto_blur: true,
            auto_tts: true,
            is_async: true
          }).catch(autoErr => {
            console.warn("Auto-localization background warning:", autoErr);
          });
        }

        // Reset form để người dùng có thể thêm các video tiếp theo ngay lập tức
        setSelectedFile(null);
        setVideoTitle("");
        setVideoUrl("");
        loadData();

      } else {
        throw new Error(res?.detail || "Không thể tạo dự án video.");
      }
    } catch (err) {
      alert("Lỗi khi thêm video: " + err.message);
      setPipelineProgress(prev => ({ ...prev, active: false }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentFolder = folders.find(f => f.id === selectedFolderId);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#09090b", color: "#f4f4f5", minHeight: "100vh" }}>
      {/* Main Container */}
      <div style={{ padding: "32px 40px", flex: 1, maxWidth: "1400px", width: "100%", margin: "0 auto" }}>
        
        {/* Title & Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "700", margin: "0 0 4px 0" }}>Studio</h1>
            <p style={{ margin: 0, color: "#a1a1aa", fontSize: "13px" }}>
              Quản lý và review các video của bạn.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button 
              onClick={() => setShowFolderModal(true)}
              style={{
                background: "#18181b", color: "#f4f4f5", border: "1px solid #27272a",
                padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "500",
                display: "flex", alignItems: "center", gap: "6px", cursor: "pointer"
              }}
            >
              <Icon name="folder" size={15} color="#10b981" /> Thư mục mới
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              style={{
                background: "#10b981", color: "#000", border: "none",
                padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: "600",
                display: "flex", alignItems: "center", gap: "6px", cursor: "pointer"
              }}
            >
              <Icon name="plus" size={15} /> Thêm video
            </button>
          </div>
        </div>

        {/* Breadcrumb if inside folder */}
        {selectedFolderId && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", fontSize: "13px" }}>
            <span 
              onClick={() => setSelectedFolderId(null)}
              style={{ color: "#a1a1aa", cursor: "pointer" }}
            >
              Studio
            </span>
            <span style={{ color: "#52525b" }}>&gt;</span>
            <span style={{ color: "#fff", fontWeight: "600" }}>{currentFolder?.name}</span>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px"
        }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: "10px",
            background: "#18181b", border: "1px solid #27272a", borderRadius: "8px",
            padding: "8px 14px"
          }}>
            <Icon name="search" size={15} color="#71717a" />
            <input 
              type="text"
              placeholder="Tìm theo tên hoặc nguồn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: "transparent", border: "none", color: "#fff",
                outline: "none", width: "100%", fontSize: "13px"
              }}
            />
          </div>

          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: "#18181b", border: "1px solid #27272a", color: "#d4d4d8",
              padding: "8px 14px", borderRadius: "8px", fontSize: "13px", outline: "none", cursor: "pointer"
            }}
          >
            <option value="all">Tất cả loại</option>
            <option value="tiktok">TikTok</option>
            <option value="douyin">Douyin</option>
            <option value="youtube">YouTube</option>
          </select>

          <select 
            style={{
              background: "#18181b", border: "1px solid #27272a", color: "#d4d4d8",
              padding: "8px 14px", borderRadius: "8px", fontSize: "13px", outline: "none", cursor: "pointer"
            }}
          >
            <option>Sắp xếp theo trạng thái</option>
            <option>Mới nhất trước</option>
            <option>Cũ nhất trước</option>
          </select>

          <button 
            onClick={() => {
              const nextMode = !isSelectMode;
              setIsSelectMode(nextMode);
              if (!nextMode) {
                setSelectedProjectIds([]);
              }
            }}
            style={{
              background: isSelectMode ? "rgba(16, 185, 129, 0.15)" : "#18181b", 
              border: isSelectMode ? "1px solid #10b981" : "1px solid #27272a", 
              color: isSelectMode ? "#10b981" : "#a1a1aa",
              padding: "8px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "6px",
              fontWeight: isSelectMode ? "600" : "400",
              transition: "all 0.15s ease"
            }}
          >
            <Icon name="checkSquare" size={14} color={isSelectMode ? "#10b981" : "#a1a1aa"} /> 
            {isSelectMode ? (selectedProjectIds.length > 0 ? `Đang chọn (${selectedProjectIds.length})` : "Đang chọn") : "Chọn"}
          </button>
        </div>

        {/* Section: THƯ MỤC (Folders) */}
        {!selectedFolderId && (
          <div style={{ marginBottom: "36px" }}>
            <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#71717a", marginBottom: "14px", letterSpacing: "0.05em" }}>
              THƯ MỤC
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
              {/* Card Thư mục mới */}
              <div 
                onClick={() => setShowFolderModal(true)}
                style={{
                  border: "2px dashed #27272a", borderRadius: "12px", height: "140px",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: "10px", cursor: "pointer", transition: "border-color 0.2s ease"
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: "50%", background: "#18181b",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Icon name="plus" size={20} color="#71717a" />
                </div>
                <span style={{ fontSize: "13px", color: "#a1a1aa", fontWeight: "500" }}>Thư mục mới</span>
              </div>

              {/* Folders List */}
              {folders.map(folder => (
                <div 
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  style={{
                    background: "#18181b", borderRadius: "12px", border: "1px solid #27272a",
                    height: "140px", padding: "16px", cursor: "pointer",
                    display: "flex", flexDirection: "column", justifyContent: "space-between",
                    position: "relative",
                    transition: "transform 0.15s ease, border-color 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <Icon name="folder" size={22} color="#10b981" />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "11px", background: "#27272a", color: "#a1a1aa", padding: "2px 8px", borderRadius: "10px" }}>
                        {folder.project_count || 0} video
                      </span>

                      {/* Nút sửa tên thư mục */}
                      <button
                        title="Đổi tên thư mục"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolder({ id: folder.id, name: folder.name });
                        }}
                        style={{
                          background: "transparent", border: "none", color: "#71717a", cursor: "pointer",
                          padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#10b981"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "#71717a"}
                      >
                        <Icon name="edit" size={13} />
                      </button>

                      {/* Nút xóa thư mục */}
                      <button
                        title="Xóa thư mục"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialog({ type: "folder", data: folder });
                        }}
                        style={{
                          background: "transparent", border: "none", color: "#71717a", cursor: "pointer",
                          padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "#71717a"}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: "600", fontSize: "14px", color: "#fff", marginBottom: "4px" }}>
                      {folder.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#71717a" }}>
                      Bấm để mở thư mục
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section: VIDEO (Projects Grid) */}
        <div>
          <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#71717a", marginBottom: "14px", letterSpacing: "0.05em" }}>
            VIDEO ({projects.length})
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
            {/* Card Thêm video */}
            <div 
              onClick={() => setShowAddModal(true)}
              style={{
                border: "2px dashed #27272a", borderRadius: "12px", height: "230px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: "10px", cursor: "pointer"
              }}
            >
              <div style={{
                width: "48px", height: "48px", borderRadius: "50%", background: "#18181b",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Icon name="plus" size={22} color="#71717a" />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>Thêm video</div>
                <div style={{ fontSize: "11px", color: "#71717a" }}>Từ link hoặc tải lên</div>
              </div>
            </div>

            {/* Video Cards */}
            {projects.map(proj => {
              const isSelected = selectedProjectIds.includes(proj.id);
              return (
                <div 
                  key={proj.id}
                  onClick={() => {
                    if (isSelectMode) {
                      toggleSelectProject(proj.id);
                    }
                  }}
                  style={{
                    background: "#18181b", borderRadius: "12px", 
                    border: isSelected ? "1px solid #10b981" : "1px solid #27272a",
                    boxShadow: isSelected ? "0 0 0 1px #10b981, 0 4px 16px rgba(16, 185, 129, 0.15)" : "none",
                    overflow: "hidden", display: "flex", flexDirection: "column",
                    position: "relative",
                    cursor: isSelectMode ? "pointer" : "default",
                    transition: "all 0.15s ease"
                  }}
                >
                  {/* Thumbnail Header */}
                  <div style={{
                    height: "140px", background: "#000", position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {/* Checkbox overlay */}
                    {(isSelectMode || isSelected) && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectProject(proj.id);
                        }}
                        style={{
                          position: "absolute", top: "10px", left: "10px", zIndex: 10,
                          width: "24px", height: "24px", borderRadius: "6px",
                          background: isSelected ? "#10b981" : "rgba(0, 0, 0, 0.65)",
                          border: isSelected ? "2px solid #10b981" : "2px solid rgba(255, 255, 255, 0.7)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.5)"
                        }}
                      >
                        {isSelected && (
                          <Icon name="check" size={16} color="#000" />
                        )}
                      </div>
                    )}

                    {proj.thumbnail_url ? (
                      <img 
                        src={proj.thumbnail_url} 
                        alt="" 
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                      />
                    ) : (
                      <div style={{ color: "#fff", fontSize: "14px", fontWeight: "700", textAlign: "center", padding: "10px" }}>
                        如果你剪辑的效率
                      </div>
                    )}

                    {/* Duration badge */}
                    <span style={{
                      position: "absolute", bottom: "8px", right: "8px",
                      background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: "11px",
                      padding: "2px 6px", borderRadius: "4px", fontWeight: "600"
                    }}>
                      {Math.floor((proj.duration_ms || 590000) / 60000)}:
                      {Math.floor(((proj.duration_ms || 590000) % 60000) / 1000).toString().padStart(2, "0")}
                    </span>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div style={{
                        fontWeight: "600", fontSize: "13px", color: "#fff",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "6px"
                      }} title={proj.name}>
                        {proj.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#71717a", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{proj.segment_count || 74} segments</span>
                        <span>•</span>
                        <span>{proj.folder_name || "Mặc định"}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenStudio) onOpenStudio(proj.id);
                        }}
                        style={{
                          flex: 1, background: "#f4f4f5", color: "#000", border: "none",
                          padding: "8px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
                          cursor: "pointer"
                        }}
                      >
                        Mở Studio
                      </button>

                      {/* 3-dots Context Menu Button */}
                      <div style={{ position: "relative" }}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuProjectId(activeMenuProjectId === proj.id ? null : proj.id);
                          }}
                          style={{
                            background: activeMenuProjectId === proj.id ? "#3f3f46" : "#27272a", 
                            border: "none", color: "#a1a1aa",
                            padding: "8px", borderRadius: "6px", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}
                        >
                          <Icon name="moreHorizontal" size={14} />
                        </button>

                        {/* Dropdown Menu */}
                        {activeMenuProjectId === proj.id && (
                          <>
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuProjectId(null);
                              }}
                              style={{ position: "fixed", inset: 0, zIndex: 90 }}
                            />
                            
                            <div style={{
                              position: "absolute", right: 0, bottom: "40px", width: "180px",
                              background: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px",
                              padding: "6px", zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                              display: "flex", flexDirection: "column", gap: "2px"
                            }}>
                              {/* Sửa / Đổi tên */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuProjectId(null);
                                  setEditingProject({ id: proj.id, name: proj.name, folder_id: proj.folder_id || "" });
                                }}
                                style={{
                                  background: "transparent", border: "none", color: "#f4f4f5",
                                  padding: "8px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: "8px", textAlign: "left", width: "100%"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "#27272a"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                <Icon name="edit" size={13} color="#10b981" />
                                <span>Sửa / Đổi tên</span>
                              </button>

                              {/* Chuyển thư mục */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuProjectId(null);
                                  setMovingProjectIds([proj.id]);
                                  setTargetMoveFolderId(proj.folder_id || "");
                                }}
                                style={{
                                  background: "transparent", border: "none", color: "#f4f4f5",
                                  padding: "8px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: "8px", textAlign: "left", width: "100%"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "#27272a"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                <Icon name="folder" size={13} color="#3b82f6" />
                                <span>Chuyển thư mục</span>
                              </button>

                              {/* Tích chọn video */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuProjectId(null);
                                  setIsSelectMode(true);
                                  toggleSelectProject(proj.id);
                                }}
                                style={{
                                  background: "transparent", border: "none", color: "#f4f4f5",
                                  padding: "8px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: "8px", textAlign: "left", width: "100%"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "#27272a"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                <Icon name="checkSquare" size={13} color="#f59e0b" />
                                <span>{isSelected ? "Bỏ chọn video" : "Chọn video này"}</span>
                              </button>

                              <div style={{ height: "1px", background: "#27272a", margin: "4px 0" }} />

                              {/* Xóa video */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuProjectId(null);
                                  setDeleteDialog({ type: "single", data: proj });
                                }}
                                style={{
                                  background: "transparent", border: "none", color: "#ef4444",
                                  padding: "8px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: "8px", textAlign: "left", width: "100%"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                <Icon name="trash" size={13} color="#ef4444" />
                                <span>Xóa video</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating Bulk Action Bar */}
        {isSelectMode && (
          <div style={{
            position: "fixed",
            bottom: "28px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(24, 24, 27, 0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid #3f3f46",
            borderRadius: "14px",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            zIndex: 90,
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={handleSelectAll}
                style={{
                  background: "#27272a", border: "1px solid #3f3f46", color: "#f4f4f5",
                  padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                  fontWeight: "500"
                }}
              >
                {selectedProjectIds.length === projects.length && projects.length > 0 ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </button>
              <span style={{ fontSize: "13px", color: "#a1a1aa" }}>
                Đã chọn <strong style={{ color: "#10b981" }}>{selectedProjectIds.length}</strong> / {projects.length} video
              </span>
            </div>

            <div style={{ width: "1px", height: "20px", background: "#3f3f46" }} />

            {/* Di chuyển hàng loạt vào thư mục */}
            <button
              disabled={selectedProjectIds.length === 0}
              onClick={() => {
                setMovingProjectIds(selectedProjectIds);
                setTargetMoveFolderId("");
              }}
              style={{
                background: selectedProjectIds.length === 0 ? "#27272a" : "#18181b",
                border: "1px solid #3f3f46",
                color: selectedProjectIds.length === 0 ? "#71717a" : "#f4f4f5",
                padding: "6px 14px", borderRadius: "6px", fontSize: "12px",
                cursor: selectedProjectIds.length === 0 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "6px", fontWeight: "500"
              }}
            >
              <Icon name="folder" size={14} color={selectedProjectIds.length === 0 ? "#71717a" : "#10b981"} />
              Chuyển thư mục ({selectedProjectIds.length})
            </button>

            {/* Xóa hàng loạt */}
            <button
              disabled={selectedProjectIds.length === 0}
              onClick={() => {
                setDeleteDialog({
                  type: "bulk",
                  data: { count: selectedProjectIds.length, ids: selectedProjectIds }
                });
              }}
              style={{
                background: selectedProjectIds.length === 0 ? "#27272a" : "rgba(239, 68, 68, 0.15)",
                border: selectedProjectIds.length === 0 ? "1px solid #3f3f46" : "1px solid #ef4444",
                color: selectedProjectIds.length === 0 ? "#71717a" : "#ef4444",
                padding: "6px 14px", borderRadius: "6px", fontSize: "12px",
                cursor: selectedProjectIds.length === 0 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "6px", fontWeight: "600"
              }}
            >
              <Icon name="trash" size={14} color={selectedProjectIds.length === 0 ? "#71717a" : "#ef4444"} />
              Xóa ({selectedProjectIds.length})
            </button>

            <div style={{ width: "1px", height: "20px", background: "#3f3f46" }} />

            {/* Thoát chế độ chọn */}
            <button
              onClick={() => {
                setIsSelectMode(false);
                setSelectedProjectIds([]);
              }}
              style={{
                background: "transparent", border: "none", color: "#a1a1aa",
                padding: "4px 8px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "4px"
              }}
            >
              <Icon name="x" size={14} /> Thoát
            </button>
          </div>
        )}

      </div>

      {/* Modal: Thêm Video (File / URL) */}
      {showAddModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#18181b", color: "#f4f4f5", width: "560px", maxWidth: "95vw",
            borderRadius: "14px", border: "1px solid #27272a", padding: "24px"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {pipelineProgress.active && (
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "8px", background: "#10b981",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <Icon name="zap" size={16} color="#000" />
                  </div>
                )}
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>
                  {pipelineProgress.active ? "Tiến trình tự động hoá Studio" : "Thêm video mới"}
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {pipelineProgress.active && (
                  <button 
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setPipelineProgress(prev => ({ ...prev, active: false }));
                    }}
                    title="Thu nhỏ cửa sổ (Tiến trình vẫn tiếp tục chạy ngầm đa luồng)"
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid #10b981",
                      color: "#10b981",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span>—</span> Thu nhỏ
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    if (pipelineProgress.active) {
                      setPipelineProgress(prev => ({ ...prev, active: false }));
                    }
                  }}
                  title="Đóng cửa sổ (Tiến trình vẫn tiếp tục chạy đa luồng)"
                  style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
            </div>

            {!pipelineProgress.active ? (
              <>
                {/* Mode Switch Tabs */}
            <div style={{
              display: "flex", borderBottom: "1px solid #27272a", marginBottom: "20px"
            }}>
              <button 
                onClick={() => setAddMode("url")}
                style={{
                  flex: 1, padding: "10px", background: "transparent", border: "none",
                  borderBottom: addMode === "url" ? "2px solid #10b981" : "none",
                  color: addMode === "url" ? "#10b981" : "#a1a1aa", fontWeight: "600",
                  cursor: "pointer", fontSize: "13px"
                }}
              >
                Từ URL (TikTok / Douyin)
              </button>
              <button 
                onClick={() => setAddMode("upload")}
                style={{
                  flex: 1, padding: "10px", background: "transparent", border: "none",
                  borderBottom: addMode === "upload" ? "2px solid #10b981" : "none",
                  color: addMode === "upload" ? "#10b981" : "#a1a1aa", fontWeight: "600",
                  cursor: "pointer", fontSize: "13px"
                }}
              >
                Tải file lên
              </button>
            </div>

            <form onSubmit={handleCreateProject}>
              {addMode === "url" ? (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>
                    Link video (TikTok / Douyin / YouTube)
                  </label>
                  <input 
                    type="url"
                    required
                    placeholder="https://www.douyin.com/video/... hoặc https://www.tiktok.com/@..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    disabled={isSubmitting}
                    style={{
                      width: "100%", padding: "10px 12px", background: "#27272a",
                      border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px"
                    }}
                  />
                </div>
              ) : (
                <div style={{ marginBottom: "16px" }}>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />

                  {selectedFile ? (
                    <div style={{
                      border: "1px solid #10b981", borderRadius: "10px", padding: "16px 20px",
                      background: "rgba(16, 185, 129, 0.08)", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: "14px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                        <div style={{
                          width: "42px", height: "42px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                        }}>
                          <Icon name="check" size={22} color="#10b981" />
                        </div>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{ fontWeight: "600", fontSize: "13px", color: "#fff", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {selectedFile.name}
                          </div>
                          <div style={{ fontSize: "11px", color: "#a1a1aa", marginTop: "2px" }}>
                            {formatFileSize(selectedFile.size)} • Sẵn sàng tải lên
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            background: "#27272a", color: "#f4f4f5", border: "1px solid #3f3f46",
                            padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: isSubmitting ? "not-allowed" : "pointer"
                          }}
                        >
                          Đổi file
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          style={{
                            background: "transparent", color: "#ef4444", border: "none",
                            padding: "6px 8px", borderRadius: "6px", fontSize: "12px", cursor: isSubmitting ? "not-allowed" : "pointer"
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={() => !isSubmitting && fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.[0]) {
                          handleFileSelect(e.dataTransfer.files[0]);
                        }
                      }}
                      style={{
                        border: isDragging ? "2px dashed #10b981" : "2px dashed #3f3f46",
                        borderRadius: "10px", padding: "32px 20px",
                        textAlign: "center", cursor: isSubmitting ? "not-allowed" : "pointer",
                        background: isDragging ? "rgba(16, 185, 129, 0.08)" : "#202023",
                        transition: "all 0.2s ease"
                      }}
                    >
                      <Icon name="upload" size={32} color="#10b981" style={{ marginBottom: "8px" }} />
                      <div style={{ fontWeight: "600", fontSize: "13px", color: "#38bdf8" }}>
                        Kéo và thả file video vào đây
                      </div>
                      <div style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>
                        Hỗ trợ MP4, MOV, WebM. Kích thước tối đa: 50 GB
                      </div>
                      <div style={{
                        marginTop: "10px", display: "inline-block",
                        background: "#27272a", color: "#a1a1aa", fontSize: "11px",
                        padding: "4px 10px", borderRadius: "6px", border: "1px solid #3f3f46"
                      }}>
                        Bấm vào đây để chọn file từ máy tính
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>
                  Tên video (Tùy chọn)
                </label>
                <input 
                  type="text"
                  placeholder="vd: Clip review sản phẩm"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%", padding: "10px 12px", background: "#27272a",
                    border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px"
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>
                  Thư mục đích
                </label>
                <select 
                  value={targetFolderId}
                  onChange={(e) => setTargetFolderId(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%", padding: "10px 12px", background: "#27272a",
                    border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px"
                  }}
                >
                  <option value="">Thư mục mặc định</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Extraction Mode & Source Language */}
              <div style={{ marginBottom: "16px", background: "#1f1f23", padding: "12px", borderRadius: "8px", border: "1px solid #27272a" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#f4f4f5", marginBottom: "8px" }}>
                  Phương thức nhận diện lời thoại & phụ đề
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setExtractMode("SPEECH")}
                    style={{
                      padding: "8px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
                      background: extractMode === "SPEECH" ? "rgba(16, 185, 129, 0.15)" : "#27272a",
                      border: extractMode === "SPEECH" ? "1px solid #10b981" : "1px solid #3f3f46",
                      color: extractMode === "SPEECH" ? "#10b981" : "#a1a1aa",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                    }}
                  >
                    🎙️ Nghe giọng nói (Whisper)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtractMode("OCR")}
                    style={{
                      padding: "8px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
                      background: extractMode === "OCR" ? "rgba(16, 185, 129, 0.15)" : "#27272a",
                      border: extractMode === "OCR" ? "1px solid #10b981" : "1px solid #3f3f46",
                      color: extractMode === "OCR" ? "#10b981" : "#a1a1aa",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                    }}
                  >
                    🔍 Quét phụ đề (OCR)
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <label style={{ fontSize: "12px", color: "#a1a1aa" }}>Ngôn ngữ video gốc:</label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    style={{
                      background: "#27272a", color: "#fff", border: "1px solid #3f3f46",
                      padding: "6px 10px", borderRadius: "6px", fontSize: "12px", outline: "none"
                    }}
                  >
                    <option value="auto">🌐 Tự động nhận diện (Trung, Anh, Hàn, Nhật...)</option>
                    <option value="zh">🇨🇳 Tiếng Trung (中文)</option>
                    <option value="en">🇺🇸 Tiếng Anh (English)</option>
                    <option value="ko">🇰🇷 Tiếng Hàn (한국어)</option>
                    <option value="ja">🇯🇵 Tiếng Nhật (日本語)</option>
                  </select>
                </div>
              </div>

              {/* Automation Checklist & Retention policy */}
              <div style={{
                marginBottom: "16px", padding: "12px", borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)"
              }}>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#10b981", marginBottom: "6px" }}>
                  ✨ Quy trình tự động hoá toàn diện:
                </div>
                <div style={{ fontSize: "11px", color: "#a1a1aa", lineHeight: "1.6" }}>
                  <div>✓ Nhận diện chính xác ngôn ngữ ({extractMode === "SPEECH" ? "qua giọng nói Whisper" : "qua phụ đề OCR"})</div>
                  <div>✓ Dịch chuyển sang Tiếng Việt chuẩn ngữ nghĩa</div>
                  <div>✓ Xóa/Làm mờ phụ đề cũ trên màn hình (Blur Box)</div>
                  <div>✓ Lồng tiếng AI Microsoft Neural tiếng Việt chuẩn</div>
                  <div>✓ Tạo phụ đề ASS vàng viền đen phong cách Studio</div>
                  <div>⏱️ Tự động xoá sau 24h bảo vệ dung lượng lưu trữ</div>
                </div>
              </div>

              {/* Checkboxes */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "#d4d4d8", cursor: "pointer" }}>
                  <input 
                    type="checkbox" 
                    checked={copyrightAccepted} 
                    onChange={(e) => setCopyrightAccepted(e.target.checked)}
                    disabled={isSubmitting}
                    required
                    style={{ marginTop: "2px" }}
                  />
                  <span>Tôi xác nhận sở hữu hoặc được phép sử dụng video này. Tool không xóa watermark và không bảo đảm né bản quyền.</span>
                </label>

                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "#d4d4d8", cursor: "pointer" }}>
                  <input 
                    type="checkbox" 
                    checked={autoFullPipeline} 
                    onChange={(e) => setAutoFullPipeline(e.target.checked)}
                    disabled={isSubmitting}
                    style={{ marginTop: "2px" }}
                  />
                  <span style={{ fontWeight: "600", color: "#10b981" }}>Tự động thực hiện hết các chức năng trên ngay khi video được tạo</span>
                </label>
              </div>

              {/* Progress text when submitting */}
              {isSubmitting && (
                <div style={{
                  marginBottom: "16px", padding: "10px 14px", borderRadius: "8px",
                  background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)",
                  display: "flex", alignItems: "center", gap: "10px", color: "#10b981", fontSize: "13px"
                }}>
                  <div style={{
                    width: "14px", height: "14px", border: "2px solid #10b981",
                    borderTopColor: "transparent", borderRadius: "50%",
                    animation: "spin 0.8s linear infinite"
                  }} />
                  <span>{submitProgressText || "Đang xử lý..."}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
                <button 
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedFile(null);
                  }}
                  style={{
                    background: "#27272a", color: "#f4f4f5", border: "none",
                    padding: "8px 16px", borderRadius: "8px", fontSize: "13px",
                    cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.6 : 1
                  }}
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: isSubmitting ? "#059669" : "#10b981", color: "#000", border: "none",
                    padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: "600",
                    cursor: isSubmitting ? "not-allowed" : "pointer"
                  }}
                >
                  {isSubmitting ? "Đang xử lý..." : "🚀 Xác nhận & Bắt đầu tạo"}
                </button>
              </div>
            </form>
          </>
        ) : (
          /* DEDICATED REALTIME WORKFLOW PIPELINE PROGRESS TRACKER */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" }}>
            {/* Progress Overview & Big Percentage */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderRadius: "10px",
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%)",
              border: "1px solid rgba(16, 185, 129, 0.3)"
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "700" }}>
                  TIẾN TRÌNH XỬ LÝ STUDIO
                </div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginTop: "2px" }}>
                  {pipelineProgress.percent === 100 ? "Đã hoàn tất tự động hoá!" : "Đang thực thi các mô hình AI..."}
                </div>
              </div>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#10b981", fontFamily: "monospace" }}>
                {pipelineProgress.percent}%
              </div>
            </div>

            {/* Animated Gradient Progress Bar */}
            <div style={{ width: "100%", height: "10px", background: "#27272a", borderRadius: "6px", overflow: "hidden", border: "1px solid #3f3f46" }}>
              <div style={{
                width: `${pipelineProgress.percent}%`,
                height: "100%",
                background: "linear-gradient(90deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)",
                borderRadius: "6px",
                transition: "width 0.4s ease-out",
                boxShadow: "0 0 16px rgba(16, 185, 129, 0.6)"
              }} />
            </div>

            {/* Current Active Step Banner */}
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 16px", borderRadius: "8px",
              background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)"
            }}>
              {pipelineProgress.percent < 100 ? (
                <div style={{
                  width: "16px", height: "16px", border: "2px solid #10b981",
                  borderTopColor: "transparent", borderRadius: "50%",
                  animation: "spin 0.8s linear infinite", flexShrink: 0
                }} />
              ) : (
                <span style={{ fontSize: "16px" }}>🎉</span>
              )}
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#34d399", flex: 1, lineHeight: "1.4" }}>
                {pipelineProgress.message}
              </div>
            </div>

            {/* 5 Visual Pipeline Step Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { id: 1, title: "1. Tải video lên & Khởi tạo dự án", desc: "Phân tích độ phân giải, bitrate và trích xuất audio 16kHz" },
                { id: 2, title: "2. Nhận diện ngôn ngữ & Bóc tách lời thoại", desc: "AI Faster-Whisper / RapidOCR chính xác từng millisecond" },
                { id: 3, title: "3. Dịch thuật sang Tiếng Việt chuẩn ngữ nghĩa", desc: "Dịch song song đa luồng Google GTX tự nhiên, lưu loát" },
                { id: 4, title: "4. Lồng tiếng AI Microsoft Neural (Edge-TTS)", desc: "Giọng đọc truyền cảm Hoài My / Nam Minh khớp timing câu thoại" },
                { id: 5, title: "5. Xóa mờ phụ đề cũ & Tạo phụ đề ASS Studio", desc: "Tự động sinh Blur Box che chữ gốc & đóng gói dự án lưu trữ 24h" }
              ].map(step => {
                const isDone = pipelineProgress.percent === 100 || step.id < pipelineProgress.currentStep;
                const isCurrent = step.id === pipelineProgress.currentStep && pipelineProgress.percent < 100;
                
                return (
                  <div 
                    key={step.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: "8px",
                      background: isCurrent ? "rgba(16, 185, 129, 0.12)" : isDone ? "rgba(16, 185, 129, 0.05)" : "#202023",
                      border: isCurrent ? "1px solid #10b981" : isDone ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid #27272a",
                      transition: "all 0.3s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "24px", height: "24px", borderRadius: "50%",
                        background: isDone ? "#10b981" : isCurrent ? "#065f46" : "#27272a",
                        color: isDone ? "#000" : isCurrent ? "#34d399" : "#71717a",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: "700", flexShrink: 0
                      }}>
                        {isDone ? "✓" : isCurrent ? "▶" : step.id}
                      </div>
                      <div>
                        <div style={{
                          fontSize: "13px", fontWeight: isCurrent ? "700" : "600",
                          color: isDone ? "#fff" : isCurrent ? "#34d399" : "#a1a1aa"
                        }}>
                          {step.title}
                        </div>
                        <div style={{ fontSize: "11px", color: isCurrent ? "#a7f3d0" : "#71717a", marginTop: "1px" }}>
                          {step.desc}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isDone && (
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#10b981", background: "rgba(16, 185, 129, 0.18)", padding: "2px 8px", borderRadius: "10px" }}>
                          Xong ✓
                        </span>
                      )}
                      {isCurrent && (
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#34d399", background: "rgba(16, 185, 129, 0.25)", padding: "2px 8px", borderRadius: "10px" }}>
                          Đang chạy...
                        </span>
                      )}
                      {!isDone && !isCurrent && (
                        <span style={{ fontSize: "11px", color: "#52525b" }}>
                          Chờ
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Realtime Terminal / Activity Logs */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#71717a", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Nhật ký xử lý chi tiết (Real-time Logs)
              </div>
              <div style={{
                background: "#09090b", borderRadius: "8px", border: "1px solid #27272a",
                padding: "10px 14px", maxHeight: "110px", overflowY: "auto",
                fontSize: "11px", fontFamily: "monospace", color: "#a1a1aa", display: "flex", flexDirection: "column", gap: "4px"
              }}>
                {pipelineProgress.logs.map((log, idx) => (
                  <div key={idx} style={{ color: log.highlight ? "#10b981" : "#a1a1aa" }}>
                    <span style={{ color: "#71717a", marginRight: "6px" }}>{log.time}</span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginTop: "10px", paddingTop: "12px", borderTop: "1px solid #27272a"
            }}>
              <div style={{ fontSize: "11px", color: "#71717a" }}>
                💡 Đóng hoặc thu nhỏ cửa sổ này, tiến trình vẫn tiếp tục chạy ngầm đa luồng.
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setPipelineProgress(prev => ({ ...prev, active: false }));
                }}
                style={{
                  background: "#27272a",
                  border: "1px solid #3f3f46",
                  color: "#e4e4e7",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>—</span> Thu nhỏ xuống góc
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
      )}

      {/* Modal: Thư mục mới */}
      {showFolderModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#18181b", color: "#f4f4f5", width: "420px", maxWidth: "90vw",
            borderRadius: "14px", border: "1px solid #27272a", padding: "20px"
          }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "16px", fontWeight: "600" }}>Tạo thư mục mới</h3>
            <form onSubmit={handleCreateFolder}>
              <input 
                type="text"
                autoFocus
                placeholder="Tên thư mục (vd: ketqua-11-9)"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", background: "#27272a",
                  border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px",
                  marginBottom: "16px"
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button 
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  style={{ background: "#27272a", color: "#a1a1aa", border: "none", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  style={{ background: "#10b981", color: "#000", border: "none", padding: "8px 18px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", fontSize: "12px" }}
                >
                  Tạo thư mục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Chỉnh sửa Video (Đổi tên & Thư mục) */}
      {editingProject && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#18181b", color: "#f4f4f5", width: "460px", maxWidth: "90vw",
            borderRadius: "14px", border: "1px solid #27272a", padding: "24px"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="edit" size={16} color="#10b981" /> Chỉnh sửa thông tin video
              </h3>
              <button 
                onClick={() => setEditingProject(null)}
                style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer" }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProjectEdit}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#a1a1aa", marginBottom: "6px" }}>
                  Tên hiển thị video:
                </label>
                <input 
                  type="text"
                  required
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  style={{
                    width: "100%", padding: "10px 12px", background: "#27272a",
                    border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px"
                  }}
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#a1a1aa", marginBottom: "6px" }}>
                  Thuộc thư mục:
                </label>
                <select
                  value={editingProject.folder_id || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, folder_id: e.target.value })}
                  style={{
                    width: "100%", padding: "10px 12px", background: "#27272a",
                    border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px", cursor: "pointer"
                  }}
                >
                  <option value="">-- Mặc định (Không có thư mục) --</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button 
                  type="button"
                  onClick={() => setEditingProject(null)}
                  style={{ background: "#27272a", color: "#a1a1aa", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  style={{ background: "#10b981", color: "#000", border: "none", padding: "8px 20px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", fontSize: "12px" }}
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Di chuyển video vào thư mục */}
      {movingProjectIds && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#18181b", color: "#f4f4f5", width: "420px", maxWidth: "90vw",
            borderRadius: "14px", border: "1px solid #27272a", padding: "24px"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="folder" size={16} color="#3b82f6" /> Di chuyển video
              </h3>
              <button 
                onClick={() => setMovingProjectIds(null)}
                style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer" }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "#a1a1aa", marginBottom: "16px" }}>
              Chọn thư mục đích để chuyển <strong>{movingProjectIds.length}</strong> video đã chọn:
            </p>

            <div style={{ marginBottom: "20px" }}>
              <select
                value={targetMoveFolderId}
                onChange={(e) => setTargetMoveFolderId(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", background: "#27272a",
                  border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px", cursor: "pointer"
                }}
              >
                <option value="">-- Thư mục gốc (Mặc định) --</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>📁 {f.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button 
                type="button"
                onClick={() => setMovingProjectIds(null)}
                style={{ background: "#27272a", color: "#a1a1aa", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
              >
                Hủy
              </button>
              <button 
                type="button"
                onClick={() => handleBulkMove(targetMoveFolderId)}
                style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 20px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", fontSize: "12px" }}
              >
                Di chuyển ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Đổi tên thư mục */}
      {editingFolder && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#18181b", color: "#f4f4f5", width: "420px", maxWidth: "90vw",
            borderRadius: "14px", border: "1px solid #27272a", padding: "20px"
          }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "16px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon name="edit" size={16} color="#10b981" /> Đổi tên thư mục
            </h3>
            <form onSubmit={handleSaveFolderEdit}>
              <input 
                type="text"
                autoFocus
                required
                value={editingFolder.name}
                onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                style={{
                  width: "100%", padding: "10px 12px", background: "#27272a",
                  border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px",
                  marginBottom: "16px"
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button 
                  type="button"
                  onClick={() => setEditingFolder(null)}
                  style={{ background: "#27272a", color: "#a1a1aa", border: "none", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  style={{ background: "#10b981", color: "#000", border: "none", padding: "8px 18px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", fontSize: "12px" }}
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Xóa (Single, Bulk, hoặc Thư mục) */}
      {deleteDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#18181b", color: "#f4f4f5", width: "460px", maxWidth: "90vw",
            borderRadius: "14px", border: "1px solid #3f3f46", padding: "24px"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
              <div style={{
                width: "42px", height: "42px", borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0
              }}>
                <Icon name="trash" size={20} color="#ef4444" />
              </div>
              <div>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: "700", color: "#fff" }}>
                  {deleteDialog.type === "single" && "Xác nhận xóa video"}
                  {deleteDialog.type === "bulk" && `Xóa ${deleteDialog.data?.count} video đã chọn`}
                  {deleteDialog.type === "folder" && `Xóa thư mục "${deleteDialog.data?.name}"`}
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#a1a1aa", lineHeight: "1.5" }}>
                  {deleteDialog.type === "single" && (
                    <>
                      Bạn có chắc chắn muốn xóa video <strong style={{ color: "#fff" }}>"{deleteDialog.data?.name}"</strong> không? 
                      Toàn bộ file âm thanh, phụ đề và thông tin xử lý sẽ bị xóa vĩnh viễn khỏi ổ đĩa.
                    </>
                  )}
                  {deleteDialog.type === "bulk" && (
                    <>
                      Bạn có chắc chắn muốn xóa <strong style={{ color: "#ef4444" }}>{deleteDialog.data?.count}</strong> video đang được tích chọn? 
                      Thao tác này sẽ xóa triệt để dữ liệu và không thể khôi phục.
                    </>
                  )}
                  {deleteDialog.type === "folder" && (
                    <>
                      Bạn có muốn xóa thư mục này không? Bạn có thể chọn chỉ xóa thư mục (giữ lại các video bên trong chuyển ra ngoài) hoặc xóa cả thư mục cùng toàn bộ video bên trong.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button 
                onClick={() => setDeleteDialog(null)}
                style={{
                  background: "#27272a", color: "#d4d4d8", border: "1px solid #3f3f46",
                  padding: "8px 16px", borderRadius: "8px", fontSize: "13px", cursor: "pointer"
                }}
              >
                Hủy
              </button>

              {deleteDialog.type === "single" && (
                <button 
                  onClick={() => handleDeleteSingleProject(deleteDialog.data.id)}
                  style={{
                    background: "#ef4444", color: "#fff", border: "none",
                    padding: "8px 20px", borderRadius: "8px", fontWeight: "600", fontSize: "13px", cursor: "pointer"
                  }}
                >
                  Xóa vĩnh viễn
                </button>
              )}

              {deleteDialog.type === "bulk" && (
                <button 
                  onClick={handleBulkDelete}
                  style={{
                    background: "#ef4444", color: "#fff", border: "none",
                    padding: "8px 20px", borderRadius: "8px", fontWeight: "600", fontSize: "13px", cursor: "pointer"
                  }}
                >
                  Xóa {deleteDialog.data?.count} video
                </button>
              )}

              {deleteDialog.type === "folder" && (
                <>
                  <button 
                    onClick={() => handleDeleteFolder(deleteDialog.data.id, false)}
                    style={{
                      background: "#27272a", color: "#f4f4f5", border: "1px solid #52525b",
                      padding: "8px 14px", borderRadius: "8px", fontSize: "12px", cursor: "pointer"
                    }}
                  >
                    Chỉ xóa thư mục
                  </button>
                  <button 
                    onClick={() => handleDeleteFolder(deleteDialog.data.id, true)}
                    style={{
                      background: "#ef4444", color: "#fff", border: "none",
                      padding: "8px 16px", borderRadius: "8px", fontWeight: "600", fontSize: "12px", cursor: "pointer"
                    }}
                  >
                    Xóa cả thư mục & video
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MINI FLOATING PROGRESS WIDGET (Tiến trình chạy nhỏ góc phải màn hình) */}
      {Object.keys(backgroundTasks).length > 0 && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          right: "24px",
          zIndex: 9990,
          fontFamily: "inherit"
        }}>
          {isMiniWidgetCollapsed ? (
            /* Collapsed Pill Button */
            <button
              onClick={() => setIsMiniWidgetCollapsed(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#18181b",
                border: "1px solid #10b981",
                borderRadius: "30px",
                padding: "8px 16px",
                color: "#f4f4f5",
                boxShadow: "0 8px 30px rgba(0,0,0,0.5), 0 0 15px rgba(16, 185, 129, 0.25)",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              <div style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: Object.values(backgroundTasks).some(t => !t.isCompleted) ? "#10b981" : "#71717a",
                boxShadow: Object.values(backgroundTasks).some(t => !t.isCompleted) ? "0 0 8px #10b981" : "none",
                animation: Object.values(backgroundTasks).some(t => !t.isCompleted) ? "pulse 1.5s infinite" : "none"
              }} />
              <span style={{ fontSize: "13px", fontWeight: "600" }}>
                ⚡ Tiến trình Studio ({Object.values(backgroundTasks).filter(t => !t.isCompleted).length} đang chạy)
              </span>
              <span style={{ fontSize: "11px", color: "#a1a1aa", background: "#27272a", padding: "2px 8px", borderRadius: "10px" }}>
                Mở rộng ▲
              </span>
            </button>
          ) : (
            /* Expanded Multi-Task Card */
            <div style={{
              width: "420px",
              maxWidth: "92vw",
              background: "#18181b",
              borderRadius: "14px",
              border: "1px solid #27272a",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(16, 185, 129, 0.15)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column"
            }}>
              {/* Header */}
              <div style={{
                padding: "12px 16px",
                background: "#202023",
                borderBottom: "1px solid #27272a",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    width: "20px", height: "20px", borderRadius: "6px", background: "#10b981",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <Icon name="zap" size={12} color="#000" />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#f4f4f5" }}>
                    Tiến trình đa luồng Studio
                  </span>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    background: Object.values(backgroundTasks).some(t => !t.isCompleted) ? "rgba(16, 185, 129, 0.2)" : "#27272a",
                    color: Object.values(backgroundTasks).some(t => !t.isCompleted) ? "#10b981" : "#a1a1aa",
                    padding: "2px 8px",
                    borderRadius: "10px"
                  }}>
                    {Object.values(backgroundTasks).filter(t => !t.isCompleted).length} đang chạy
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {Object.values(backgroundTasks).some(t => t.isCompleted) && (
                    <button
                      onClick={() => {
                        setBackgroundTasks(prev => {
                          const next = {};
                          for (const [id, t] of Object.entries(prev)) {
                            if (!t.isCompleted) next[id] = t;
                          }
                          return next;
                        });
                      }}
                      title="Xóa các tác vụ đã hoàn tất khỏi danh sách"
                      style={{
                        background: "transparent", border: "none", color: "#71717a",
                        fontSize: "11px", cursor: "pointer", padding: "2px 6px"
                      }}
                    >
                      Dọn xong
                    </button>
                  )}
                  <button
                    onClick={() => setIsMiniWidgetCollapsed(true)}
                    title="Thu nhỏ thành nút bấm gọn gàng"
                    style={{
                      background: "transparent", border: "none", color: "#a1a1aa",
                      cursor: "pointer", fontSize: "14px", padding: "2px 6px"
                    }}
                  >
                    —
                  </button>
                </div>
              </div>

              {/* Task List */}
              <div style={{
                maxHeight: "260px",
                overflowY: "auto",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                {Object.values(backgroundTasks).map(task => {
                  const isDone = task.isCompleted || task.percent >= 100;
                  const isSelectedForLog = isMiniLogOpen && activeLogTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      style={{
                        background: "#1f1f23",
                        border: isSelectedForLog ? "1px solid #10b981" : isDone ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid #27272a",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        transition: "all 0.2s"
                      }}
                    >
                      {/* Task Title & Status */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{
                          fontSize: "12px", fontWeight: "700", color: "#f4f4f5",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1
                        }} title={task.name}>
                          {task.name}
                        </div>
                        <span style={{
                          fontSize: "11px", fontWeight: "700",
                          color: isDone ? "#10b981" : "#34d399",
                          fontFamily: "monospace"
                        }}>
                          {task.percent}%
                        </span>
                      </div>

                      {/* Mini Progress Bar */}
                      <div style={{ width: "100%", height: "6px", background: "#27272a", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                          width: `${task.percent}%`,
                          height: "100%",
                          background: isDone
                            ? "#10b981"
                            : "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
                          borderRadius: "3px",
                          transition: "width 0.4s ease"
                        }} />
                      </div>

                      {/* Task Message / Current Step */}
                      <div style={{ fontSize: "11px", color: isDone ? "#10b981" : "#a1a1aa", lineHeight: "1.3" }}>
                        {isDone ? "✓ Đã hoàn tất toàn bộ quy trình Studio!" : task.message}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginTop: "2px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeLogTaskId === task.id && isMiniLogOpen) {
                              setIsMiniLogOpen(false);
                            } else {
                              setActiveLogTaskId(task.id);
                              setIsMiniLogOpen(true);
                            }
                          }}
                          style={{
                            background: isSelectedForLog ? "rgba(16, 185, 129, 0.2)" : "#27272a",
                            border: isSelectedForLog ? "1px solid #10b981" : "1px solid #3f3f46",
                            color: isSelectedForLog ? "#10b981" : "#a1a1aa",
                            padding: "3px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer"
                          }}
                        >
                          {isSelectedForLog ? "Đóng log ✕" : "📋 Xem log"}
                        </button>

                        {isDone ? (
                          <button
                            type="button"
                            onClick={() => onSelectProject(task.id)}
                            style={{
                              background: "#10b981", border: "none", color: "#000",
                              padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", cursor: "pointer"
                            }}
                          >
                            Mở Studio ➔
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPipelineProgress({
                                active: true,
                                projectId: task.id,
                                projectName: task.name,
                                percent: task.percent,
                                stage: task.stage,
                                message: task.message,
                                currentStep: task.currentStep || 2,
                                logs: task.logs || []
                              });
                              setShowAddModal(true);
                            }}
                            style={{
                              background: "#27272a", border: "1px solid #3f3f46", color: "#e4e4e7",
                              padding: "3px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer"
                            }}
                          >
                            Phóng to ⤢
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Real-time Log Drawer */}
              {isMiniLogOpen && activeLogTaskId && backgroundTasks[activeLogTaskId] && (
                <div style={{
                  borderTop: "1px solid #27272a",
                  background: "#0d0d10",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#a1a1aa", textTransform: "uppercase" }}>
                      Log thời gian thực: {backgroundTasks[activeLogTaskId].name}
                    </span>
                    <button
                      onClick={() => setIsMiniLogOpen(false)}
                      style={{ background: "transparent", border: "none", color: "#71717a", cursor: "pointer", fontSize: "12px" }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{
                    maxHeight: "130px",
                    overflowY: "auto",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: "#a1a1aa",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                    background: "#09090b",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #202023"
                  }}>
                    {(backgroundTasks[activeLogTaskId].logs || []).map((l, lIdx) => (
                      <div key={lIdx} style={{ color: l.highlight ? "#10b981" : "#a1a1aa" }}>
                        <span style={{ color: "#71717a", marginRight: "6px" }}>{l.time}</span>
                        <span>{l.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
