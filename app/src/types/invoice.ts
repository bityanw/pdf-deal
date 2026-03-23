// 发票数据结构
export interface InvoiceData {
  id: string;
  fileName: string;
  // 基本信息
  invoiceCode?: string;      // 发票代码
  invoiceNumber?: string;    // 发票号码
  invoiceDate?: string;      // 开票日期
  invoiceType?: string;      // 发票类型
  
  // 购买方信息
  buyerName?: string;        // 购买方名称
  buyerTaxNumber?: string;   // 购买方税号
  
  // 销售方信息
  sellerName?: string;       // 销售方名称
  sellerTaxNumber?: string;  // 销售方税号
  
  // 金额信息
  totalAmount?: number;      // 合计金额
  totalTax?: number;         // 合计税额
  amountWithTax?: number;    // 价税合计
  
  // 行程信息（交通费发票）
  departure?: string;        // 出发地
  destination?: string;      // 目的地
  departureDate?: string;    // 出发日期
  returnDate?: string;       // 返回日期
  vehicleType?: string;      // 交通工具类型（飞机、火车等）
  
  // 其他
  remarks?: string;          // 备注
  isValid: boolean;          // 是否解析成功
  parseError?: string;       // 解析错误信息
}

// Excel行数据
export interface ExcelRowData {
  date: string;              // 日期
  location: string;          // 地点/起讫地点
  planeWithInfo: number;     // 含个人信息交通费-飞机
  railway: number;           // 铁路费
  roadWater: number;         // 公路水路费
  planeWithoutInfo: number;  // 不含个人信息交通费-飞机
  trainBus: number;          // 火车、轮船、大巴
  taxi: number;              // 的士、公交
  accommodation: number;     // 住宿费
  other: number;             // 其它
  mealAllowance: number;     // 餐补
  subtotal: number;          // 小计
  remarks: string;           // 备注
}

// 解析结果
export interface ParseResult {
  success: boolean;
  message: string;
  invoices: InvoiceData[];
  excelUrl?: string;
  excelFileName?: string;
}

// 费用明细表行数据
export interface ExpenseDetailRow {
  date: string;           // 日期
  projectName: string;    // 项目名称（留空）
  category: string;       // 类别（留空）
  amount: number;         // 金额
  other: string;          // 其他（发票号+发票类型）
  subtotal: number;       // 小计
}

// 比对状态
export type MatchStatus =
  | 'matched'                      // 完全匹配
  | 'invoice_missing_itinerary'    // 发票缺少行程单
  | 'itinerary_missing_invoice'    // 行程单缺少发票
  | 'amount_mismatch'              // 金额不匹配
  | 'date_mismatch'                // 日期不匹配
  | 'unmatched';                   // 未匹配

// 比对结果
export interface MatchResult {
  id: string;
  status: MatchStatus;
  invoice?: InvoiceData;           // 发票数据
  itinerary?: InvoiceData;         // 行程单数据
  reason?: string;                 // 不匹配原因
  confidence?: number;             // 匹配置信度 0-100
  dateDiff?: number;               // 日期差异（天数）
  amountDiff?: number;             // 金额差异
}

// 比对统计
export interface MatchStatistics {
  total: number;                   // 总数
  matched: number;                 // 完全匹配
  invoiceMissing: number;          // 发票缺行程单
  itineraryMissing: number;        // 行程单缺发票
  amountMismatch: number;          // 金额不匹配
  dateMismatch: number;            // 日期不匹配
}
