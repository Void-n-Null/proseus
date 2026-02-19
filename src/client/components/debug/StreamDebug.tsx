/**
 * Settings panel for AI generation configuration.
 *
 * Toggled via Ctrl+Shift+S. Shows WebSocket connection status,
 * OpenRouter API key input, and model selector.
 *
 * Generation is now triggered automatically when the user sends
 * a message — no manual buttons needed.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useIsStreaming, useStreamingMeta } from "../../stores/streaming.ts";
import type { WsStatus } from "../../hooks/useStreamSocket.ts";

const API_KEY_STORAGE_KEY = "proseus:openrouter-key";
const MODEL_STORAGE_KEY = "proseus:model";

interface StreamDebugProps {
  wsStatus: WsStatus;
  onCancel: () => void;
}

export default function StreamDebug({
  wsStatus,
  onCancel,
}: StreamDebugProps) {
  const [visible, setVisible] = useState(false);
  const isStreaming = useIsStreaming();
  const meta = useStreamingMeta();

  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(API_KEY_STORAGE_KEY) ?? "",
  );
  const [model, setModel] = useState(
    () => localStorage.getItem(MODEL_STORAGE_KEY) ?? "",
  );

  // Ctrl+Shift+S toggles panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const elapsed = meta
    ? ((Date.now() - meta.startedAt) / 1000).toFixed(1)
    : null;

  // Force re-render every 100ms while streaming to update elapsed time
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => forceUpdate((n) => n + 1), 100);
    return () => clearInterval(timer);
  }, [isStreaming]);

  const handleSaveKey = useCallback(() => {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  }, [apiKey]);

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setModel(val);
      localStorage.setItem(MODEL_STORAGE_KEY, val);
    },
    [],
  );

  if (!visible) return null;

  const statusColor =
    wsStatus === "connected"
      ? "#22c55e"
      : wsStatus === "connecting"
        ? "#eab308"
        : "#ef4444";

  const hasKey = apiKey.length > 0;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.3rem 0.4rem",
    background: "#0a0a0a",
    color: "#ccc",
    border: "1px solid #333",
    borderRadius: "3px",
    fontSize: "0.7rem",
    fontFamily: "monospace",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "4.5rem",
        right: "1rem",
        width: 280,
        background: "#111",
        border: "1px solid #333",
        borderRadius: "8px",
        padding: "0.75rem",
        fontFamily: "monospace",
        fontSize: "0.75rem",
        color: "#ccc",
        zIndex: 9999,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
          paddingBottom: "0.4rem",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        <span
          style={{ fontWeight: 700, color: "#999", letterSpacing: "0.1em" }}
        >
          SETTINGS
        </span>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: "none",
            border: "none",
            color: "#666",
            cursor: "pointer",
            fontSize: "0.9rem",
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* WebSocket status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          marginBottom: "0.6rem",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor,
            flexShrink: 0,
          }}
        />
        <span>WS: {wsStatus}</span>
      </div>

      {/* API Key */}
      <div style={{ marginBottom: "0.5rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.65rem",
            color: "#777",
            marginBottom: "0.2rem",
          }}
        >
          OpenRouter API Key
        </label>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleSaveKey}
            disabled={!apiKey}
            style={{
              padding: "0.3rem 0.5rem",
              background: apiKey ? "#1e3a5f" : "#1a1a1a",
              color: apiKey ? "#7dd3fc" : "#555",
              border: "none",
              borderRadius: "3px",
              cursor: apiKey ? "pointer" : "default",
              fontSize: "0.65rem",
              fontFamily: "monospace",
              flexShrink: 0,
            }}
          >
            Save
          </button>
        </div>
        {hasKey && (
          <div
            style={{
              fontSize: "0.6rem",
              color: "#4a5",
              marginTop: "0.2rem",
            }}
          >
            Key set
          </div>
        )}
      </div>

      {/* Model */}
      <div style={{ marginBottom: "0.6rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.65rem",
            color: "#777",
            marginBottom: "0.2rem",
          }}
        >
          Model
        </label>
        <input
          type="text"
          value={model}
          onChange={handleModelChange}
          placeholder="provider/model-name"
          style={inputStyle}
        />
      </div>

      {/* Stream status + cancel */}
      <div style={{ marginBottom: "0.5rem" }}>
        {isStreaming ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ color: "#7dd3fc" }}>Streaming... {elapsed}s</span>
            <button
              onClick={onCancel}
              style={{
                padding: "0.25rem 0.5rem",
                background: "#7f1d1d",
                color: "#fca5a5",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "0.65rem",
                fontFamily: "monospace",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ color: "#666" }}>
            Idle — send a message to generate
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "0.6rem",
          color: "#444",
          textAlign: "center",
        }}
      >
        Ctrl+Shift+S to toggle
      </div>
    </div>
  );
}
