import { useState } from "react";
import { genId, upsertProject } from "./store";
import type { Genre, Platform, Project, Tone } from "./types";

const GENRES: Genre[] = [
  "现代都市", "古装宫斗", "玄幻仙侠", "霸总言情",
  "悬疑推理", "科幻未来", "穿越重生", "甜宠校园", "其他",
];
const PLATFORMS: Platform[] = ["抖音", "小红书", "快手", "TikTok", "YouTube Shorts"];
const TONES: Tone[] = ["压迫感强", "甜宠治愈", "热血爽感", "悬疑紧张", "诙谐轻喜"];
const LANGS: { code: string; label: string }[] = [
  { code: "zh-CN", label: "简体中文" },
  { code: "ru-RU", label: "Русский" },
  { code: "en-US", label: "English" },
  { code: "th-TH", label: "ไทย" },
  { code: "vi-VN", label: "Tiếng Việt" },
];

export function NewDramaDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState("");
  const [genre, setGenre] = useState<Genre>("霸总言情");
  const [language, setLanguage] = useState("zh-CN");
  const [platform, setPlatform] = useState<Platform>("抖音");
  const [tone, setTone] = useState<Tone>("压迫感强");
  const [episodeCount, setEpisodeCount] = useState(60);
  const [synopsis, setSynopsis] = useState("");

  const submit = () => {
    if (!name.trim()) {
      alert("请填写短剧标题");
      return;
    }
    const now = Date.now();
    const project: Project = {
      id: genId("prj"),
      name: name.trim(),
      genre,
      language,
      platform,
      tone,
      episodeCount,
      synopsis: synopsis.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    upsertProject(project);
    onCreated(project);
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div className="nc-modal-title">新建短剧</div>
            <div className="nc-page-sub">先把题材和发布平台定下来,后面 AI 会按这些参数适配。</div>
          </div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="nc-form-row">
          <label className="nc-label">标题</label>
          <input
            className="nc-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如:苏晚与弗拉基米尔"
            autoFocus
          />
        </div>

        <div className="nc-form-grid">
          <div className="nc-form-row">
            <label className="nc-label">题材</label>
            <select className="nc-select" value={genre} onChange={(e) => setGenre(e.target.value as Genre)}>
              {GENRES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="nc-form-row">
            <label className="nc-label">语言</label>
            <select className="nc-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="nc-form-grid">
          <div className="nc-form-row">
            <label className="nc-label">发布平台</label>
            <select className="nc-select" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="nc-form-row">
            <label className="nc-label">风格基调</label>
            <select className="nc-select" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
              {TONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="nc-form-row">
          <label className="nc-label">计划集数</label>
          <input
            type="number"
            min={1}
            max={500}
            className="nc-input"
            value={episodeCount}
            onChange={(e) => setEpisodeCount(Math.max(1, parseInt(e.target.value || "1", 10)))}
          />
        </div>

        <div className="nc-form-row">
          <label className="nc-label">一句话故事核 (可选)</label>
          <textarea
            className="nc-textarea"
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="一段话写清楚主角是谁、面临什么困境、最终走向哪里。"
          />
        </div>

        <div className="nc-modal-foot">
          <button className="nc-btn nc-btn-ghost" onClick={onClose}>取消</button>
          <button className="nc-btn nc-btn-primary" onClick={submit}>创建</button>
        </div>
      </div>
    </div>
  );
}
