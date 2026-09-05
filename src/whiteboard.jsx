import React, { useState, useRef, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function WhiteboardApp() {
  const [theme, setTheme] = useState(getTheme);
  const [exporting, setExporting] = useState(false);
  const excalidrawRef = useRef(null);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const handleClear = useCallback(() => {
    const api = excalidrawRef.current;
    if (!api) return;

    const appState = api.getAppState();
    api.updateScene({
      elements: [],
      appState: {
        ...appState,
        selectedElementIds: {},
        selectedGroupIds: {},
        editingElement: null,
        editingTextElement: null,
        editingLinearElement: null,
      },
      captureUpdate: "IMMEDIATELY",
    });
    // Fresh blank canvas for a new topic/lesson: wipe undo history so old
    // content can't be brought back by accident.
    api.history.clear();
  }, []);

  const handleExport = useCallback(() => {
    const api = excalidrawRef.current;
    if (!api || exporting) return;

    const elements = api.getSceneElements();
    if (!elements || elements.length === 0) {
      alert("السبورة فارغة — ارسمي شيئاً أولاً قبل الحفظ.");
      return;
    }

    setExporting(true);
    const appState = api.getAppState();
    const files = api.getFiles();

    exportToBlob({
      elements,
      appState: { ...appState, exportWithDarkMode: theme === "dark" },
      files,
      mimeType: "image/png",
      quality: 1,
      maxWidthOrHeight: 2048,
    })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "whiteboard-" + Date.now() + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch((err) => {
        console.error("Export failed:", err);
        alert("تعذر حفظ الصورة — حاولي مرة أخرى.");
      })
      .finally(() => setExporting(false));
  }, [exporting, theme]);

  return (
    <>
      <div className="whiteboard-toolbar">
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={handleClear}
        >
          🗑️ مسح الكل
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? "⏳ جاري الحفظ..." : "📥 حفظ كصورة (PNG)"}
        </button>
      </div>
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={(api) => { excalidrawRef.current = api; }}
          theme={theme}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
            },
          }}
        />
      </div>
    </>
  );
}

const root = createRoot(document.getElementById("whiteboard-root"));
root.render(<WhiteboardApp />);