
import { GoogleGenAI, Type } from "@google/genai";
import { DesignBlueprint, CardOutline } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * Utility function to handle API retries with exponential backoff.
 * Especially useful for 429 (Rate Limit) errors.
 */
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 3000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    const isRateLimit = errorStr.includes('429') || 
                        errorStr.includes('quota') || 
                        error?.status === 429 || 
                        error?.code === 429;
    
    if (retries > 0 && isRateLimit) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const analyzeDocument = async (text: string, preferredStyle: string = 'Auto'): Promise<DesignBlueprint> => {
  return withRetry(async () => {
    const styleInstruction = preferredStyle === 'Auto' 
      ? "从（学术典雅、现代知识、科技简约、手绘笔记、商务专业）中选择最匹配的。" 
      : `强制使用指定风格：${preferredStyle}。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你是一位顶级信息架构师和视觉设计师。请执行【第一阶段：深度分析与设计蓝图构建】。
      
      任务要求：
      1. 智能解构：将源文档拆解为系列知识卡片。
      2. **封面卡片（必须）：生成的 cardOutlines 数组的第一个元素必须是“封面卡片”。其标题为文档总标题，内容点为全文的核心精华总结。**
      3. 卡片序列规划：后续卡片按逻辑拆解，严格遵守 7:11.6 比例（700x1160px）。
      4. 风格方案：${styleInstruction}
      5. 视觉方案：定义主题色、辅助色及字体配对建议。

      源文档内容：
      ${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            style: { type: Type.STRING, description: "视觉风格名称" },
            themeColor: { type: Type.STRING, description: "主题 HEX 颜色" },
            secondaryColor: { type: Type.STRING, description: "辅助 HEX 颜色" },
            fontPairing: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING, description: "标题建议字体" },
                body: { type: Type.STRING, description: "正文建议字体" }
              },
              required: ["heading", "body"]
            },
            cardOutlines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "该张卡片的主题" },
                  points: { type: Type.ARRAY, items: { type: Type.STRING }, description: "核心要点列表" }
                },
                required: ["title", "points"]
              }
            },
            description: { type: Type.STRING, description: "设计思路与规范提案摘要" }
          },
          required: ["style", "themeColor", "secondaryColor", "fontPairing", "cardOutlines", "description"]
        }
      }
    });

    return JSON.parse(response.text) as DesignBlueprint;
  });
};

export const generateCardHTML = async (
  blueprint: DesignBlueprint, 
  cardIndex: number
): Promise<string> => {
  return withRetry(async () => {
    const card = blueprint.cardOutlines[cardIndex];
    const total = blueprint.cardOutlines.length;
    const isCover = cardIndex === 0;

    const prompt = `
      请执行【第二阶段：高保真单卡设计】。
      
      卡片信息：
      - 主题：${card.title}
      - 核心内容：${card.points.join('；')}
      - 视觉风格：${blueprint.style}
      - 主题色：${blueprint.themeColor}
      - 辅助色：${blueprint.secondaryColor}
      - 进度：${cardIndex + 1}/${total}
      - 是否为封面：${isCover ? '是' : '否'}
      
      严格设计规范：
      1. 尺寸约束：宽度锁定 700px，高度锁定 1160px。禁止滚动条。
      2. 全局样式：必须包含 * { box-sizing: border-box; -webkit-font-smoothing: antialiased; } 且 body { margin: 0; padding: 0; overflow: hidden; font-family: 'Inter', sans-serif; }
      3. **CORS 与 导出兼容性 (重要)：**
         - 为了支持图片导出，所有 <link> 标签必须严格包含 crossorigin="anonymous" 属性。
         - 推荐使用 Google Fonts 链接，如：<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet" crossorigin="anonymous">
      4. **署名要求：**
         - 左下角署名：@不想上班计划 AI提效 少工作 多赚钱。使用精致排版。
      5. **内容组件系统：**
         - 封面卡片设计：英雄模式，大标题居中。
         - 正文卡片设计：页眉 + 主体 + 页脚。
         - 视觉丰富度：使用强调卡片、逻辑连接线、标签、徽章等图解元素。
      
      输出要求：
      只返回完整的 HTML 代码块。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        temperature: 0.8,
        systemInstruction: "你是一个专家级前端排版师。生成的 HTML 必须包含完整的 CSS 且能够离线或通过 CORS 兼容链接渲染。重点确保图片导出不触发 SecurityError。每个卡片左下角署名必须是：@不想上班计划 AI提效 少工作 多赚钱。",
      }
    });

    let html = response.text;
    if (html.includes('```html')) {
      html = html.split('```html')[1].split('```')[0];
    } else if (html.includes('```')) {
      html = html.split('```')[1].split('```')[0];
    }

    return html.trim();
  });
};
