export interface PDFFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  thumbnail?: string;
}

export interface ProcessingOptions {
  mergeMode: 'two-per-page' | 'four-per-page';
  outputFormat: 'hd-pdf' | 'image' | 'pdf';
}

export interface PDFTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'generate' | 'convert' | 'page' | 'encrypt' | 'invoice' | 'watermark' | 'other';
  href: string;
  isHot?: boolean;
  isNew?: boolean;
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  downloadUrl?: string;
  fileName?: string;
}

// 发票数据
export interface InvoiceData {
  id: string;
  fileName: string;
  // 基本信息
  invoiceCode?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceType?: string;
  
  // 购买方信息
  buyerName?: string;
  buyerTaxNumber?: string;
  
  // 销售方信息
  sellerName?: string;
  sellerTaxNumber?: string;
  
  // 金额信息
  totalAmount?: number;
  totalTax?: number;
  amountWithTax?: number;
  
  // 行程信息
  departure?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  vehicleType?: string;
  
  // 其他
  remarks?: string;
  isValid: boolean;
  parseError?: string;
}

// Excel行数据
export interface ExcelRowData {
  date: string;
  location: string;
  planeWithInfo: number;
  railway: number;
  roadWater: number;
  planeWithoutInfo: number;
  trainBus: number;
  taxi: number;
  accommodation: number;
  other: number;
  mealAllowance: number;
  subtotal: number;
  remarks: string;
}
