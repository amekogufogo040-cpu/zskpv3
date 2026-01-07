
import React, { useState, useCallback, useRef } from 'react';
import { analyzeDocument, generateCardHTML } from './services/geminiService';
import { DesignBlueprint, WorkflowState, GeneratedCard } from './types';
import * as htmlToImage from 'html-to-image';

const STYLES = [
  { id: 'Auto', name: '智能匹配', icon: 'fa-wand-sparkles', desc: 'AI 自动分析' },
  { id: 'Academic', name: '学术典雅', icon: 'fa-book-open', desc: '严谨、稳重' },
  { id: 'Modern', name: '现代知识', icon: 'fa-shapes', desc: '极简、有力' },
  { id: 'Tech', name: '科技简约', icon: 'fa-microchip', desc: '硬核、前卫' },
  { id: 'Handwritten', name: '手绘笔记', icon: 'fa-pen-fancy', desc: '温度、灵动' },
  { id: 'Business', name: '商务专业', icon: 'fa-briefcase', desc: '高效、克制' }
];

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('Auto');
  const [workflow, setWorkflow] = useState<WorkflowState>('IDLE');
  const [blueprint, setBlueprint] = useState<DesignBlueprint | null>(null);
  const [currentCard, setCurrentCard] = useState<GeneratedCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const formatErrorMessage = (err: any) => {
    const errStr = JSON.stringify(err).toLowerCase();
    if (errStr.includes('429') || errStr.includes('quota')) {
      return 'API 调用次数超限 (Quota Exceeded)。系统已尝试自动重试，但配额已耗尽。请等待 1 分钟后重试。';
    }
    return '生成过程出错，请检查输入或重试。';
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setWorkflow('ANALYZING');
    setError(null);
    try {
      const result = await analyzeDocument(inputText, selectedStyle);
      setBlueprint(result);
      setWorkflow('BLUEPRINT_READY');
    } catch (err: any) {
      console.error(err);
      setError(formatErrorMessage(err));
      setWorkflow('IDLE');
    }
  };

  const handleGenerateCard = async (index: number) => {
    if (!blueprint) return;
    setWorkflow('GENERATING_CARD');
    setError(null);
    try {
      const html = await generateCardHTML(blueprint, index);
      setCurrentCard({
        index,
        html,
        title: blueprint.cardOutlines[index].title
      });
      setWorkflow('CARD_READY');
    } catch (err: any) {
      console.error(err);
      setError(formatErrorMessage(err));
      setWorkflow('BLUEPRINT_READY');
    }
  };

  const handleNext = () => {
    if (blueprint && currentCard && currentCard.index < blueprint.cardOutlines.length - 1) {
      handleGenerateCard(currentCard.index + 1);
    }
  };

  const handleReset = () => {
    setWorkflow('IDLE');
    setBlueprint(null);
    setCurrentCard(null);
    setInputText('');
    setSelectedStyle('Auto');
    setError(null);
  };

  const copyCode = () => {
    if (currentCard) {
      navigator.clipboard.writeText(currentCard.html);
      alert('HTML 代码已复制到剪贴板！');
    }
  };

  const downloadAsImage = async () => {
    if (!iframeRef.current || !currentCard) return;
    setIsDownloading(true);
    try {
      const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (!iframeDoc) throw new Error("无法读取 iframe 内容");
      
      const cardContainer = iframeDoc.querySelector('.card-container') || iframeDoc.body;
      if (!cardContainer) throw new Error("找不到卡片容器节点");

      // Attempt to wait for fonts
      try {
        if ((iframeRef.current.contentWindow as any).document.fonts?.ready) {
          await (iframeRef.current.contentWindow as any).document.fonts.ready;
        }
      } catch (e) {
        console.warn("Font detection failed, continuing anyway", e);
      }

      // Use a custom filter to avoid cross-origin CSS rule access errors
      const filter = (node: HTMLElement) => {
        if (node.tagName === 'LINK') {
          try {
            // Check if we can access sheet rules
            const sheet = (node as any).sheet;
            if (sheet) {
              const rules = sheet.cssRules;
              return true;
            }
          } catch (e) {
            console.warn("Skipping cross-origin stylesheet to avoid SecurityError", node);
            return false; // Filter out the link tag that's causing issues
          }
        }
        return true;
      };

      const dataUrl = await htmlToImage.toPng(cardContainer as HTMLElement, {
        width: 700,
        height: 1160,
        pixelRatio: 2,
        skipAutoScale: true,
        cacheBust: true,
        filter: filter as any,
        style: {
          transform: 'none',
          margin: '0',
          padding: '0'
        }
      });

      const link = document.createElement('a');
      link.download = `知识卡-${currentCard.title.replace(/[\\/:*?"<>|]/g, '_')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err: any) {
      console.error('Image Export Error:', err);
      if (err.name === 'SecurityError' || err.message?.includes('SecurityError')) {
        alert('导出由于浏览器安全限制失败（CORS）。建议直接使用“复制代码”功能，或刷新并选择不同的风格。');
      } else {
        alert('生成图片失败，请尝试复制代码或重试。');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      <aside className="w-full md:w-[420px] bg-white border-r border-slate-200 flex flex-col h-screen overflow-y-auto shrink-0 shadow-lg">
        <header className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <i className="fas fa-layer-group text-xl"></i>
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-lg">AI 知识卡设计师</h1>
              <p className="text-[10px] text-indigo-500 font-bold tracking-widest uppercase">Expert Design System</p>
            </div>
          </div>
          {workflow !== 'IDLE' && (
            <button 
              onClick={handleReset}
              className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors uppercase"
            >
              重新开始
            </button>
          )}
        </header>

        <div className="p-6 space-y-8 flex-1">
          {workflow === 'IDLE' || workflow === 'ANALYZING' ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <i className="fas fa-palette text-indigo-500"></i>
                  选择视觉风格
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`flex flex-col items-start p-3 rounded-xl border transition-all text-left group ${
                        selectedStyle === style.id 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                        : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <i className={`fas ${style.icon} text-xs ${selectedStyle === style.id ? 'text-white' : 'text-indigo-500'}`}></i>
                        <span className="font-bold text-xs">{style.name}</span>
                      </div>
                      <span className={`text-[10px] ${selectedStyle === style.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {style.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <i className="fas fa-pen-nib text-indigo-500"></i>
                  输入源文档内容
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="在此粘贴文章、笔记或任意需要转化的原始文本..."
                  className="w-full h-80 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none text-slate-600 leading-relaxed text-sm"
                />
              </div>

              <button
                disabled={workflow === 'ANALYZING' || !inputText.trim()}
                onClick={handleAnalyze}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl shadow-slate-200"
              >
                {workflow === 'ANALYZING' ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    深度分析中 (含自动重试)...
                  </>
                ) : (
                  <>
                    <i className="fas fa-wand-magic-sparkles"></i>
                    构建设计蓝图
                  </>
                )}
              </button>
              
              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-start gap-3 animate-pulse">
                  <i className="fas fa-exclamation-circle mt-0.5 shrink-0"></i>
                  <span>{error}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {blueprint && (
                <>
                  <section className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
                        <i className="fas fa-clipboard-check"></i>
                        第一阶段：设计蓝图
                      </h3>
                      <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold">
                        {blueprint.style}
                      </span>
                    </div>
                    <p className="text-xs text-indigo-800/70 leading-relaxed">
                      {blueprint.description}
                    </p>
                    <div className="flex items-center gap-3 pt-2">
                      <div className="flex -space-x-2">
                        <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: blueprint.themeColor }}></div>
                        <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: blueprint.secondaryColor }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">配色方案已就绪</span>
                    </div>
                  </section>

                  {error && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs border border-red-100 flex items-start gap-3">
                      <i className="fas fa-exclamation-circle mt-0.5 shrink-0"></i>
                      <span>{error}</span>
                    </div>
                  )}

                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">知识卡序列 ({blueprint.cardOutlines.length})</h4>
                    </div>
                    <div className="space-y-2">
                      {blueprint.cardOutlines.map((card, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleGenerateCard(idx)}
                          disabled={workflow === 'GENERATING_CARD'}
                          className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 group ${
                            currentCard?.index === idx 
                              ? 'bg-slate-900 border-slate-900 text-white shadow-xl translate-x-2' 
                              : 'bg-white border-slate-100 hover:border-indigo-200 text-slate-600'
                          }`}
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            currentCard?.index === idx ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-300'
                          }`}>
                            {idx === 0 ? <i className="fas fa-star text-[10px]"></i> : idx + 1}
                          </span>
                          <span className="flex-1 font-bold truncate text-xs">
                            {idx === 0 ? <span className="mr-2 text-indigo-400 font-black">[封面]</span> : null}
                            {card.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </div>
        
        <footer className="p-6 border-t border-slate-50 bg-slate-50/50">
          <p className="text-[9px] text-slate-400 text-center uppercase tracking-[0.2em] font-bold leading-relaxed">
            Standardized 7:11.6 Layout System<br/>
            Professionally Crafted for Learners
          </p>
        </footer>
      </aside>

      <main className="flex-1 p-6 md:p-12 flex flex-col items-center justify-center overflow-hidden bg-[#F8FAFC]">
        {workflow === 'IDLE' ? (
          <div className="text-center space-y-8 max-w-md animate-in fade-in zoom-in duration-1000">
            <div className="w-24 h-24 bg-white rounded-[2rem] shadow-2xl shadow-indigo-100 flex items-center justify-center mx-auto text-indigo-500 relative">
               <div className="absolute inset-0 bg-indigo-500 rounded-[2rem] animate-ping opacity-20"></div>
               <i className="fas fa-lightbulb text-4xl relative z-10"></i>
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">准备好创作了吗？</h2>
              <p className="text-slate-400 leading-relaxed font-medium">
                将您的文档碎片转化为视觉精美、信息密度均衡的专业知识卡。
              </p>
            </div>
          </div>
        ) : workflow === 'GENERATING_CARD' ? (
          <div className="text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">正在雕琢单卡设计...</h3>
              <p className="text-slate-400 text-sm font-medium">高保真渲染中 (含自动配额重试)</p>
            </div>
          </div>
        ) : currentCard ? (
          <div className="w-full h-full flex flex-col items-center gap-6 animate-in zoom-in-95 fade-in duration-700">
            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
               <button 
                onClick={copyCode}
                className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-50 text-slate-700 rounded-xl transition-all text-xs font-bold"
              >
                <i className="fas fa-code text-indigo-500"></i>
                复制代码
              </button>
              <div className="w-px h-6 bg-slate-100"></div>
              <button 
                onClick={downloadAsImage}
                disabled={isDownloading}
                className="flex items-center gap-2 px-5 py-2.5 hover:bg-indigo-50 text-indigo-600 rounded-xl transition-all text-xs font-bold"
              >
                {isDownloading ? (
                   <i className="fas fa-spinner fa-spin"></i>
                ) : (
                   <i className="fas fa-image"></i>
                )}
                下载图片
              </button>
              <div className="w-px h-6 bg-slate-100"></div>
              <button 
                disabled={currentCard.index === (blueprint?.cardOutlines.length || 0) - 1}
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all text-xs font-bold shadow-lg shadow-indigo-100"
              >
                下一张
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>

            <div className="relative group flex-1 w-full flex justify-center items-start overflow-auto p-4 md:p-12">
              <div className="origin-top shadow-[0_50px_100px_rgba(0,0,0,0.12)] rounded-2xl overflow-hidden scale-[0.4] sm:scale-[0.5] md:scale-[0.6] lg:scale-[0.7] xl:scale-[0.8] 2xl:scale-[0.85] transition-transform">
                 <iframe
                    ref={iframeRef}
                    title="Knowledge Card Preview"
                    className="w-[700px] h-[1160px] border-none bg-white"
                    srcDoc={currentCard.html}
                  />
              </div>
            </div>
          </div>
        ) : blueprint ? (
           <div className="text-center space-y-8 max-w-md animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-green-50 rounded-[2rem] flex items-center justify-center mx-auto text-green-600 shadow-xl shadow-green-100">
              <i className="fas fa-check-double text-4xl"></i>
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">蓝图已就绪</h2>
              <p className="text-slate-500 leading-relaxed font-medium">
                文档已解构为 <strong>{blueprint.cardOutlines.length}</strong> 张知识卡。
              </p>
            </div>
            <button 
              onClick={() => handleGenerateCard(0)}
              className="px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 mx-auto"
            >
              <i className="fas fa-play"></i>
              开始生成卡片
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default App;
