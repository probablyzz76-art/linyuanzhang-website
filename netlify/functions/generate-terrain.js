/**
 * MOOTAIN serverless 渲染函数（Netlify Functions）
 * 流程：心情 → 取 200 字地形基底 → 按滑块(强度/valence/arousal)用 Gemini 文本扩到 ~400 字
 *       → Gemini 图像模型渲染成黏土风格 → 返回 { terrain_text, design_text, prompt, imageUrl, extrusion_params, ... }
 * key 由 Netlify 环境变量 GEMINI_API_KEY 提供，绝不进前端 / 仓库。
 * 模型可用环境变量覆盖：GEMINI_TEXT_MODEL / GEMINI_IMAGE_MODEL
 */
const LIB = require("./mood-prompts.json");
const MOODS = LIB.moods || {};
const STYLE =
  LIB["_风格关键词(渲染统一附加)"] ||
  "3D pastel clay illustration, claymorphism, low-poly and organic foam/bubble forms, isometric view, soft global illumination, isolated on a pure solid white background";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.0-flash";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash-preview-image-generation";
const API = "https://generativelanguage.googleapis.com/v1beta/models";

// 前端用的英文情绪 → 中文心情库键 的别名映射
const EN2CN = {
  joy: "喜悦", elation: "雀跃", excitement: "兴奋", ecstasy: "狂喜",
  passion: "热情", love: "热情", affection: "温柔", tenderness: "温柔",
  contentment: "满足", calm: "平静", serenity: "安宁", relaxation: "放松",
  relief: "释然", gratitude: "感恩", trust: "坚定", determination: "坚定",
  focus: "坚定", hope: "期待", anticipation: "期待", curiosity: "好奇",
  inspiration: "灵感", pride: "自豪", awe: "敬畏", courage: "勇气",
  surprise: "兴奋", shyness: "羞涩", nostalgia: "怀旧", healing: "治愈",
  balance: "平衡", anger: "愤怒", rage: "愤怒", frustration: "烦躁",
  irritation: "烦躁", sadness: "悲伤", grief: "悲伤", loss: "失落",
  loneliness: "孤独", melancholy: "忧郁", emptiness: "空虚", longing: "思念",
  fatigue: "疲惫", boredom: "平淡", numbness: "平淡", fear: "恐惧",
  anxiety: "焦虑", panic: "慌乱", unease: "不安", stress: "压力",
  disgust: "嫉妒", contempt: "嫉妒", jealousy: "嫉妒", confusion: "迷茫"
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

function hslHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

function resolveMoodKey(emotion) {
  if (!emotion) return null;
  const e = String(emotion).trim();
  if (MOODS[e]) return e;
  const cn = EN2CN[e.toLowerCase()];
  if (cn && MOODS[cn]) return cn;
  return null;
}

// 由 valence/arousal/intensity 推导 3D 挤出参数（第4步：不同心情→不同地形）
function buildExtrusion(v, a, i) {
  const warm = v >= 0.5;
  // 正向→暖色(蜜桃35°→玫瑰350°，经红色相区，不穿过冷色)；负向→冷色(蓝205°→靛250°)
  const gHue = warm ? ((35 - clamp((v - 0.5) * 2, 0, 1) * 45) + 360) % 360 : lerp(205, 250, clamp((0.5 - v) * 2, 0, 1));
  const gSat = warm ? clamp(0.42 + a * 0.4, 0, 0.95) : clamp(0.1 + a * 0.28, 0, 0.6);
  const gLit = clamp(0.6 + (v - 0.5) * 0.34, 0.42, 0.82);
  const groundColor = hslHex(gHue, gSat, gLit);
  const treeColors = [
    hslHex(gHue + 22, clamp(gSat + 0.2, 0, 1), clamp(gLit - 0.04, 0, 1)),
    hslHex(gHue - 28, clamp(gSat + 0.16, 0, 1), clamp(gLit + 0.06, 0, 1)),
    hslHex(gHue + 50, clamp(gSat + 0.1, 0, 1), gLit)
  ];
  const riverColor = warm ? hslHex(348, clamp(0.6 + a * 0.3, 0, 1), 0.6) : hslHex(202, clamp(0.25 + a * 0.3, 0, 0.7), 0.52);
  return {
    peakHeight: +(0.5 + a * 1.1 + i * 0.5).toFixed(2),
    roughness: +(0.3 + a * 0.55).toFixed(2),
    volcanoEffect: +clamp((a - 0.6) * 2.2 * (1.1 - v), 0, 1).toFixed(2),
    terraceEffect: v > 0.6 && a >= 0.35 && a <= 0.7 ? 0.5 : 0,
    sandDuneEffect: a < 0.35 ? +clamp((0.6 - a) * 0.9, 0, 0.6).toFixed(2) : 0,
    vegetationDensity: +clamp(0.15 + v * 0.75, 0.05, 0.95).toFixed(2),
    riverWidth: +(0.18 + v * 0.35).toFixed(2),
    waterFlowSpeed: +(0.5 + a * 4.5).toFixed(2),
    groundColor,
    riverColor,
    treeColors,
    cloudColor: warm ? "#ffffff" : "#dfe4ea",
    ambientStyle: "claymation",
    backgroundColor: hslHex(gHue, clamp(gSat * 0.4, 0, 0.3), 0.95)
  };
}

async function geminiText(prompt, key) {
  const r = await fetch(`${API}/${TEXT_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 1024 }
    })
  });
  if (!r.ok) throw new Error("text " + r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || "").join("").trim();
}

async function geminiImage(prompt, key) {
  const r = await fetch(`${API}/${IMAGE_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
    })
  });
  if (!r.ok) throw new Error("image " + r.status + " " + (await r.text()).slice(0, 220));
  const j = await r.json();
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  for (const p of parts) {
    const d = p.inlineData || p.inline_data;
    if (d && d.data) {
      const mime = d.mimeType || d.mime_type || "image/png";
      return `data:${mime};base64,${d.data}`;
    }
  }
  return null;
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}
  const key = process.env.GEMINI_API_KEY;
  const emotion = body.emotion;
  const intensity = clamp(Number(body.intensity != null ? body.intensity : 75), 0, 100) / 100;

  // 登录开屏的空请求 {} → 直接回退预设，不烧 Gemini 额度
  if (!emotion) {
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ source: "fallback", fallbackKey: "default", name: "Mootain Lands", climate: "A prismatic claymorphism world awaiting your mood." })
    };
  }

  const moodKey = resolveMoodKey(emotion) || "平衡";
  const m = MOODS[moodKey] || MOODS["平衡"];
  const v = clamp(m.valence, 0, 1), a = clamp(m.arousal, 0, 1);
  const base200 = m.prompt_200;
  const extrusion = buildExtrusion(v, a, intensity);
  const fallbackKey = v < 0.35 && a < 0.45 ? "snow" : (v < 0.35 && a > 0.7 ? "lava" : "default");

  let prompt400 = base200;
  let imageUrl = "";
  let source = "fallback";
  let debug = "";

  if (key) {
    // 第3步：按滑块把 200 字扩展到 ~400 字
    try {
      const instruction =
        `在不改变地形类型与情绪基调的前提下，把下面这段约200字的中文地形描述细化扩展到约400字。按参数调节细节：` +
        `强度=${Math.round(intensity * 100)}%（越高地形特征越夸张、密度越大、对比越强）；` +
        `valence=${v.toFixed(2)}（越接近1色调越暖越明亮，越接近0越冷越灰暗）；` +
        `arousal=${a.toFixed(2)}（越高山峰越尖锐、水流越湍急、元素越跳动，越低越平缓静止）。` +
        `补充光照、水文、材质与色彩细节，保持画面整洁、主体居中。只输出扩展后的中文描述本身，不要任何前后缀。\n\n原描述：${base200}`;
      const t = await geminiText(instruction, key);
      if (t && t.length > 60) prompt400 = t;
    } catch (e) { debug += "[text] " + e.message + " "; }

    // 第5步：渲染成黏土风格主视觉
    try {
      const imgPrompt = `${prompt400}\n\nStyle: ${STYLE}, high detail, centered composition.`;
      const url = await geminiImage(imgPrompt, key);
      if (url) { imageUrl = url; source = "gemini"; }
    } catch (e) { debug += "[image] " + e.message + " "; }
  } else {
    debug = "GEMINI_API_KEY 未在 Netlify 环境变量中设置";
  }

  const design_text =
    `情绪「${moodKey}」· 强度 ${Math.round(intensity * 100)}%。` +
    `地形已按 valence ${v.toFixed(2)} / arousal ${a.toFixed(2)} 调制。` +
    (source === "gemini" ? "Gemini 已实时渲染黏土风格主视觉。" : "渲染暂用预设回退，3D sandbox 已按情绪挤出。");

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      terrain_text: base200,
      design_text,
      prompt: prompt400,
      imageUrl,
      extrusion_params: extrusion,
      source,
      fallbackKey,
      mood: moodKey,
      name: `Mootain · ${moodKey}`,
      climate: base200.slice(0, 38) + "…",
      debug: debug || undefined
    })
  };
};
