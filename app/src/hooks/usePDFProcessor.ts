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
    options: ProcessingOptions,
    sortedFiles?: PDFFile[],
    invoiceCount?: number
  ): Promise<ProcessingResult> => {
    const filesToProcess = sortedFiles || files;

    if (filesToProcess.length === 0) {
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

      // 记录发票页面的实际数量（不是文件数量）
      let actualInvoicePageCount = 0;
      const providedInvoiceFileCount = invoiceCount || 0;

      for (let fileIndex = 0; fileIndex < filesToProcess.length; fileIndex++) {
        const pdfFile = filesToProcess[fileIndex];
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

          // 如果当前文件是发票文件，累加页面数
          if (fileIndex < providedInvoiceFileCount) {
            actualInvoicePageCount += pages.length;
          }

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
      // 如果提供了invoiceCount，需要确保发票和行程单不在同一页
      const invoicesPerPage = options.mergeMode === 'two-per-page' ? 2 : 4;
      const totalInvoiceCount = actualInvoicePageCount;

      console.log(`发票文件数: ${providedInvoiceFileCount}, 发票页面数: ${actualInvoicePageCount}, 总页面数: ${allPages.length}`);

      if (options.mergeMode === 'two-per-page') {
        // 每页2张发票，左右排列（横版）

        const verticalMargin = 5;    // 上下边距（减小以增大发票尺寸）
        const horizontalMargin = 5;  // 左右边距（减小以增大发票尺寸）
        const spacing = 5;           // 两张发票之间的间距（减小以增大发票尺寸）

        const availableWidth = (a4Width - 2 * horizontalMargin - spacing) / 2;
        const availableHeight = a4Height - 2 * verticalMargin;

        let i = 0;
        while (i < allPages.length) {
          const newPage = mergedPdf.addPage([a4Width, a4Height]);

          const isFirstInvoice = i < totalInvoiceCount;

          console.log(`处理页面 ${i}: ${isFirstInvoice ? '发票' : '行程单'}, totalInvoiceCount=${totalInvoiceCount}`);

          // 检查是否可以放置第2张
          let canPlaceSecond = false;
          if (i + 1 < allPages.length) {
            const isSecondInvoice = i + 1 < totalInvoiceCount;
            const sameType = (isFirstInvoice && isSecondInvoice) || (!isFirstInvoice && !isSecondInvoice);

            console.log(`  检查页面 ${i + 1}: ${isSecondInvoice ? '发票' : '行程单'}, sameType=${sameType}`);

            if (sameType) {
              canPlaceSecond = true;
            } else {
              console.log(`  类型不同，不能放在同一页`);
            }
          }

          // 计算统一缩放比例（基于本页要放置的所有页面）
          let unifiedScale = Infinity;

          // 第1张的缩放
          const size1 = allOriginalSizes[i];
          const scale1 = Math.min(
            availableWidth / size1.width,
            availableHeight / size1.height
          );
          unifiedScale = Math.min(unifiedScale, scale1);

          // 如果有第2张，也计算它的缩放
          if (canPlaceSecond) {
            const size2 = allOriginalSizes[i + 1];
            const scale2 = Math.min(
              availableWidth / size2.width,
              availableHeight / size2.height
            );
            unifiedScale = Math.min(unifiedScale, scale2);
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
          if (canPlaceSecond) {
            const page2 = allPages[i + 1];
            const scaledWidth2 = page2.width * unifiedScale;
            const scaledHeight2 = page2.height * unifiedScale;

            newPage.drawPage(page2, {
              x: horizontalMargin + availableWidth + spacing + (availableWidth - scaledWidth2) / 2,
              y: (a4Height - scaledHeight2) / 2,
              width: scaledWidth2,
              height: scaledHeight2,
            });

            console.log(`  放置了2张，索引 ${i} 和 ${i + 1}，统一缩放=${unifiedScale.toFixed(3)}`);
            i += 2;
          } else {
            console.log(`  只放置了1张，索引 ${i}，缩放=${unifiedScale.toFixed(3)}`);
            i += 1;
            if (i === totalInvoiceCount && i < allPages.length) {
              console.log(`发票结束，行程单从下一页开始`);
            }
          }
        }
      } else {
        // 每页4张发票，2x2网格排列
        const verticalMargin = 5;    // 垂直边距（减小以增大发票尺寸）
        const horizontalMargin = 5;  // 水平边距（减小以增大发票尺寸）
        const colSpacing = 5;        // 列间距（减小以增大发票尺寸）
        const rowSpacing = 5;        // 行间距（减小以增大发票尺寸）

        let i = 0;
        while (i < allPages.length) {
          const newPage = mergedPdf.addPage([a4Width, a4Height]);

          // 收集本页可以放置的页面（最多4张，且必须是同类型）
          const pageIndices: number[] = [];
          const isFirstInvoice = i < totalInvoiceCount;

          for (let j = 0; j < invoicesPerPage && i + j < allPages.length; j++) {
            const currentIndex = i + j;
            const isCurrentInvoice = currentIndex < totalInvoiceCount;

            // 检查类型是否一致
            if ((isFirstInvoice && isCurrentInvoice) || (!isFirstInvoice && !isCurrentInvoice)) {
              pageIndices.push(currentIndex);
            } else {
              // 遇到不同类型，停止
              console.log(`索引 ${currentIndex} 类型不同，本页只放置 ${pageIndices.length} 张`);
              break;
            }
          }

          // 为本页的发票计算统一缩放比例
          let unifiedScale = Infinity;

          // 预估单元格大小
          const estimatedCellWidth = (a4Width - 2 * horizontalMargin - colSpacing) / 2;
          const estimatedCellHeight = (a4Height - 2 * verticalMargin - rowSpacing) / 2;

          for (const idx of pageIndices) {
            const size = allOriginalSizes[idx];
            const scale = Math.min(
              estimatedCellWidth / size.width,
              estimatedCellHeight / size.height
            );
            unifiedScale = Math.min(unifiedScale, scale);
          }

          // 计算每个发票的实际缩放尺寸（使用统一缩放比例）
          const scaledSizes = pageIndices.map(idx => ({
            width: allOriginalSizes[idx].width * unifiedScale,
            height: allOriginalSizes[idx].height * unifiedScale
          }));

          // 找出最大的宽度和高度作为单元格尺寸
          const maxScaledWidth = Math.max(...scaledSizes.map(s => s.width));
          const maxScaledHeight = Math.max(...scaledSizes.map(s => s.height));

          const cellWidth = maxScaledWidth;
          const cellHeight = maxScaledHeight;

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

          for (let j = 0; j < pageIndices.length; j++) {
            const page = allPages[pageIndices[j]];
            const pos = positions[j];
            const scaledSize = scaledSizes[j];

            // 计算单元格内居中的位置
            const cellX = startX + pos.col * (cellWidth + colSpacing);
            const cellY = startY + pos.row * (cellHeight + rowSpacing);

            // 在单元格内居中
            const x = cellX + (cellWidth - scaledSize.width) / 2;
            const y = cellY + (cellHeight - scaledSize.height) / 2;

            newPage.drawPage(page, {
              x,
              y,
              width: scaledSize.width,
              height: scaledSize.height,
            });
          }

          console.log(`放置了 ${pageIndices.length} 张，统一缩放=${unifiedScale.toFixed(3)}`);

          // 移动索引
          i += pageIndices.length;

          if (i === totalInvoiceCount && i < allPages.length) {
            console.log(`发票结束，行程单从下一页开始`);
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
