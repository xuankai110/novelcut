import { useState } from "react";
import {
  PROVIDERS, loadLLMConfig, saveLLMConfig, clearLLMConfig, chat,
  type LLMConfig, type ProviderId, LLMError,
} from "./llm";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const initial = loadLLMConfig();
  const [provider, setProvider] = useState<ProviderId>(initial?.provider ?? "deepseek");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? PROVIDERS.find(p => p.id === "deepseek")!.defaultBaseUrl);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [model, setModel] = useState(initial?.model ?? PROVIDERS.find(p => p.id === "deepseek")!.defaultModel);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const onPickProvider = (id: ProviderId) => {
    const preset = PROVIDERS.find(p => p.id === id)!;
    setProvider(id);
    if (preset.defaultBaseUrl) setBaseUrl(preset.defaultBaseUrl);
    if (preset.defaultModel) setModel(preset.defaultModel);
    setTestResult(null); setTestOk(null);
  };

  const cfg: LLMConfig = { provider, baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() };

  const onTest = async () => {
    setTesting(true); setTestResult(null); setTestOk(null);
    try {
      const r = await chat(cfg, {
        messages: [
          { role: "system", content: "Reply with the single word: PONG" },
          { role: "user", content: "ping" },
        ],
        temperature: 0,
      });
      setTestOk(true);
      setTestResult(r.content.slice(0, 80) || "(empty)");
    } catch (e) {
      setTestOk(false);
      setTestResult(e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e));
    } finally {
      setTesting(false);
    }
  };

  const onSave = () => {
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
      alert("Base URL / API Key / Model 都需要填。");
      return;
    }
    saveLLMConfig(cfg);
    onClose();
  };

  const onClear = () => {
    if (confirm("清空当前 LLM 配置?")) {
      clearLLMConfig();
      onClose();
    }
  };

  const preset = PROVIDERS.find(p => p.id === provider);

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div className="nc-modal-title">设置 · 大模型</div>
            <div className="nc-page-sub">用于事件抽取、编剧 Agent、剧本生成。OpenAI 兼容协议优先。</div>
          </div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="nc-form-row">
          <label className="nc-label">供应商</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => onPickProvider(p.id)}
                className="nc-btn nc-btn-ghost"
                style={{
                  justifyContent: "center",
                  padding: "10px 8px",
                  borderColor: provider === p.id ? "var(--nc-cyan)" : "#e5e1d8",
                  color: provider === p.id ? "var(--nc-cyan-strong)" : "inherit",
                  background: provider === p.id ? "var(--nc-cyan-tint)" : "#fff",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset?.hint && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{preset.hint}</div>
          )}
        </div>

        <div className="nc-form-row">
          <label className="nc-label">Base URL</label>
          <input className="nc-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" spellCheck={false} />
        </div>

        <div className="nc-form-grid">
          <div className="nc-form-row">
            <label className="nc-label">Model</label>
            <input className="nc-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" spellCheck={false} />
          </div>
          <div className="nc-form-row">
            <label className="nc-label">API Key</label>
            <input className="nc-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." spellCheck={false} autoComplete="off" />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <button className="nc-btn nc-btn-ghost" onClick={onTest} disabled={testing || !cfg.baseUrl || !cfg.apiKey || !cfg.model}>
            {testing ? "测试中…" : "🧪 测试连接"}
          </button>
          {testResult !== null && (
            <span style={{
              fontSize: 12,
              color: testOk ? "#15803d" : "#b91c1c",
              fontFamily: "ui-monospace, monospace",
            }}>
              {testOk ? "✓" : "✗"} {testResult}
            </span>
          )}
        </div>

        <div className="nc-modal-foot">
          {initial && (
            <button className="nc-btn nc-btn-danger" onClick={onClear} style={{ marginRight: "auto" }}>
              清空
            </button>
          )}
          <button className="nc-btn nc-btn-ghost" onClick={onClose}>取消</button>
          <button className="nc-btn nc-btn-primary" onClick={onSave}>保存</button>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 14, lineHeight: 1.5 }}>
          API Key 仅保存在浏览器 localStorage,经同源 Next.js 路由 <code>/api/llm/chat</code> 转发到供应商,不会发到第三方。
        </div>
      </div>
    </div>
  );
}
