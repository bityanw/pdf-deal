import { useState, useCallback } from 'react';
import { parseItineraryPDF, convertToExcelRows, generateExcel } from '@/utils/invoiceParser';
import { matchInvoicesWithItineraries, calculateMatchStatistics } from '@/utils/matchingEngine';
import type { InvoiceData } from '@/types/pdf';
import type { PDFFile } from '@/types/pdf';
import type { MatchResult, MatchStatistics } from '@/types/invoice';

// 解析结果
interface ParseResult {
  success: boolean;
  message: string;
  invoices: InvoiceData[];
  excelUrl?: string;
  excelFileName?: string;
}

// 统计信息
interface Statistics {
  total: number;
  success: number;
  failed: number;
  duplicate: number;
  invoice: number; // 发票数量
  itinerary: number; // 行程单数量
  byType: {
    train: number;
    taxi: number;
    flight: number;
    hotel: number;
    other: number;
  };
}

export function useInvoiceToExcel() {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [previewData, setPreviewData] = useState<any[][] | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStatistics | null>(null);

  const generateId = () => Math.random().toString(36).substring(2, 9);
  
  // 检测重复行程单
  const detectDuplicates = (invoicesList: InvoiceData[]): string[] => {
    const seen = new Map<string, string>();
    const duplicatesList: string[] = [];
    
    for (const inv of invoicesList) {
      if (!inv.isValid) continue;
      
      // 生成唯一键：日期+金额+类型
      const key = `${inv.departureDate || inv.invoiceDate}_${inv.amountWithTax}_${inv.invoiceType}`;
      
      if (seen.has(key)) {
        duplicatesList.push(inv.fileName || '未知文件');
      } else {
        seen.set(key, inv.fileName || '');
      }
    }
    
    return duplicatesList;
  };
  
  // 计算统计信息
  const calculateStatistics = (invoicesList: InvoiceData[]): Statistics => {
    // 分离发票和行程单
    const invoiceList = invoicesList.filter(inv =>
      inv.invoiceType?.startsWith('invoice_')
    );
    const itineraryList = invoicesList.filter(inv =>
      !inv.invoiceType?.startsWith('invoice_')
    );

    const stats: Statistics = {
      total: invoicesList.length,
      success: invoicesList.filter(inv => inv.isValid).length,
      failed: invoicesList.filter(inv => !inv.isValid).length,
      duplicate: 0,
      invoice: invoiceList.filter(inv => inv.isValid).length,
      itinerary: itineraryList.filter(inv => inv.isValid).length,
      byType: {
        train: 0,
        taxi: 0,
        flight: 0,
        hotel: 0,
        other: 0,
      },
    };

    for (const inv of itineraryList) {
      if (inv.isValid && inv.invoiceType) {
        const type = inv.invoiceType as keyof typeof stats.byType;
        if (type in stats.byType) {
          stats.byType[type]++;
        }
      }
    }

    return stats;
  };

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

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        errors.push(`「${file.name}」文件大小超过10MB限制`);
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
      const updatedFiles = [...files, ...validFiles];
      setFiles(updatedFiles);
      await parseInvoices(updatedFiles);
    }

    return errors;
  }, [files]);

  // 生成预览数据
  const generatePreviewData = (rows: any[]) => {
    const headers = [
      ['差旅费报销明细表', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['日期', '地点', '含个人信息交通费', '', '', '旅客运输服务电子发票（如滴滴打车发票）', '不含个人信息交通费', '', '', '住宿费', '其它', '餐补', '小计', '备注'],
      ['', '', '飞机', '铁路费', '公路水路费（即轮船、大巴）', '', '飞机', '火车、轮船、大巴', '的士.公交', '', '', '', '', ''],
    ];
    
    const dataRows = rows.map(row => [
      row.date,
      row.location,
      row.planeWithInfo || '',
      row.railway || '',
      row.roadWater || '',
      '',
      row.planeWithoutInfo || '',
      row.trainBus || '',
      row.taxi || '',
      row.accommodation || '',
      row.other || '',
      row.mealAllowance || '',
      row.subtotal || '',
      row.remarks,
    ]);
    
    const totalRow = [
      '', '合计',
      rows.reduce((sum, r) => sum + r.planeWithInfo, 0),
      rows.reduce((sum, r) => sum + r.railway, 0),
      rows.reduce((sum, r) => sum + r.roadWater, 0),
      '',
      rows.reduce((sum, r) => sum + r.planeWithoutInfo, 0),
      rows.reduce((sum, r) => sum + r.trainBus, 0),
      rows.reduce((sum, r) => sum + r.taxi, 0),
      rows.reduce((sum, r) => sum + r.accommodation, 0),
      rows.reduce((sum, r) => sum + r.other, 0),
      rows.reduce((sum, r) => sum + r.mealAllowance, 0),
      rows.reduce((sum, r) => sum + r.subtotal, 0),
      '',
    ];
    
    return [...headers, ...dataRows, totalRow];
  };

  // 解析发票
  const parseInvoices = async (fileList: PDFFile[]) => {
    setIsProcessing(true);
    setProgress(0);

    const parsedInvoices: InvoiceData[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const pdfFile = fileList[i];
      const parseResult = await parseItineraryPDF(pdfFile.file);
      
      if (parseResult.success) {
        parsedInvoices.push(parseResult.data);
      } else {
        const failedInvoice: InvoiceData = {
          ...parseResult.data,
          isValid: false,
          parseError: parseResult.error,
        };
        parsedInvoices.push(failedInvoice);
        errors.push(`「${pdfFile.name}」: ${parseResult.error}`);
      }
      
      setProgress(Math.round(((i + 1) / fileList.length) * 100));
    }

    setInvoices(parsedInvoices);

    // 检测重复
    const dupList = detectDuplicates(parsedInvoices);
    setDuplicates(dupList);

    // 计算统计
    const stats = calculateStatistics(parsedInvoices);
    stats.duplicate = dupList.length;
    setStatistics(stats);

    // 执行比对
    const matches = matchInvoicesWithItineraries(parsedInvoices);
    setMatchResults(matches);

    const matchStatistics = calculateMatchStatistics(matches);
    setMatchStats(matchStatistics);

    const validInvoices = parsedInvoices.filter(inv => inv.isValid);

    if (validInvoices.length > 0) {
      generateExcelResult(validInvoices, dupList);
    } else {
      setResult({
        success: false,
        message: errors.join('; ') || '未能成功解析任何文件',
        invoices: parsedInvoices,
      });
      setPreviewData(null);
    }

    setIsProcessing(false);
  };

  // 生成Excel结果
  const generateExcelResult = (validInvoices: InvoiceData[], dupList?: string[]) => {
    try {
      const XLSX = window.XLSX;
      if (!XLSX) {
        setResult({
          success: false,
          message: 'Excel生成库未加载，请刷新页面重试',
          invoices: validInvoices,
        });
        return;
      }
      
      const rows = convertToExcelRows(validInvoices);
      
      // 生成预览数据
      const preview = generatePreviewData(rows);
      setPreviewData(preview);
      
      const excelBlob = generateExcel(rows);
      const excelUrl = URL.createObjectURL(excelBlob);
      
      const invalidCount = invoices.length - validInvoices.length;
      let message = `成功解析 ${validInvoices.length} 个文件`;
      if (invalidCount > 0) {
        message += `，${invalidCount} 个解析失败`;
      }
      if (dupList && dupList.length > 0) {
        message += `，检测到 ${dupList.length} 个重复`;
      }

      setResult({
        success: true,
        message,
        invoices: validInvoices,
        excelUrl,
        excelFileName: `差旅费报销明细_${new Date().toISOString().slice(0, 10)}.xlsx`,
      });
    } catch (error) {
      setResult({
        success: false,
        message: '生成Excel失败: ' + (error as Error).message,
        invoices: validInvoices,
      });
      setPreviewData(null);
    }
  };

  // 移除文件
  const removeFile = useCallback(async (id: string) => {
    const updatedFiles = files.filter(f => f.id !== id);
    setFiles(updatedFiles);
    
    if (updatedFiles.length > 0) {
      await parseInvoices(updatedFiles);
    } else {
      setInvoices([]);
      setResult(null);
      setPreviewData(null);
    }
  }, [files]);

  // 清空文件
  const clearFiles = useCallback(() => {
    setFiles([]);
    setInvoices([]);
    setResult(null);
    setPreviewData(null);
    setProgress(0);
    setMatchResults([]);
    setMatchStats(null);
  }, []);

  // 下载Excel
  const downloadExcel = useCallback(() => {
    if (result?.excelUrl && result?.excelFileName) {
      const link = document.createElement('a');
      link.href = result.excelUrl;
      link.download = result.excelFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [result]);

  return {
    files,
    invoices,
    isProcessing,
    progress,
    result,
    previewData,
    statistics,
    duplicates,
    matchResults,
    matchStats,
    addFiles,
    removeFile,
    clearFiles,
    downloadExcel,
  };
}
