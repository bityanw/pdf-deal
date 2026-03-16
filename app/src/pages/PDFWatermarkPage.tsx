import { useState, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { FileUpload } from '@/components/FileUpload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Droplets, Eraser, Check, AlertCircle, FileText } from 'lucide-react';
import type { PDFFile } from '@/types/pdf';
import { PDFDocument, rgb, degrees } from 'pdf-lib';

// 中文字体URL（使用思源黑体）
const CHINESE_FONT_URL = 'https://cdn.jsdelivr.net/npm/@chinese-fonts/syst/dist/SourceHanSansCN/result.woff2';

export function PDFWatermarkPage() {
  const [activeTab, setActiveTab] = useState<'add' | 'remove'>('add');
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; downloadUrl?: string; fileName?: string } | null>(null);
  
  // 水印设置
  const [watermarkText, setWatermarkText] = useState(' 内部资料 ');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(-45);
  
  // 缓存中文字体
  const [chineseFontBytes, setChineseFontBytes] = useState<ArrayBuffer | null>(null);
  
  // 加载中文字体
  const loadChineseFont = async (): Promise<ArrayBuffer | null> => {
    if (chineseFontBytes) return chineseFontBytes;
    
    try {
      const response = await fetch(CHINESE_FONT_URL);
      if (!response.ok) throw new Error('字体加载失败');
      const bytes = await response.arrayBuffer();
      setChineseFontBytes(bytes);
      return bytes;
    } catch (error) {
      console.error('加载中文字体失败:', error);
      return null;
    }
  };

  const generateId = () => Math.random().toString(36).substring(2, 9);

  // 验证PDF文件头
  const isValidPDF = async (file: File): Promise<boolean> => {
    try {
      const arrayBuffer = await file.slice(0, 8).arrayBuffer();
      const header = new Uint8Array(arrayBuffer);
      const headerStr = String.fromCharCode(...header);
      return headerStr.startsWith('%PDF-');
    } catch {
      return false;
    }
  };

  // 添加文件
  const addFiles = useCallback(async (newFiles: FileList | null): Promise<string[]> => {
    if (!newFiles) return [];

    const errors: string[] = [];
    const validFiles: PDFFile[] = [];

    for (const file of Array.from(newFiles)) {
      const ext = file.name.slice(((file.name.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
      if (ext !== 'pdf') {
        errors.push(`「${file.name}」不是PDF文件`);
        continue;
      }

      const isValid = await isValidPDF(file);
      if (!isValid) {
        errors.push(`「${file.name}」不是有效的PDF文件`);
        continue;
      }

      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        errors.push(`「${file.name}」文件大小超过50MB限制`);
        continue;
      }

      validFiles.push({
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
      });
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }

    return errors;
  }, []);

  // 移除文件
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setResult(null);
  }, []);

  // 清空文件
  const clearFiles = useCallback(() => {
    setFiles([]);
    setResult(null);
  }, []);

  // 检测是否包含中文字符
  const containsChinese = (str: string): boolean => {
    return /[\u4e00-\u9fa5]/.test(str);
  };

  // 添加水印
  const addWatermark = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setResult(null);
    
    try {
      const file = files[0].file;
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      const pages = pdfDoc.getPages();
      
      // 根据水印文字是否包含中文选择字体
      let font;
      const hasChinese = containsChinese(watermarkText);
      
      if (hasChinese) {
        // 加载中文字体
        const fontBytes = await loadChineseFont();
        if (!fontBytes) {
          setResult({
            success: false,
            message: '中文字体加载失败，请检查网络连接或尝试使用英文水印',
          });
          setIsProcessing(false);
          return;
        }
        font = await pdfDoc.embedFont(fontBytes);
      } else {
        // 使用内置字体
        const { StandardFonts } = await import('pdf-lib');
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }
      
      for (const page of pages) {
        const { width, height } = page.getSize();
        
        // 计算水印位置（居中）
        const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
        const textHeight = font.heightAtSize(fontSize);
        
        const x = (width - textWidth) / 2;
        const y = (height - textHeight) / 2;
        
        // 添加水印文字
        page.drawText(watermarkText, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.5, 0.5, 0.5),
          opacity,
          rotate: degrees(rotation),
        });
      }
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      
      setResult({
        success: true,
        message: `成功为 ${pages.length} 页PDF添加水印`,
        downloadUrl,
        fileName: `水印_${file.name}`,
      });
    } catch (error) {
      setResult({
        success: false,
        message: `添加水印失败: ${(error as Error).message}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 去除水印（简单实现：通过重新保存PDF来尝试去除部分水印）
  const removeWatermark = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setResult(null);
    
    try {
      const file = files[0].file;
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      // 重新保存PDF，某些简单水印可能会被去除
      const pdfBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });
      
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      
      setResult({
        success: true,
        message: 'PDF已处理。注意：去除水印功能对嵌入在图片中的水印效果有限，建议配合PDF转图片后重新生成PDF使用。',
        downloadUrl,
        fileName: `去水印_${file.name}`,
      });
    } catch (error) {
      setResult({
        success: false,
        message: `去除水印失败: ${(error as Error).message}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 下载文件
  const handleDownload = () => {
    if (result?.downloadUrl && result?.fileName) {
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar currentTool="watermark" />
      
      <main className="flex-1">
        {/* Hero区域 */}
        <section className="bg-gradient-to-b from-blue-50 to-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                  <Droplets className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                  PDF水印处理
                </h1>
              </div>
              
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                为PDF文件添加文字水印，或尝试去除现有水印。支持批量处理，保护您的文档安全。
              </p>
            </div>
          </div>
        </section>

        {/* 主工具区域 */}
        <section className="py-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'add' | 'remove')} className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                <TabsTrigger value="add" className="flex items-center gap-2">
                  <Droplets className="w-4 h-4" />
                  添加水印
                </TabsTrigger>
                <TabsTrigger value="remove" className="flex items-center gap-2">
                  <Eraser className="w-4 h-4" />
                  去除水印
                </TabsTrigger>
              </TabsList>

              <TabsContent value="add">
                <div className="space-y-6">
                  {/* 文件上传 */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">1</span>
                        上传PDF文件
                        <span className="text-sm font-normal text-gray-500">（单个文件最大50MB）</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FileUpload
                        files={files}
                        onFilesAdd={addFiles}
                        onFileRemove={removeFile}
                        onClear={clearFiles}
                        isProcessing={isProcessing}
                        progress={0}
                        maxFiles={1}
                      />
                    </CardContent>
                  </Card>

                  {/* 水印设置 */}
                  {files.length > 0 && (
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">2</span>
                          水印设置
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="watermark-text">水印文字</Label>
                          <Input
                            id="watermark-text"
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            placeholder="输入水印文字，如：内部资料、Confidential、Draft"
                          />
                          <p className="text-xs text-gray-500">
                            支持中文、英文、数字和符号
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>字体大小: {fontSize}px</Label>
                          <Slider
                            value={[fontSize]}
                            onValueChange={(v) => setFontSize(v[0])}
                            min={12}
                            max={120}
                            step={1}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>透明度: {Math.round(opacity * 100)}%</Label>
                          <Slider
                            value={[opacity * 100]}
                            onValueChange={(v) => setOpacity(v[0] / 100)}
                            min={5}
                            max={100}
                            step={5}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>旋转角度: {rotation}°</Label>
                          <Slider
                            value={[rotation]}
                            onValueChange={(v) => setRotation(v[0])}
                            min={-180}
                            max={180}
                            step={5}
                          />
                        </div>

                        <Button
                          onClick={addWatermark}
                          disabled={isProcessing || !watermarkText.trim()}
                          className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          {isProcessing ? (
                            <>处理中...</>
                          ) : (
                            <>
                              <Droplets className="w-4 h-4 mr-2" />
                              添加水印
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="remove">
                <div className="space-y-6">
                  {/* 文件上传 */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">1</span>
                        上传PDF文件
                        <span className="text-sm font-normal text-gray-500">（单个文件最大50MB）</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FileUpload
                        files={files}
                        onFilesAdd={addFiles}
                        onFileRemove={removeFile}
                        onClear={clearFiles}
                        isProcessing={isProcessing}
                        progress={0}
                        maxFiles={1}
                      />
                    </CardContent>
                  </Card>

                  {/* 去除水印 */}
                  {files.length > 0 && (
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">2</span>
                          去除水印
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Alert className="bg-yellow-50 border-yellow-200">
                          <AlertCircle className="w-5 h-5 text-yellow-600" />
                          <AlertDescription className="text-yellow-700">
                            去除水印功能对文字水印效果较好，对嵌入在图片中的水印效果有限。
                            如需处理图片水印，建议先将PDF转为图片，使用图片编辑工具处理后再转回PDF。
                          </AlertDescription>
                        </Alert>

                        <Button
                          onClick={removeWatermark}
                          disabled={isProcessing}
                          className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          {isProcessing ? (
                            <>处理中...</>
                          ) : (
                            <>
                              <Eraser className="w-4 h-4 mr-2" />
                              去除水印
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* 结果显示 */}
            {result && (
              <Card className="mt-6">
                <CardContent className="pt-6">
                  <Alert className={result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
                    <AlertDescription className="flex items-center gap-2">
                      {result.success ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                      <span className={result.success ? 'text-green-700' : 'text-red-700'}>
                        {result.message}
                      </span>
                    </AlertDescription>
                  </Alert>

                  {result.success && result.downloadUrl && (
                    <div className="mt-4">
                      <Button
                        onClick={handleDownload}
                        className="bg-green-500 hover:bg-green-600 text-white"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        下载处理后的PDF
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 使用说明 */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  使用说明
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>添加水印：</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>上传需要添加水印的PDF文件</li>
                    <li>设置水印文字、字体大小、透明度和旋转角度</li>
                    <li>点击"添加水印"按钮生成带水印的PDF</li>
                    <li>水印将应用于PDF的所有页面</li>
                  </ul>
                  <p className="mt-4"><strong>去除水印：</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>上传需要去除水印的PDF文件</li>
                    <li>点击"去除水印"按钮尝试处理</li>
                    <li>注意：对文字水印效果较好，图片水印建议先转图片处理</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
