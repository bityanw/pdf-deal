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
