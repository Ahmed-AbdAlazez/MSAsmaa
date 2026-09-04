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
    if (api) {
      api.updateScene({ elements: [] });
    }
  }, []);

  const handleExport = useCallback(() => {
    const api = excalidrawRef.current;
    if (!api) return;

    const elements = api.getSceneElements();
    if (!elements || elements.length === 0) {
      alert("السبورة فارغة — ارسمي شيئاً أولاً قبل الحفظ.");
      return;
    }

    const appState = api.getAppState();
    const files = api.getFiles();

    exportToBlob({
      elements,
      appState: { ...appState, exportWithDarkMode: theme === "dark" },
      files,
      mimeType: "image/png",
      quality: 1,
    }).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "سبورة-" + new Date().toLocaleDateString("ar-EG") + ".png";
        a.click();
        URL.revokeObjectURL(url);
      });
  }, [theme]);

  useEffect(() => {
    const clearBtn = document.getElementById("wb-clear-btn");
    const exportBtn = document.getElementById("wb-export-btn");
    if (clearBtn) clearBtn.addEventListener("click", handleClear);
    if (exportBtn) exportBtn.addEventListener("click", handleExport);
    return () => {
      if (clearBtn) clearBtn.removeEventListener("click", handleClear);
      if (exportBtn) exportBtn.removeEventListener("click", handleExport);
    };
  }, [handleClear, handleExport]);

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw
        ref={excalidrawRef}
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
  );
}

const root = createRoot(document.getElementById("whiteboard-root"));
root.render(<WhiteboardApp />);
