import React, { useState, useRef, useEffect } from "react";
import { Icon } from "./Icons";
import { useLanguage } from "../i18n";

export default function DocumentStudio({
  notes,
  videos,
  onSaveNote,
  onDeleteNote,
  onSelectVideoForDetail
}) {
  const { t } = useLanguage();
  const [activeNoteId, setActiveNoteId] = useState(() => notes[0]?.id || null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCategory, setCurrentCategory] = useState("news");
  const [linkedVideoId, setLinkedVideoId] = useState("");
  const [saveStatus, setSaveStatus] = useState("Đã lưu");
  const editorRef = useRef(null);

  // When switching notes
  useEffect(() => {
    const found = notes.find((n) => n.id === activeNoteId);
    if (found) {
      setCurrentTitle(found.title);
      setCurrentCategory(found.category || "news");
      setLinkedVideoId(found.linked_video_id || "");
      if (editorRef.current) {
        editorRef.current.innerHTML = found.content_html || "<p>Bắt đầu viết kịch bản hoặc tin tức tại đây...</p>";
      }
    } else if (notes.length === 0) {
      handleCreateNewNote();
    }
  }, [activeNoteId]);

  const handleCreateNewNote = () => {
    const newId = "note_" + Math.random().toString(36).substring(2, 9);
    const newNote = {
      id: newId,
      title: "Tài liệu kịch bản mới",
      content_html: "<h2>Tiêu đề bài viết</h2><p>Nhập nội dung kịch bản hoặc mô tả tin tức...</p>",
      content_text: "Tiêu đề bài viết\nNhập nội dung kịch bản hoặc mô tả tin tức...",
      category: "news",
      linked_video_id: null,
      tags: ["kịch bản", "tin tức"]
    };
    onSaveNote(newNote);
    setActiveNoteId(newId);
  };

  const executeCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  const handleEditorInput = () => {
    setSaveStatus("Đang soạn thảo...");
  };

  const handleSave = () => {
    if (!editorRef.current) return;
    const htmlContent = editorRef.current.innerHTML;
    const textContent = editorRef.current.innerText;

    const noteToSave = {
      id: activeNoteId,
      title: currentTitle.trim() || "Ghi chú không tên",
      content_html: htmlContent,
      content_text: textContent,
      category: currentCategory,
      linked_video_id: linkedVideoId || null,
      tags: []
    };

    onSaveNote(noteToSave);
    setSaveStatus("Đã lưu thành công");
    setTimeout(() => setSaveStatus("Đã lưu"), 2000);
  };

  // Export to Word / Text
  const exportToWord = () => {
    if (!editorRef.current) return;
    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${currentTitle}</title></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h1>${currentTitle}</h1>
        ${editorRef.current.innerHTML}
      </body>
      </html>
    `;
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentTitle || "document"}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const exportToMarkdown = () => {
    if (!editorRef.current) return;
    const text = `# ${currentTitle}\n\n${editorRef.current.innerText}`;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentTitle || "document"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="view-content" style={{ paddingBottom: "10px" }}>
      <div className="doc-studio">
        {/* Left Sidebar: Notes list */}
        <div className="doc-sidebar">
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
              Danh sách kịch bản ({notes.length})
            </span>
            <button className="btn btn-primary btn-sm" onClick={handleCreateNewNote}>
              <Icon name="plus" size={13} color="#fff" />
              <span>Tạo mới</span>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {notes.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 10px", fontSize: "12px" }}>
                Chưa có ghi chú nào. Bấm 'Tạo mới' để bắt đầu.
              </div>
            ) : (
              notes.map((n) => {
                const isActive = n.id === activeNoteId;
                return (
                  <div
                    key={n.id}
                    onClick={() => setActiveNoteId(n.id)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: isActive ? "rgba(139,92,246,0.15)" : "transparent",
                      border: `1px solid ${isActive ? "rgba(139,92,246,0.3)" : "transparent"}`,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: isActive ? "#fff" : "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.title || "Ghi chú không tên"}
                      </span>
                      {notes.length > 1 && (
                        <button
                          className="icon-btn danger"
                          style={{ padding: "2px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Xóa ghi chú "${n.title}"?`)) {
                              onDeleteNote(n.id);
                              if (n.id === activeNoteId) {
                                const remaining = notes.filter(x => x.id !== n.id);
                                if (remaining.length > 0) setActiveNoteId(remaining[0].id);
                              }
                            }
                          }}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {n.category === "news" ? "Tin tức" : n.category === "script" ? "Kịch bản" : "Ghi chú"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Editor Paper (Word Processor Interface) */}
        <div className="doc-editor-paper">
          {/* Top Bar: Title, Category, Actions */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.01)" }}>
            <input
              type="text"
              value={currentTitle}
              onChange={(e) => {
                setCurrentTitle(e.target.value);
                setSaveStatus("Đang soạn thảo...");
              }}
              placeholder="Nhập tiêu đề kịch bản / tin tức..."
              style={{
                background: "transparent",
                border: "none",
                fontSize: "18px",
                fontWeight: 700,
                color: "#fff",
                outline: "none",
                flex: 1
              }}
            />

            <select
              className="form-select"
              style={{ padding: "6px 10px", fontSize: "12px", width: "130px" }}
              value={currentCategory}
              onChange={(e) => {
                setCurrentCategory(e.target.value);
                setSaveStatus("Đang soạn thảo...");
              }}
            >
              <option value="news">📰 Tin tức</option>
              <option value="script">🎬 Kịch bản</option>
              <option value="general">📝 Ghi chú chung</option>
              <option value="ideas">💡 Ý tưởng</option>
            </select>

            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {saveStatus}
            </span>

            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              <Icon name="check" size={13} color="#fff" />
              <span>Lưu</span>
            </button>

            {/* Export buttons */}
            <button className="btn btn-secondary btn-sm" onClick={exportToWord} title="Xuất ra file Word (.doc)">
              <Icon name="download" size={13} />
              <span>Xuất Word (.doc)</span>
            </button>

            <button className="btn btn-secondary btn-sm" onClick={exportToMarkdown} title="Xuất file Markdown">
              <span>MD</span>
            </button>
          </div>

          {/* Word Format Toolbar */}
          <div className="editor-toolbar">
            <button className="editor-tool-btn" onClick={() => executeCommand("formatBlock", "<h1>")} title="Tiêu đề 1 (H1)">
              <b>H1</b>
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("formatBlock", "<h2>")} title="Tiêu đề 2 (H2)">
              <b>H2</b>
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("formatBlock", "<h3>")} title="Tiêu đề 3 (H3)">
              <b>H3</b>
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("formatBlock", "<p>")} title="Đoạn văn">
              P
            </button>

            <div style={{ width: "1px", height: "20px", background: "var(--border-color)", margin: "0 4px" }} />

            <button className="editor-tool-btn" onClick={() => executeCommand("bold")} title="In đậm (Ctrl+B)">
              <b>B</b>
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("italic")} title="In nghiêng (Ctrl+I)">
              <i>I</i>
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("underline")} title="Gạch chân (Ctrl+U)">
              <u>U</u>
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("strikeThrough")} title="Gạch ngang">
              <s>S</s>
            </button>

            <div style={{ width: "1px", height: "20px", background: "var(--border-color)", margin: "0 4px" }} />

            <button className="editor-tool-btn" onClick={() => executeCommand("insertUnorderedList")} title="Danh sách gạch đầu dòng">
              • List
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("insertOrderedList")} title="Danh sách số 1, 2, 3">
              1. List
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("formatBlock", "<blockquote>")} title="Trích dẫn">
              “ Quote
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("insertHorizontalRule")} title="Đường kẻ ngang">
              ―
            </button>

            <div style={{ width: "1px", height: "20px", background: "var(--border-color)", margin: "0 4px" }} />

            {/* Alignments */}
            <button className="editor-tool-btn" onClick={() => executeCommand("justifyLeft")} title="Căn trái">
              Left
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("justifyCenter")} title="Căn giữa">
              Center
            </button>
            <button className="editor-tool-btn" onClick={() => executeCommand("justifyRight")} title="Căn phải">
              Right
            </button>

            {/* Link to video from vault */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Gắn video:</span>
              <select
                className="form-select"
                style={{ padding: "4px 8px", fontSize: "11px", maxWidth: "200px" }}
                value={linkedVideoId}
                onChange={(e) => setLinkedVideoId(e.target.value)}
              >
                <option value="">-- Không gắn video --</option>
                {videos.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Word Sheet Editable Area */}
          <div
            ref={editorRef}
            className="editor-editable-area"
            contentEditable={true}
            onInput={handleEditorInput}
            suppressContentEditableWarning={true}
          />
        </div>
      </div>
    </div>
  );
}
