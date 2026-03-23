import { useState, useCallback, useRef } from 'react';
import { PDFDocument, PDFEmbeddedPage } from 'pdf-lib';
import type { PDFFile, ProcessingOptions, ProcessingResult } from '@/types/pdf';

// 验证PDF文件头
async function isValidPDF(file: File): Promise<boolean> {
  try {
    const arrayBuffer = await file.slice(0, 8).arrayBuffer();
    const header = new Uint8Array(arrayBuffer);
    const headerStr = String.fromCharCode(...header);
    return headerStr.startsWith('%PDF-');
  } catch {
    return false;
  }
}

// 获取文件扩展名
function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
}

export function usePDFProcessor() {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const addFiles = useCallback(async (newFiles: FileList | null): Promise<string[]> => {
    if (!newFiles) return [];

    const errors: string[] = [];
    const validFiles: PDFFile[] = [];

    for (const file of Array.from(newFiles)) {
      const ext = getFileExtension(file.name);
      if (ext !== 'pdf') {
        errors.push(`「${file.name}」不是PDF文件`);
        continue;
      }

      if (file.type !== 'application/pdf' && !file.type.includes('pdf')) {
        errors.push(`「${file.name}」文件类型不正确`);
        continue;
      }

      const isValid = await isValidPDF(file);
      if (!isValid) {
        errors.push(`「${file.name}」不是有效的PDF文件或文件已损坏`);
        continue;
      }

      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        errors.push(`「${file.name}」文件大小超过100MB限制`);
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

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setError(null);
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setProgress(0);
    setError(null);
  }, []);

  const mergeInvoices = useCallback(async (
    options: ProcessingOptions
  ): Promise<ProcessingResult> => {
    if (files.length === 0) {
      return { success: false, message: '请先上传PDF文件' };
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const mergedPdf = await PDFDocument.create();

      // A4 尺寸 (点) - 横向：841.89 x 595.28 (宽 x 高)
      const a4Width = 841.89;   // 横向宽度
      const a4Height = 595.28;  // 横向高度

      // 边距（保留变量定义以便将来使用）

      // 收集所有PDF页面
      const allPages: PDFEmbeddedPage[] = [];
      const allOriginalSizes: { width: number; height: number }[] = [];
      
      for (const pdfFile of files) {
        try {
          const arrayBuffer = await pdfFile.file.arrayBuffer();
          let sourcePdf;
          try {
            sourcePdf = await PDFDocument.load(arrayBuffer, {
              updateMetadata: false,
              ignoreEncryption: true,
            });
          } catch (loadError) {
            console.error(`加载PDF失败: ${pdfFile.name}`, loadError);
            return {
              success: false,
              message: `「${pdfFile.name}」文件损坏或格式不正确，请检查文件是否有效`,
            };
          }

          const pages = sourcePdf.getPages();
          const embeddedPages = await mergedPdf.embedPages(pages);
          allPages.push(...embeddedPages);
          
          // 收集原始发票尺寸，用于计算统一缩放比例
          pages.forEach(page => {
            const { width, height } = page.getSize();
            allOriginalSizes.push({ width, height });
          });
        } catch (fileError) {
          console.error(`处理文件失败: ${pdfFile.name}`, fileError);
          return {
            success: false,
            message: `处理「${pdfFile.name}」时出错: ${(fileError as Error).message}`,
          };
        }
      }

      // 根据合并模式将页面排列到A4纸上
      
      if (options.mergeMode === 'two-per-page') {
        // 每页2张发票，左右排列（横版）
        const invoicesPerPage = 2;

        const verticalMargin = 30;   // 上下边距
        const horizontalMargin = 40; // 左右边距
        const spacing = 20;          // 两张发票之间的间距

        const availableWidth = (a4Width - 2 * horizontalMargin - spacing) / 2;
        const availableHeight = a4Height - 2 * verticalMargin;

        for (let i = 0; i < allPages.length; i += invoicesPerPage) {
          const newPage = mergedPdf.addPage([a4Width, a4Height]);

          // 为本页的发票计算统一缩放比例（只考虑本页的2张）
          let unifiedScale = Infinity;
          for (let j = 0; j < invoicesPerPage && i + j < allPages.length; j++) {
            const size = allOriginalSizes[i + j];
            const scale = Math.min(
              availableWidth / size.width,
              availableHeight / size.height
            );
            unifiedScale = Math.min(unifiedScale, scale);
          }

          // 放置第1张发票（左侧）
          if (i < allPages.length) {
            const page1 = allPages[i];
            const scaledWidth1 = page1.width * unifiedScale;
            const scaledHeight1 = page1.height * unifiedScale;

            newPage.drawPage(page1, {
              x: horizontalMargin + (availableWidth - scaledWidth1) / 2,
              y: (a4Height - scaledHeight1) / 2,
              width: scaledWidth1,
              height: scaledHeight1,
            });
          }

          // 放置第2张发票（右侧）
          if (i + 1 < allPages.length) {
            const page2 = allPages[i + 1];
            const scaledWidth2 = page2.width * unifiedScale;
            const scaledHeight2 = page2.height * unifiedScale;

            newPage.drawPage(page2, {
              x: horizontalMargin + availableWidth + spacing + (availableWidth - scaledWidth2) / 2,
              y: (a4Height - scaledHeight2) / 2,
              width: scaledWidth2,
              height: scaledHeight2,
            });
          }
        }
      } else {
        // 每页4张发票，2x2网格排列
        const invoicesPerPage = 4;
        const verticalMargin = 40; // 垂直边距
        const horizontalMargin = 30; // 水平边距
        const colSpacing = 10; // 列间距
        const rowSpacing = 10; // 行间距
        
        for (let i = 0; i < allPages.length; i += invoicesPerPage) {
          const newPage = mergedPdf.addPage([a4Width, a4Height]);
          
          // 为本页的4张发票计算统一缩放比例和单元格大小（只考虑本页的4张）
          let unifiedScale = Infinity;
          
          // 先尝试计算本页发票的最大可能尺寸
          for (let j = 0; j < invoicesPerPage && i + j < allPages.length; j++) {
            const size = allOriginalSizes[i + j];
            // 预估单元格大小（初步）
            const estimatedCellWidth = (a4Width - 2 * horizontalMargin - colSpacing) / 2;
            const estimatedCellHeight = (a4Height - 2 * verticalMargin - rowSpacing) / 2;
            
            const scale = Math.min(
              estimatedCellWidth / size.width,
              estimatedCellHeight / size.height
            );
            unifiedScale = Math.min(unifiedScale, scale);
          }
          
          // 计算实际的单元格大小和布局
          const samplePage = allPages[i]; // 使用第一张发票作为参考（所有发票已嵌入，尺寸相同）
          const scaledWidth = samplePage.width * unifiedScale;
          const scaledHeight = samplePage.height * unifiedScale;
          
          // 根据缩放后的实际尺寸重新计算单元格大小和边距，实现精确对齐
          const cellWidth = scaledWidth;
          const cellHeight = scaledHeight;
          
          // 计算总宽度和总高度，使发票在页面中居中
          const totalWidth = cellWidth * 2 + colSpacing;
          const totalHeight = cellHeight * 2 + rowSpacing;
          
          const startX = (a4Width - totalWidth) / 2;
          const startY = (a4Height - totalHeight) / 2;
          
          // 4个位置：左上、右上、左下、右下
          const positions = [
            { col: 0, row: 1 }, // 左上
            { col: 1, row: 1 }, // 右上
            { col: 0, row: 0 }, // 左下
            { col: 1, row: 0 }, // 右下
          ];
          
          for (let j = 0; j < invoicesPerPage && i + j < allPages.length; j++) {
            const page = allPages[i + j];
            const pos = positions[j];
            
            // 计算精确对齐的位置
            const x = startX + pos.col * (cellWidth + colSpacing);
            const y = startY + pos.row * (cellHeight + rowSpacing);
            
            newPage.drawPage(page, {
              x,
              y,
              width: cellWidth,
              height: cellHeight,
            });
          }
        }
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      const totalPages = Math.ceil(allPages.length / (options.mergeMode === 'two-per-page' ? 2 : 4));

      return {
        success: true,
        message: `成功合并 ${allPages.length} 张发票到 ${totalPages} 页A4纸`,
        downloadUrl,
        fileName: `合并发票_${new Date().toISOString().slice(0, 10)}.pdf`,
      };
    } catch (error) {
      console.error('PDF处理错误:', error);
      const errorMessage = (error as Error).message;
      
      if (errorMessage.includes('No PDF header')) {
        return {
          success: false,
          message: 'PDF文件格式不正确或文件已损坏，请检查上传的文件是否为有效的PDF',
        };
      }
      
      return {
        success: false,
        message: 'PDF处理失败: ' + errorMessage,
      };
    } finally {
      setIsProcessing(false);
    }
  }, [files]);

  const mergePDFs = useCallback(async (): Promise<ProcessingResult> => {
    if (files.length === 0) {
      return { success: false, message: '请先上传PDF文件' };
    }

    if (files.length === 1) {
      return { success: false, message: '请至少上传2个PDF文件进行合并' };
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const mergedPdf = await PDFDocument.create();
      let processedCount = 0;

      for (const pdfFile of files) {
        try {
          const arrayBuffer = await pdfFile.file.arrayBuffer();
          
          let sourcePdf;
          try {
            sourcePdf = await PDFDocument.load(arrayBuffer, {
              updateMetadata: false,
              ignoreEncryption: true,
            });
          } catch (loadError) {
            console.error(`加载PDF失败: ${pdfFile.name}`, loadError);
            return {
              success: false,
              message: `「${pdfFile.name}」文件损坏或格式不正确`,
            };
          }
          
          const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
          
          processedCount++;
          setProgress(Math.round((processedCount / files.length) * 100));
        } catch (fileError) {
          console.error(`处理文件失败: ${pdfFile.name}`, fileError);
          return {
            success: false,
            message: `处理「${pdfFile.name}」时出错`,
          };
        }
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      return {
        success: true,
        message: `成功合并 ${files.length} 个PDF文件`,
        downloadUrl,
        fileName: `合并PDF_${new Date().toISOString().slice(0, 10)}.pdf`,
      };
    } catch (error) {
      console.error('PDF合并错误:', error);
      return {
        success: false,
        message: 'PDF合并失败: ' + (error as Error).message,
      };
    } finally {
      setIsProcessing(false);
    }
  }, [files]);

  const splitPDF = useCallback(async (
    pageRanges: string
  ): Promise<ProcessingResult> => {
    if (files.length === 0) {
      return { success: false, message: '请先上传PDF文件' };
    }

    if (files.length > 1) {
      return { success: false, message: '请只上传1个PDF文件进行分割' };
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const pdfFile = files[0];
      const arrayBuffer = await pdfFile.file.arrayBuffer();
      
      let sourcePdf;
      try {
        sourcePdf = await PDFDocument.load(arrayBuffer, {
          updateMetadata: false,
          ignoreEncryption: true,
        });
      } catch (loadError) {
        console.error('加载PDF失败:', loadError);
        return {
          success: false,
          message: 'PDF文件损坏或格式不正确',
        };
      }
      
      const totalPages = sourcePdf.getPageCount();

      const ranges = pageRanges.split(',').map(range => {
        const [start, end] = range.trim().split('-').map(Number);
        return { start: start - 1, end: end ? end - 1 : start - 1 };
      });

      const newPdf = await PDFDocument.create();
      let pageCount = 0;

      for (const range of ranges) {
        for (let i = range.start; i <= range.end && i < totalPages; i++) {
          if (i >= 0) {
            const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
            newPdf.addPage(copiedPage);
            pageCount++;
          }
        }
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      return {
        success: true,
        message: `成功提取 ${pageCount} 页`,
        downloadUrl,
        fileName: `分割PDF_${new Date().toISOString().slice(0, 10)}.pdf`,
      };
    } catch (error) {
      console.error('PDF分割错误:', error);
      return {
        success: false,
        message: 'PDF分割失败: ' + (error as Error).message,
      };
    } finally {
      setIsProcessing(false);
    }
  }, [files]);

  const compressPDF = useCallback(async (): Promise<ProcessingResult> => {
    if (files.length === 0) {
      return { success: false, message: '请先上传PDF文件' };
    }

    if (files.length > 1) {
      return { success: false, message: '请只上传1个PDF文件进行压缩' };
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const pdfFile = files[0];
      const arrayBuffer = await pdfFile.file.arrayBuffer();
      
      let sourcePdf;
      try {
        sourcePdf = await PDFDocument.load(arrayBuffer, {
          updateMetadata: false,
          ignoreEncryption: true,
        });
      } catch (loadError) {
        console.error('加载PDF失败:', loadError);
        return {
          success: false,
          message: 'PDF文件损坏或格式不正确',
        };
      }

      const pdfBytes = await sourcePdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      const originalSize = pdfFile.size;
      const compressedSize = blob.size;
      const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

      return {
        success: true,
        message: `压缩完成，体积减小 ${ratio}%`,
        downloadUrl,
        fileName: `压缩_${pdfFile.name}`,
      };
    } catch (error) {
      console.error('PDF压缩错误:', error);
      return {
        success: false,
        message: 'PDF压缩失败: ' + (error as Error).message,
      };
    } finally {
      setIsProcessing(false);
    }
  }, [files]);

  return {
    files,
    isProcessing,
    progress,
    error,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    mergeInvoices,
    mergePDFs,
    splitPDF,
    compressPDF,
  };
}
