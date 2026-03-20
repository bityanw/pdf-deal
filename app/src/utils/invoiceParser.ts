import type { InvoiceData, ExcelRowData } from '@/types/pdf';
import type { ExpenseDetailRow } from '@/types/invoice';

// 行程单类型（包含发票类型）
type ItineraryType = 'taxi' | 'train' | 'flight' | 'hotel' | 'other' | 'invoice_transport' | 'invoice_hotel' | 'invoice_other';

// 解析结果
interface ParseResult {
  success: boolean;
  data: InvoiceData;
  error?: string;
}

// 获取PDF.js对象
function getPDFJS(): any {
  const pdfjs = (window as any).pdfjsLib;
  if (pdfjs) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return pdfjs;
  }
  throw new Error('PDF.js库未加载，请刷新页面重试');
}

// 解析PDF行程单
export async function parseItineraryPDF(file: File): Promise<ParseResult> {
  const invoiceData: InvoiceData = {
    id: Math.random().toString(36).substring(2, 9),
    fileName: file.name,
    isValid: false,
  };

  try {
    const pdfjs = getPDFJS();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    // 提取所有页面的文本
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join('\n');
      fullText += pageText + '\n';
    }

    // 首先检测PDF类型（发票 vs 行程单）
    const pdfTypeInfo = detectPDFType(fullText, file.name);
    
    // 输出检测日志
    if (pdfTypeInfo.logs) {
      console.log(pdfTypeInfo.logs.join('\n'));
    }
    
    // 如果是发票文件，解析发票信息
    if (pdfTypeInfo.type === 'invoice') {
      invoiceData.invoiceType = pdfTypeInfo.subtype || 'invoice_other';

      // 提取发票号码
      const invoiceNumberMatch = fullText.match(/发票号码[：:]\s*(\d{8,20})/);
      if (invoiceNumberMatch) {
        invoiceData.invoiceNumber = invoiceNumberMatch[1];
      }

      // 提取发票代码
      const invoiceCodeMatch = fullText.match(/发票代码[：:]\s*(\d{10,12})/);
      if (invoiceCodeMatch) {
        invoiceData.invoiceCode = invoiceCodeMatch[1];
      }

      // 提取开票日期
      const dateMatch = fullText.match(/开票日期[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (dateMatch) {
        invoiceData.invoiceDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      }

      // 提取价税合计
      const amountMatches = fullText.matchAll(/[¥￥]\s*(\d+\.?\d*)/g);
      const amounts = Array.from(amountMatches).map(m => parseFloat(m[1]));
      if (amounts.length > 0) {
        // 通常最大的金额是价税合计
        invoiceData.amountWithTax = Math.max(...amounts);
      }

      // 如果没找到带¥符号的，尝试查找"价税合计"后的数字
      if (!invoiceData.amountWithTax) {
        const totalMatch = fullText.match(/价税合计[：:\s]*[¥￥]?\s*(\d+\.?\d*)/);
        if (totalMatch) {
          invoiceData.amountWithTax = parseFloat(totalMatch[1]);
        }
      }

      invoiceData.isValid = true;
      return {
        success: true,
        data: invoiceData,
      };
    }

    // 判断行程单类型
    const type = pdfTypeInfo.subtype || detectItineraryType(fullText);
    invoiceData.invoiceType = type;

    // 根据类型解析
    switch (type) {
      case 'taxi':
        return parseTaxiItinerary(fullText, invoiceData);
      case 'train':
        return parseTrainTicket(fullText, invoiceData);
      case 'flight':
        return parseFlightTicket(fullText, invoiceData);
      case 'hotel':
        return parseHotelReceipt(fullText, invoiceData);
      default:
        return parseGenericItinerary(fullText, invoiceData);
    }
  } catch (error) {
    console.error('解析PDF失败:', error);
    return {
      success: false,
      data: invoiceData,
      error: `PDF解析失败: ${(error as Error).message}`,
    };
  }
}

// 检测PDF类型
export type PDFType = 'invoice' | 'itinerary' | 'unknown';

// 检测是发票还是行程单 - 带详细日志
export function detectPDFType(text: string, fileName?: string): { type: PDFType; subtype?: ItineraryType; reason?: string; logs?: string[] } {
  const logs: string[] = [];
  logs.push(`[PDF类型检测] 文件名: ${fileName || '未知'}`);
  
  // PDF.js提取的文本可能每个字符被换行分隔，需要处理
  // 移除多余换行，合并被分隔的字符
  const normalizedText = text.replace(/\n+/g, '').replace(/\s+/g, ' ').trim();
  logs.push(`[PDF类型检测] 原始文本前200字符: ${text.substring(0, 200).replace(/\n/g, '|')}`);
  logs.push(`[PDF类型检测] 归一化文本前200字符: ${normalizedText.substring(0, 200)}`);
  
  // 使用归一化后的文本进行检测
  const checkText = normalizedText;
  
  // 检测是否为发票 - 使用多种关键词
  const invoiceKeywords = ['发票', '发票号码', '开票日期', '价税合计', '统一社会信用代码', '纳税人识别号', '税率', '税额'];
  const foundInvoiceKeywords = invoiceKeywords.filter(kw => checkText.includes(kw));
  logs.push(`[PDF类型检测] 找到发票关键词: ${foundInvoiceKeywords.join(', ') || '无'}`);
  
  // 检测是否为电子发票（处理被分隔的情况）
  const hasDianzi = checkText.includes('电子') || checkText.includes('电') && checkText.includes('子');
  const hasFapiao = checkText.includes('发票') || (checkText.includes('发') && checkText.includes('票'));
  const isElectronicInvoice = hasDianzi && hasFapiao;
  const hasInvoiceNumber = checkText.includes('发票号码') || /\d{20}/.test(checkText);
  const hasTaxInfo = checkText.includes('税率') || checkText.includes('税额') || checkText.includes('价税合计');
  
  logs.push(`[PDF类型检测] 包含"电子": ${hasDianzi}, 包含"发票": ${hasFapiao}`);
  logs.push(`[PDF类型检测] 有发票号码格式: ${hasInvoiceNumber}`);
  logs.push(`[PDF类型检测] 有税务信息: ${hasTaxInfo}`);
  
  // 如果满足多个发票特征，判定为发票
  const invoiceScore = (isElectronicInvoice ? 2 : 0) + (hasInvoiceNumber ? 2 : 0) + (hasTaxInfo ? 1 : 0) + foundInvoiceKeywords.length;
  logs.push(`[PDF类型检测] 发票特征得分: ${invoiceScore}/10`);
  
  if (invoiceScore >= 3 || foundInvoiceKeywords.length >= 2) {
    logs.push(`[PDF类型检测] 判定为: 发票`);
    
    // 检测发票类型
    const isTransportInvoice = checkText.includes('运输服务') || checkText.includes('客运服务') || checkText.includes('代订车服务');
    const isHotelInvoice = checkText.includes('住宿服务') || checkText.includes('代订住宿') || checkText.includes('经纪代理服务');
    
    logs.push(`[PDF类型检测] 运输服务发票: ${isTransportInvoice}`);
    logs.push(`[PDF类型检测] 住宿服务发票: ${isHotelInvoice}`);
    
    if (isTransportInvoice) {
      return { 
        type: 'invoice', 
        subtype: 'invoice_transport',
        reason: '检测到「电子发票-旅客运输服务」，这是发票文件，不是行程单。请上传高德/滴滴打车「行程单」PDF（非发票）',
        logs
      };
    }
    if (isHotelInvoice) {
      return { 
        type: 'invoice', 
        subtype: 'invoice_hotel',
        reason: '检测到「电子发票-住宿服务」，这是发票文件，不是住宿水单。请上传酒店「住宿水单」PDF（包含入住人、入离日期、房费等明细）',
        logs
      };
    }
    return { 
      type: 'invoice', 
      subtype: 'invoice_other',
      reason: '检测到「电子发票」，这是发票文件，不是行程单。本工具支持的是：高德/滴滴打车行程单、铁路电子客票、机票行程单、酒店住宿水单',
      logs
    };
  }
  
  // 检测行程单类型（使用归一化文本）
  const subtype = detectItineraryType(normalizedText);
  logs.push(`[PDF类型检测] 行程单类型检测结果: ${subtype}`);
  
  if (subtype !== 'other') {
    return { type: 'itinerary', subtype, logs };
  }
  
  logs.push(`[PDF类型检测] 判定为: 未知类型`);
  return { type: 'unknown', logs };
}

// 检测行程单类型
function detectItineraryType(text: string): ItineraryType {
  // 火车票 - 多种特征
  if (text.includes('铁路电子客票') || text.includes('中国铁路') || text.includes('12306')) {
    return 'train';
  }
  if (text.includes('站') && text.includes('开') && (text.includes('车') || text.includes('号'))) {
    return 'train';
  }
  if (text.includes('改签费') || text.includes('票价') || text.includes('二等座') || text.includes('一等座')) {
    return 'train';
  }
  
  // 打车行程单
  if (text.includes('高德地图') || (text.includes('行程单') && (text.includes('上车时间') || text.includes('服务商')))) {
    return 'taxi';
  }
  if (text.includes('滴滴') && text.includes('行程')) {
    return 'taxi';
  }
  if (text.includes('打车') && text.includes('行程')) {
    return 'taxi';
  }
  
  // 机票
  if (text.includes('航空') || text.includes('航班') || text.includes('机票')) {
    return 'flight';
  }
  if (text.includes('登机牌') || text.includes('boarding')) {
    return 'flight';
  }
  
  // 酒店住宿水单（必须有明细特征）
  if (text.includes('宾客水单') || text.includes('房费') || (text.includes('入住') && text.includes('离店'))) {
    return 'hotel';
  }
  
  return 'other';
}

// 解析打车行程单
function parseTaxiItinerary(text: string, data: InvoiceData): ParseResult {
  try {
    // 提取总行程时间范围
    const timeRangeMatch = text.match(/行程时间[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*至\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
    if (timeRangeMatch) {
      data.departureDate = timeRangeMatch[1].split(' ')[0];
      data.returnDate = timeRangeMatch[2].split(' ')[0];
    }
    
    // 提取总金额
    const totalAmountMatch = text.match(/合计\s*(\d+\.?\d*)\s*元/);
    if (totalAmountMatch) {
      data.amountWithTax = parseFloat(totalAmountMatch[1]);
    }
    
    // 提取行程人手机号
    const phoneMatch = text.match(/行程人手机号[：:]\s*(\d{11})/);
    if (phoneMatch) {
      data.buyerName = phoneMatch[1];
    }
    
    // 提取城市信息（从表格中的"城市"列）
    const cityMatches = text.match(/(\d{4}-\d{2}-\d{2}[\s\S]*?)([\u4e00-\u9fa5]{2,10}市)/g);
    const cities: string[] = [];
    if (cityMatches) {
      cityMatches.forEach(match => {
        const cityMatch = match.match(/([\u4e00-\u9fa5]{2,10}市)$/);
        if (cityMatch && !cities.includes(cityMatch[1])) {
          cities.push(cityMatch[1]);
        }
      });
    }
    // 如果有城市信息，设置目的地为第一个城市
    if (cities.length > 0) {
      data.destination = cities[0];
    }
    
    // 提取行程明细
    const trips: { date: string; from: string; to: string; amount: number; city?: string }[] = [];
    const lines = text.split('\n');
    let inTripTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('序号') && line.includes('服务商')) {
        inTripTable = true;
        continue;
      }
      
      if (inTripTable && line.includes('页码')) {
        break;
      }
      
      if (inTripTable && /^\d+\s+/.test(line)) {
        const tripMatch = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
        const amountMatch = line.match(/(\d+\.?\d*)\s*元/);
        
        if (tripMatch && amountMatch) {
          const tripDate = tripMatch[1].split(' ')[0];
          const amount = parseFloat(amountMatch[1]);
          let from = '';
          let to = '';
          let city = '';
          
          // 尝试从当前行提取城市
          const lineCityMatch = line.match(/([\u4e00-\u9fa5]{2,10}市)/);
          if (lineCityMatch) {
            city = lineCityMatch[1];
          }
          
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (!nextLine.includes('元') && !/^\d+$/.test(nextLine)) {
              const parts = nextLine.split(/[-至→]/);
              if (parts.length >= 2) {
                from = parts[0].trim();
                to = parts[1].trim();
              }
            }
          }
          
          trips.push({ date: tripDate, from, to, amount, city });
        }
      }
    }
    
    if (trips.length === 0) {
      const dateAmountMatches = text.matchAll(/(\d{4}-\d{2}-\d{2})[\s\S]*?(\d+\.?\d*)\s*元/g);
      for (const match of dateAmountMatches) {
        trips.push({ date: match[1], from: '', to: '', amount: parseFloat(match[2]) });
      }
    }
    
    if (trips.length > 0) {
      data.departureDate = trips[0].date;
      if (trips.length > 1) {
        data.returnDate = trips[trips.length - 1].date;
      }
      
      const locations = trips.map(t => {
        if (t.from && t.to) return `${t.from}-${t.to}`;
        return '';
      }).filter(Boolean);
      
      if (locations.length > 0) {
        data.remarks = locations.join('; ');
      }
    }
    
    data.vehicleType = data.buyerName ? '的士（含个人信息）' : '的士';
    data.isValid = true;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      data,
      error: `打车行程单解析失败: ${(error as Error).message}`,
    };
  }
}

// 解析火车票 - 最终修复版本
function parseTrainTicket(text: string, data: InvoiceData): ParseResult {
  const debugLogs: string[] = [];
  
  try {
    debugLogs.push(`[DEBUG] 开始解析火车票，文件名: ${data.fileName}`);
    debugLogs.push(`[DEBUG] PDF文本前500字符: ${text.substring(0, 500)}`);
    
    // 提取发票号码
    const invoiceMatch = text.match(/发票号码[：:]\s*(\d+)/);
    if (invoiceMatch) {
      data.invoiceNumber = invoiceMatch[1];
      debugLogs.push(`[DEBUG] 提取发票号码: ${data.invoiceNumber}`);
    }
    
    // 提取开票日期
    const dateMatch = text.match(/开票日期[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateMatch) {
      data.invoiceDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      debugLogs.push(`[DEBUG] 提取开票日期: ${data.invoiceDate}`);
    }
    
    // 提取乘车日期 - 从"XX:XX开"前面的日期提取
    const travelDateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*\d{2}:\d{2}开/);
    if (travelDateMatch) {
      data.departureDate = `${travelDateMatch[1]}-${travelDateMatch[2].padStart(2, '0')}-${travelDateMatch[3].padStart(2, '0')}`;
      debugLogs.push(`[DEBUG] 提取乘车日期: ${data.departureDate}`);
    }
    
    // 备选：从文件名提取日期（如"北京-济南5月26日187.pdf"）
    if (!data.departureDate && data.fileName) {
      // 匹配格式: X月X日 或 XX月XX日
      const fileDateMatch = data.fileName.match(/(\d{1,2})月(\d{1,2})日/);
      if (fileDateMatch) {
        // 尝试从文件名或当前年份推断年份
        const yearMatch = data.fileName.match(/(20\d{2})/);
        const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
        data.departureDate = `${year}-${fileDateMatch[1].padStart(2, '0')}-${fileDateMatch[2].padStart(2, '0')}`;
        debugLogs.push(`[DEBUG] 从文件名提取乘车日期: ${data.departureDate}`);
      }
    }
    
    // 提取车次
    const trainMatch = text.match(/([GDCZTKY]\d{2,4})/);
    if (trainMatch) {
      data.remarks = `车次: ${trainMatch[1]}`;
      debugLogs.push(`[DEBUG] 提取车次: ${trainMatch[1]}`);
    }
    
    // ========== 提取票价 - 关键修复 ==========
    // PDF.js提取的文本可能丢失中文字符，金额格式可能是: 187.00（没有¥符号）
    // 需要找所有数字金额，不依赖¥符号
    
    debugLogs.push(`[DEBUG] 开始提取票价...`);
    
    // 方法1: 找所有带¥符号的金额
    const amountWithSymbol = Array.from(text.matchAll(/[¥￥]\s*(\d+\.\d{2})/g));
    debugLogs.push(`[DEBUG] 带¥符号的金额: ${amountWithSymbol.length}个`);
    
    // 方法2: 找所有不带¥符号的金额（可能是纯数字价格）
    // 匹配格式: 空格或冒号后跟数字.数字2位
    const amountWithoutSymbol = Array.from(text.matchAll(/[:\s](\d{2,4}\.\d{2})\s/g));
    debugLogs.push(`[DEBUG] 不带¥符号的金额: ${amountWithoutSymbol.length}个`);
    
    // 合并所有金额
    const allAmounts: number[] = [];
    
    amountWithSymbol.forEach(m => {
      const val = parseFloat(m[1]);
      if (val >= 10 && val <= 5000) allAmounts.push(val);
    });
    
    amountWithoutSymbol.forEach(m => {
      const val = parseFloat(m[1]);
      if (val >= 10 && val <= 5000) allAmounts.push(val);
    });
    
    debugLogs.push(`[DEBUG] 所有有效金额: ${allAmounts.join(', ')}`);
    
    // 选择第一个有效金额作为票价
    if (allAmounts.length > 0) {
      data.amountWithTax = allAmounts[0];
      data.totalAmount = data.amountWithTax;
      debugLogs.push(`[DEBUG] 提取票价成功: ${data.amountWithTax}`);
    }
    
    // 方法3: 从文件名提取金额（如"北京-济南5月26日187.pdf"中的187）
    if (!data.amountWithTax && data.fileName) {
      const fileAmountMatch = data.fileName.match(/(\d{2,4})\.?\d*\.pdf$/);
      if (fileAmountMatch) {
        const fileAmount = parseFloat(fileAmountMatch[1]);
        if (fileAmount >= 10 && fileAmount <= 5000) {
          data.amountWithTax = fileAmount;
          data.totalAmount = data.amountWithTax;
          debugLogs.push(`[DEBUG] 从文件名提取票价: ${data.amountWithTax}`);
        }
      }
    }
    
    // 提取乘客姓名
    const nameMatch = text.match(/([\u4e00-\u9fa5]{2,4})\s*\d{17}[\d\u4e00-\u9fa5]*/);
    if (nameMatch) {
      data.buyerName = nameMatch[1];
      debugLogs.push(`[DEBUG] 提取乘客姓名: ${data.buyerName}`);
    }
    
    // 提取销售方名称
    const corpMatch = text.match(/([\u4e00-\u9fa5]+(?:科技|股份|有限|集团|公司))/);
    if (corpMatch) {
      data.sellerName = corpMatch[1];
      debugLogs.push(`[DEBUG] 提取销售方: ${data.sellerName}`);
    }
    
    // 提取出发站和到达站
    // 从文本中提取所有站点（中文+站）
    const stationMatches = text.match(/[\u4e00-\u9fa5]+?站/g);
    debugLogs.push(`[DEBUG] 找到站点: ${stationMatches?.join(', ') || '无'}`);
    
    // 从文件名提取地点（优先使用）
    let fromFile = '';
    let toFile = '';
    if (data.fileName) {
      const fileMatch = data.fileName.match(/([\u4e00-\u9fa5]+)[-至]([\u4e00-\u9fa5]+)/);
      if (fileMatch) {
        fromFile = fileMatch[1];
        toFile = fileMatch[2];
        debugLogs.push(`[DEBUG] 从文件名提取地点: ${fromFile} -> ${toFile}`);
      }
    }
    
    if (stationMatches && stationMatches.length > 0) {
      // 去重并过滤
      const uniqueStations = [...new Set(stationMatches)];
      const validStations = uniqueStations.filter(s => 
        s !== '国家税务总局' && 
        s !== '统一社会信用代码' &&
        s.length <= 6 &&
        s !== '站'
      );
      debugLogs.push(`[DEBUG] 有效站点: ${validStations.join(', ')}`);
      
      // 根据文件名匹配站点
      if (fromFile && toFile && validStations.length >= 2) {
        for (const station of validStations) {
          if (station.includes(fromFile) || fromFile.includes(station.replace('站', ''))) {
            data.departure = station;
          }
          if (station.includes(toFile) || toFile.includes(station.replace('站', ''))) {
            data.destination = station;
          }
        }
      }
      
      // 如果没匹配到，使用第一个和第二个站点
      if (!data.departure && validStations.length >= 1) {
        data.departure = validStations[0];
      }
      if (!data.destination && validStations.length >= 2) {
        data.destination = validStations[1];
      }
    }
    
    // 如果从文件名提取到了地点但站点没匹配到，直接使用文件名地点
    if ((!data.departure || !data.destination) && fromFile && toFile) {
      if (!data.departure) data.departure = fromFile;
      if (!data.destination) data.destination = toFile;
      debugLogs.push(`[DEBUG] 使用文件名地点作为站点`);
    }
    
    debugLogs.push(`[DEBUG] 出发站: ${data.departure}, 到达站: ${data.destination}`);
    
    data.vehicleType = '火车';
    
    // 验证必要字段
    if (!data.amountWithTax) {
      const errorMsg = '未能识别票价信息。调试信息:\n' + debugLogs.join('\n');
      console.error(errorMsg);
      return {
        success: false,
        data,
        error: errorMsg,
      };
    }
    
    data.isValid = true;
    debugLogs.push(`[DEBUG] 解析成功!`);
    console.log(debugLogs.join('\n'));
    return { success: true, data };
  } catch (error) {
    const errorMsg = `火车票解析失败: ${(error as Error).message}\n调试信息:\n${debugLogs.join('\n')}`;
    console.error(errorMsg);
    return {
      success: false,
      data,
      error: errorMsg,
    };
  }
}

// 解析机票
function parseFlightTicket(text: string, data: InvoiceData): ParseResult {
  try {
    const flightMatch = text.match(/航班号[：:]\s*([A-Z]{2}\d{3,4})/);
    if (flightMatch) {
      data.remarks = `航班: ${flightMatch[1]}`;
    }
    
    const cityMatch = text.match(/([\u4e00-\u9fa5]+)\s*[-→]\s*([\u4e00-\u9fa5]+)/);
    if (cityMatch) {
      data.departure = cityMatch[1];
      data.destination = cityMatch[2];
    }
    
    const dateMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (dateMatch) {
      data.departureDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    }
    
    const priceMatch = text.match(/(?:票价|合计|总价)[：:]\s*[¥￥]\s*(\d+\.?\d*)/);
    if (priceMatch) {
      data.amountWithTax = parseFloat(priceMatch[1]);
    }
    
    const nameMatch = text.match(/乘客[：:]\s*([\u4e00-\u9fa5]{2,4})/);
    if (nameMatch) {
      data.buyerName = nameMatch[1];
    }
    
    data.vehicleType = '飞机';
    data.isValid = true;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      data,
      error: `机票解析失败: ${(error as Error).message}`,
    };
  }
}

// 解析酒店住宿水单
function parseHotelReceipt(text: string, data: InvoiceData): ParseResult {
  try {
    const hotelMatch = text.match(/酒店名称[：:]\s*([^\n]+)/);
    if (hotelMatch) {
      data.sellerName = hotelMatch[1].trim();
    }
    
    const guestMatch = text.match(/入住人姓名[：:]\s*([^\n]+)/);
    if (guestMatch) {
      data.buyerName = guestMatch[1].trim();
    }
    
    const dateRangeMatch = text.match(/入离日期[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*-\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateRangeMatch) {
      data.departureDate = `${dateRangeMatch[1]}-${dateRangeMatch[2].padStart(2, '0')}-${dateRangeMatch[3].padStart(2, '0')}`;
      data.returnDate = `${dateRangeMatch[4]}-${dateRangeMatch[5].padStart(2, '0')}-${dateRangeMatch[6].padStart(2, '0')}`;
    }
    
    const totalMatch = text.match(/总金额\s*(\d+\.?\d*)/);
    if (totalMatch) {
      data.amountWithTax = parseFloat(totalMatch[1]);
      data.totalAmount = data.amountWithTax;
    }
    
    const roomMatch = text.match(/房型名称[：:]\s*([^\n]+)/);
    if (roomMatch) {
      data.remarks = roomMatch[1].trim();
    }
    
    // 从酒店地址提取城市
    const addressMatch = text.match(/酒店地址[：:]\s*([^\n]+)/);
    if (addressMatch) {
      const address = addressMatch[1];
      // 尝试匹配 XX市 格式
      const cityMatch = address.match(/([\u4e00-\u9fa5]{2,10}市)/);
      if (cityMatch) {
        data.destination = cityMatch[1];
      } else {
        // 尝试从地址开头提取城市名（如"济南历下区..."提取"济南"）
        const cityPrefixMatch = address.match(/^([\u4e00-\u9fa5]{2,10})(?:区|县|市)/);
        if (cityPrefixMatch) {
          data.destination = cityPrefixMatch[1];
        }
      }
    }
    
    // 如果从地址没提取到，尝试从酒店名称提取（如"济南万象城居酒店"）
    if (!data.destination && data.sellerName) {
      const hotelCityMatch = data.sellerName.match(/^([\u4e00-\u9fa5]{2,10})/);
      if (hotelCityMatch && hotelCityMatch[1].length >= 2) {
        data.destination = hotelCityMatch[1];
      }
    }
    
    data.vehicleType = '住宿';
    data.isValid = true;
    
    if (!data.amountWithTax) {
      return {
        success: false,
        data,
        error: '未能识别住宿金额，请检查水单格式',
      };
    }
    
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      data,
      error: `住宿水单解析失败: ${(error as Error).message}`,
    };
  }
}

// 通用行程单解析
function parseGenericItinerary(text: string, data: InvoiceData): ParseResult {
  try {
    const priceMatches = text.matchAll(/[¥￥]\s*(\d+\.?\d*)/g);
    const prices = Array.from(priceMatches).map(m => parseFloat(m[1]));
    if (prices.length > 0) {
      data.amountWithTax = Math.max(...prices);
    }
    
    const dateMatch = text.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})/);
    if (dateMatch) {
      data.departureDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    }
    
    const locationMatch = text.match(/([\u4e00-\u9fa5]+)[-至→]([\u4e00-\u9fa5]+)/);
    if (locationMatch) {
      data.departure = locationMatch[1];
      data.destination = locationMatch[2];
    }
    
    data.vehicleType = '其他';
    data.isValid = data.amountWithTax !== undefined;
    
    if (!data.isValid) {
      return {
        success: false,
        data,
        error: '无法识别行程单类型，请上传打车行程单、火车票、机票或住宿水单',
      };
    }
    
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      data,
      error: `行程单解析失败: ${(error as Error).message}`,
    };
  }
}

// 将发票数据转换为Excel行数据
export function convertToExcelRows(invoices: InvoiceData[]): ExcelRowData[] {
  // 过滤出发票类型的文件（不统计到表格中）
  return invoices.filter(inv => inv.isValid && !inv.invoiceType?.startsWith('invoice_')).map(invoice => {
    const row: ExcelRowData = {
      date: invoice.departureDate || invoice.invoiceDate || '',
      location: invoice.departure && invoice.destination 
        ? `${invoice.departure}-${invoice.destination}` 
        : invoice.destination || invoice.departure || '',
      planeWithInfo: 0,
      railway: 0,
      roadWater: 0,
      planeWithoutInfo: 0,
      trainBus: 0,
      taxi: 0,
      accommodation: 0,
      other: 0,
      mealAllowance: 50, // 餐补默认50
      subtotal: 0,
      remarks: '', // 去掉备注
    };

    const amount = invoice.amountWithTax || invoice.totalAmount || 0;
    
    switch (invoice.vehicleType) {
      case '飞机':
        if (invoice.buyerName) {
          row.planeWithInfo = amount;
        } else {
          row.planeWithoutInfo = amount;
        }
        break;
        
      case '火车':
        row.railway = amount;
        break;
        
      case '轮船':
      case '大巴':
        row.roadWater = amount;
        break;
        
      case '的士（含个人信息）':
        row.taxi = amount;
        break;
        
      case '的士':
        row.taxi = amount;
        break;
        
      case '地铁':
      case '公交':
        row.trainBus = amount;
        break;
        
      case '住宿':
        row.accommodation = amount;
        break;
        
      default:
        row.other = amount;
    }
    
    row.subtotal = row.planeWithInfo + row.railway + row.roadWater + 
                   row.planeWithoutInfo + row.trainBus + row.taxi + 
                   row.accommodation + row.other + row.mealAllowance;
    
    return row;
  });
}

// 生成Excel文件 - 带边框样式
export function generateExcel(rows: ExcelRowData[]): Blob {
  const XLSX = window.XLSX;
  
  const wb = XLSX.utils.book_new();
  
  // 准备数据
  const data: (string | number)[][] = [
    ['差旅费报销明细表', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['日期', '地点', '含个人信息交通费', '', '', '旅客运输服务电子发票（如滴滴打车发票）', '不含个人信息交通费', '', '', '住宿费', '其它', '餐补', '小计', '备注'],
    ['', '', '飞机', '铁路费', '公路水路费（即轮船、大巴）', '', '飞机', '火车、轮船、大巴', '的士.公交', '', '', '', '', ''],
  ];
  
  rows.forEach(row => {
    data.push([
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
  });
  
  // 添加合计行
  const totalPlaneWithInfo = rows.reduce((sum, r) => sum + r.planeWithInfo, 0);
  const totalRailway = rows.reduce((sum, r) => sum + r.railway, 0);
  const totalRoadWater = rows.reduce((sum, r) => sum + r.roadWater, 0);
  const totalPlaneWithoutInfo = rows.reduce((sum, r) => sum + r.planeWithoutInfo, 0);
  const totalTrainBus = rows.reduce((sum, r) => sum + r.trainBus, 0);
  const totalTaxi = rows.reduce((sum, r) => sum + r.taxi, 0);
  const totalAccommodation = rows.reduce((sum, r) => sum + r.accommodation, 0);
  const totalOther = rows.reduce((sum, r) => sum + r.other, 0);
  const totalMeal = rows.reduce((sum, r) => sum + r.mealAllowance, 0);
  const totalSubtotal = rows.reduce((sum, r) => sum + r.subtotal, 0);
  
  data.push([
    '', '合计', 
    totalPlaneWithInfo || '', 
    totalRailway || '', 
    totalRoadWater || '', 
    '', 
    totalPlaneWithoutInfo || '', 
    totalTrainBus || '', 
    totalTaxi || '', 
    totalAccommodation || '', 
    totalOther || '', 
    totalMeal || '', 
    totalSubtotal || '', 
    ''
  ]);
  
  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // 设置列宽
  ws['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 25 },
  ];
  
  // 合并单元格
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
    { s: { r: 1, c: 2 }, e: { r: 1, c: 4 } },
    { s: { r: 1, c: 5 }, e: { r: 2, c: 5 } },
    { s: { r: 1, c: 6 }, e: { r: 1, c: 8 } },
    { s: { r: 1, c: 9 }, e: { r: 2, c: 9 } },
    { s: { r: 1, c: 10 }, e: { r: 2, c: 10 } },
    { s: { r: 1, c: 11 }, e: { r: 2, c: 11 } },
    { s: { r: 1, c: 12 }, e: { r: 2, c: 12 } },
    { s: { r: 1, c: 13 }, e: { r: 2, c: 13 } },
  ];
  
  // 添加边框样式
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:N1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { v: '' };
      }
      
      // 添加边框样式
      ws[cellAddress].s = {
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center',
          wrapText: true,
        },
      };
      
      // 标题行样式
      if (R === 0) {
        ws[cellAddress].s.font = { bold: true, sz: 14 };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'E7E6E6' } };
      }
      // 表头样式
      else if (R === 1 || R === 2) {
        ws[cellAddress].s.font = { bold: true };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'F2F2F2' } };
      }
      // 合计行样式
      else if (R === data.length - 1) {
        ws[cellAddress].s.font = { bold: true };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'FFF2CC' } };
      }
    }
  }
  
  XLSX.utils.book_append_sheet(wb, ws, '差旅费报销明细');
  
  const excelBuffer = XLSX.write(wb, { 
    bookType: 'xlsx', 
    type: 'array',
    bookSST: false,
  });

  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// 将发票数据转换为费用明细表行数据
export function convertToExpenseDetailRows(invoices: InvoiceData[]): ExpenseDetailRow[] {
  return invoices.filter(inv => inv.isValid).map(invoice => ({
    date: invoice.invoiceDate || invoice.departureDate || '',
    projectName: '',  // 留空
    category: '',     // 留空
    amount: invoice.amountWithTax || invoice.totalAmount || 0,
    other: `${invoice.invoiceNumber || ''} ${invoice.invoiceType || ''}`.trim(),
    subtotal: invoice.amountWithTax || invoice.totalAmount || 0
  }));
}

// 生成费用明细表Excel
export function generateExpenseDetailExcel(rows: ExpenseDetailRow[]): Blob {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  // 准备数据
  const data: (string | number)[][] = [
    ['业务费用明细表', '', '', '', '', ''],
    ['报销人：', '', '编号：', '', '', ''],
    ['日期', '项目名称', '类别', '金额', '其他', '小计'],
  ];

  // 数据行
  rows.forEach(row => {
    data.push([
      row.date,
      row.projectName,
      row.category,
      row.amount || '',
      row.other,
      row.subtotal || ''
    ]);
  });

  // 合计行
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalSubtotal = rows.reduce((sum, r) => sum + r.subtotal, 0);
  data.push(['', '合计', '', totalAmount, '', totalSubtotal]);

  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(data);

  // 设置列宽
  ws['!cols'] = [
    { wch: 12 },  // 日期
    { wch: 20 },  // 项目名称
    { wch: 15 },  // 类别
    { wch: 12 },  // 金额
    { wch: 35 },  // 其他
    { wch: 12 }   // 小计
  ];

  // 合并单元格
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },  // 标题行
  ];

  // 添加边框样式
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:F1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { v: '' };
      }

      ws[cellAddress].s = {
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center',
          wrapText: true,
        },
      };

      // 标题行样式
      if (R === 0) {
        ws[cellAddress].s.font = { bold: true, sz: 14 };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'E7E6E6' } };
      }
      // 表头样式
      else if (R === 2) {
        ws[cellAddress].s.font = { bold: true };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'F2F2F2' } };
      }
      // 合计行样式
      else if (R === data.length - 1) {
        ws[cellAddress].s.font = { bold: true };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'FFF2CC' } };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, '业务费用明细表');

  const excelBuffer = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    bookSST: false,
  });

  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
