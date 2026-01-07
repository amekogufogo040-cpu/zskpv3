import { GoogleGenAI, Type } from "@google/genai";
import { DesignBlueprint } from "../types";

// 必须严格使用 process.env.API_KEY 初始化
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * 指数退避重试工具函数
 * 专门处理 429 Resource Exhausted (配额限制)
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
      console.warn(`检测到配额限制，${delay}ms 后重试... (剩余重试次数: ${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const analyzeDocument = async (text: string, preferredStyle: string = 'Auto'): Promise<DesignBlueprint> => {
  return withRetry(async () => {
    const styleInstruction = preferredStyle === 'Auto' 
      ? "从（Academic, Modern, Tech, Handwritten, Business）中选择最匹配的风格。" 
      : `强制使用指定风格：${preferredStyle}。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你是一位顶级信息架构师和视觉设计师。请执行【第一阶段：深度分析与设计蓝图构建】。
      
      任务要求：
      1. 智能解构：将源文档拆解为系列知识卡片。
      2. **封面卡片（必须）：生成的 cardOutlines 数组的第一个元素必须是“封面卡片”。**
      3. 卡片序列规划：后续卡片按逻辑拆解，严格遵守 7:11.6 比例（700x1160px）。
      4. 风格方案：${styleInstruction} (请确保 style 字段返回对应的英文 Key)
      5. 视觉方案：定义主题色、辅助色及字体配对建议。

      源文档内容：
      ${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            style: { type: Type.STRING, description: "视觉风格 Key (Academic/Modern/Tech/Handwritten/Business)" },
            themeColor: { type: Type.STRING, description: "主题 HEX 颜色" },
            secondaryColor: { type: Type.STRING, description: "辅助 HEX 颜色" },
            fontPairing: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                body: { type: Type.STRING }
              },
              required: ["heading", "body"]
            },
            cardOutlines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  points: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["title", "points"]
              }
            },
            description: { type: Type.STRING }
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
      
      严格设计规范：
      1. 尺寸约束：宽度锁定 700px，高度锁定 1160px。
      2. 导出兼容性：所有外部资源链接必须包含 crossorigin="anonymous"。
      3. **署名要求：** 每个卡片左下角必须优雅地展示署名：@不想上班计划 AI提效 少工作 多赚钱。
      
      输出要求：
      只返回完整的 HTML 代码块。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        temperature: 0.8,
        systemInstruction: "你是一个世界级的视觉排版专家。生成的 HTML 必须具备极高的组件化美感，并确保左下角署名为：@不想上班计划 AI提效 少工作 多赚钱。",
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