import { useState } from "react";
import {
  PROVIDERS, IMAGE_PROVIDERS,
  loadLLMConfig, saveLLMConfig, clearLLMConfig, chat,
  loadImageConfig, saveImageConfig, clearImageConfig, imageGenerate,
  type LLMConfig, type ProviderId, type ImageConfig, type ImageProviderId,
  LLMError,
} from "./llm";

type Tab = "llm" | "image";

export function SettingsDialog({ onClose, initialTab = "llm" }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div className="nc-modal-title">设置</div>
            <div className="nc-page-sub">大模型用于编剧/事件抽取/剧本扩写;图像模型用于资产生图。</div>
          </div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #ebe7df" }}>
          <button className="nc-tab" aria-selected={tab === "llm"} onClick={() => setTab("llm")}>
            <span className="ico">💬</span> 大模型
          </button>
          <button className="nc-tab" aria-selected={tab === "image"} onClick={() => setTab("image")}>
            <span className="ico">🖼</span> 图像模型
          </button>
        </div>

        {tab === "llm" ? <LLMSection onClose={onClose} /> : <ImageSection onClose={onClose} />}
      </div>
    </div>
  );
}

function LLMSection({ onClose }: { onClose: () => void }) {
  const initial = loadLLMConfig();
  const [provider, setProvider] = useState<ProviderId>(initial?.provider ?? "deepseek");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? PROVIDERS.find(p => p.id === "deepseek")!.defaultBaseUrl);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [model, setModel] = useState(initial?.model ?? PROVIDERS.find(p => p.id === "deepseek")!.defaultModel);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const onPick = (id: ProviderId) => {
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
        ], temperature: 0,
      });
      setTestOk(true); setTestResult(r.content.slice(0, 80) || "(empty)");
    } catch (e) {
      setTestOk(false);
      setTestResult(e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e));
    } finally { setTesting(false); }
  };
  const onSave = () => {
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) return alert("Base URL / API Key / Model 都需要填。");
    saveLLMConfig(cfg);
    onClose();
  };
  const onClear = () => { if (confirm("清空 LLM 配置?")) { clearLLMConfig(); onClose(); } };

  const preset = PROVIDERS.find(p => p.id === provider);
  return (
    <>
      <div className="nc-form-row">
        <label className="nc-label">供应商</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {PROVIDERS.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} className="nc-btn nc-btn-ghost"
              style={{
                justifyContent: "center", padding: "10px 8px",
                borderColor: provider === p.id ? "var(--nc-cyan)" : "#e5e1d8",
                color: provider === p.id ? "var(--nc-cyan-strong)" : "inherit",
                background: provider === p.id ? "var(--nc-cyan-tint)" : "#fff",
              }}>
              {p.label}
            </button>
          ))}
        </div>
        {preset?.hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{preset.hint}</div>}
      </div>
      <div className="nc-form-row">
        <label className="nc-label">Base URL</label>
        <input className="nc-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
      </div>
      <div className="nc-form-grid">
        <div className="nc-form-row">
          <label className="nc-label">Model</label>
          <input className="nc-input" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
        </div>
        <div className="nc-form-row">
          <label className="nc-label">API Key</label>
          <input className="nc-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} spellCheck={false} autoComplete="off" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button className="nc-btn nc-btn-ghost" onClick={onTest} disabled={testing || !cfg.baseUrl || !cfg.apiKey || !cfg.model}>
          {testing ? "测试中…" : "🧪 测试连接"}
        </button>
        {testResult !== null && (
          <span style={{ fontSize: 12, color: testOk ? "#15803d" : "#b91c1c", fontFamily: "ui-monospace, monospace" }}>
            {testOk ? "✓" : "✗"} {testResult}
          </span>
        )}
      </div>
      <div className="nc-modal-foot">
        {initial && <button className="nc-btn nc-btn-danger" onClick={onClear} style={{ marginRight: "auto" }}>清空</button>}
        <button className="nc-btn nc-btn-ghost" onClick={onClose}>取消</button>
        <button className="nc-btn nc-btn-primary" onClick={onSave}>保存</button>
      </div>
    </>
  );
}

function ImageSection({ onClose }: { onClose: () => void }) {
  const initial = loadImageConfig();
  const llmInitial = loadLLMConfig();
  const [provider, setProvider] = useState<ImageProviderId>(initial?.provider ?? "openai");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? IMAGE_PROVIDERS.find(p => p.id === "openai")!.defaultBaseUrl);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [model, setModel] = useState(initial?.model ?? IMAGE_PROVIDERS.find(p => p.id === "openai")!.defaultModel);
  const [defaultSize, setDefaultSize] = useState(initial?.defaultSize ?? "1024x1024");
  const [useAspectRatio, setUseAspectRatio] = useState<boolean>(initial?.useAspectRatio ?? false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const onPick = (id: ImageProviderId) => {
    const preset = IMAGE_PROVIDERS.find(p => p.id === id)!;
    setProvider(id);
    if (preset.defaultBaseUrl) setBaseUrl(preset.defaultBaseUrl);
    if (preset.defaultModel) setModel(preset.defaultModel);
    setUseAspectRatio(preset.useAspectRatio);
    setTestResult(null); setTestOk(null);
  };
  const cfg: ImageConfig = { provider, baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), defaultSize, useAspectRatio };
  const onTest = async () => {
    setTesting(true); setTestResult(null); setTestOk(null);
    try {
      const r = await imageGenerate(cfg, {
        prompt: "A simple test ball, white background, photographic, sharp",
        size: useAspectRatio ? undefined : defaultSize,
        aspectRatio: useAspectRatio ? "1:1" : undefined,
      });
      setTestOk(true);
      setTestResult(r.url ? "✓ 收到 URL" : r.b64 ? "✓ 收到 base64" : "(空)");
    } catch (e) {
      setTestOk(false);
      setTestResult(e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e));
    } finally { setTesting(false); }
  };
  const onSave = () => {
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) return alert("Base URL / API Key / Model 都需要填。");
    saveImageConfig(cfg);
    onClose();
  };
  const onClear = () => { if (confirm("清空图像配置?")) { clearImageConfig(); onClose(); } };
  const preset = IMAGE_PROVIDERS.find(p => p.id === provider);

  return (
    <>
      {!initial && (
        <div style={{
          padding: "12px 14px", marginBottom: 16, borderRadius: 8,
          background: "var(--nc-cyan-tint)", border: "1px solid var(--nc-cyan-soft)",
          fontSize: 12, color: "var(--nc-cyan-strong)", lineHeight: 1.6,
        }}>
          <strong>📌 图像模型独立于 LLM 配置。</strong>
          {llmInitial && ` 你已配置 ${llmInitial.provider} 作为 LLM,但它` + (llmInitial.provider === "deepseek" || llmInitial.provider === "anthropic" ? "不支持出图" : "可能不支持出图") + ",所以这里需要单独配 OpenAI / grsai / 可灵 等图像供应商。"}
          {!llmInitial && " 大模型用于写文 (剧本/提示词/编剧),图像模型用于出图。请单独配 OpenAI / grsai / 可灵 等图像供应商。"}
        </div>
      )}
      <div className="nc-form-row">
        <label className="nc-label">供应商</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {IMAGE_PROVIDERS.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} className="nc-btn nc-btn-ghost"
              style={{
                justifyContent: "center", padding: "10px 8px",
                borderColor: provider === p.id ? "var(--nc-cyan)" : "#e5e1d8",
                color: provider === p.id ? "var(--nc-cyan-strong)" : "inherit",
                background: provider === p.id ? "var(--nc-cyan-tint)" : "#fff",
              }}>
              {p.label}
            </button>
          ))}
        </div>
        {preset?.hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{preset.hint}</div>}
      </div>
      <div className="nc-form-row">
        <label className="nc-label">Base URL</label>
        <input className="nc-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
      </div>
      <div className="nc-form-grid">
        <div className="nc-form-row">
          <label className="nc-label">Model</label>
          <input className="nc-input" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} placeholder="gpt-image-2" />
        </div>
        <div className="nc-form-row">
          <label className="nc-label">API Key</label>
          <input className="nc-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} spellCheck={false} autoComplete="off" />
        </div>
      </div>
      <div className="nc-form-row">
        <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={useAspectRatio} onChange={(e) => setUseAspectRatio(e.target.checked)} />
          使用 aspectRatio 协议 (grsai / 可灵)
        </label>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          OpenAI 标准用 <code>size</code> (1024x1536 等),grsai/可灵 用 <code>aspectRatio</code> (9:16 等)。
          <br />
          <strong>具体画幅由项目设置 (videoRatio + imageQuality) 决定,不在这里配。</strong>
          每个项目可以有不同的画幅 (短剧 9:16 / 横版 16:9 / 海报 3:4)。
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button className="nc-btn nc-btn-ghost" onClick={onTest} disabled={testing || !cfg.baseUrl || !cfg.apiKey || !cfg.model}>
          {testing ? "测试中…" : "🧪 测试出图"}
        </button>
        {testResult !== null && (
          <span style={{ fontSize: 12, color: testOk ? "#15803d" : "#b91c1c", fontFamily: "ui-monospace, monospace" }}>
            {testResult}
          </span>
        )}
      </div>
      <div className="nc-modal-foot">
        {initial && <button className="nc-btn nc-btn-danger" onClick={onClear} style={{ marginRight: "auto" }}>清空</button>}
        <button className="nc-btn nc-btn-ghost" onClick={onClose}>取消</button>
        <button className="nc-btn nc-btn-primary" onClick={onSave}>保存</button>
      </div>
    </>
  );
}
