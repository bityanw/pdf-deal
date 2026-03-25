import type { InvoiceData, ExcelRowData } from '@/types/pdf';
import type { ExpenseDetailRow } from '@/types/invoice';

// 行程单类型（包含发票类型）
type ItineraryType = 'taxi' | 'train' | 'flight' | 'hotel' | 'other' | 'invoice_transport' | 'invoice_hotel' | 'invoice_food' | 'invoice_other';

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

// 增强的文本清洗函数
function cleanPDFText(text: string): string {
  let cleaned = text;

  // 1. 统一换行符
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. 移除零宽字符和不可见字符
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 3. 统一全角/半角数字和符号
  cleaned = cleaned
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ':')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/￥/g, '¥');

  // 4. 移除多余空白但保留必要的分隔
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();

  return cleaned;
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

    // 清洗文本（统一格式、移除不可见字符）
    fullText = cleanPDFText(fullText);

    // 检测文本质量
    const textQuality = {
      length: fullText.length,
      hasChineseChars: /[\u4e00-\u9fa5]/.test(fullText),
      hasNumbers: /\d/.test(fullText),
      isEmpty: fullText.trim().length === 0
    };

    console.log(`[PDF文本质量] 文件: ${file.name}`, textQuality);

    // 如果文本为空或质量太差，提前返回错误
    if (textQuality.isEmpty) {
      return {
        success: false,
        data: invoiceData,
        error: 'PDF文本提取失败：文件可能是扫描件或图片格式，请使用包含文本层的电子发票',
      };
    }

    if (fullText.length < 50) {
      console.warn(`[PDF文本质量] 文本过短(${fullText.length}字符)，可能识别不准确`);
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

      // 归一化文本（处理PDF.js逐字符换行分隔的情况）
      const normalizedInvoiceText = fullText.replace(/\n+/g, '').replace(/\s+/g, ' ');

      // 进一步压缩：移除数字之间/数字与年月日之间的空格
      // 处理 PDF.js 逐字符带空格的提取结果，如 "2 0 2 6 年 0 1 月 1 6 日" → "2026年01月16日"
      let compactText = normalizedInvoiceText;
      for (let i = 0; i < 8; i++) compactText = compactText.replace(/(\d) (\d)/g, '$1$2');
      compactText = compactText
        .replace(/(\d) 年/g, '$1年').replace(/年 (\d)/g, '年$1')
        .replace(/(\d) 月/g, '$1月').replace(/月 (\d)/g, '月$1')
        .replace(/(\d) 日/g, '$1日')
        .replace(/[¥￥] (\d)/g, '¥$1')
        .replace(/(\d) \./g, '$1.').replace(/\. (\d)/g, '.$1');

      // 调试日志：输出压缩后的文本前500字符
      console.log(`[发票解析] 文件: ${file.name}`);
      console.log(`[发票解析] compactText前500字符: ${compactText.substring(0, 500)}`);
      console.log(`[发票解析] compactText后500字符: ${compactText.substring(Math.max(0, compactText.length - 500))}`);


      // 提取发票号码
      let invoiceNumberMatch = compactText.match(/发票号码[：:]\s*(\d{8,20})/);
      if (invoiceNumberMatch) {
        invoiceData.invoiceNumber = invoiceNumberMatch[1];
      }

      // 备选：从文件名提取发票号码（如"26112000000851142181-公司名.pdf"）
      if (!invoiceData.invoiceNumber && file.name) {
        const fileInvoiceMatch = file.name.match(/(\d{20,})/);
        if (fileInvoiceMatch) {
          invoiceData.invoiceNumber = fileInvoiceMatch[1];
        }
      }

      // 提取发票代码
      const invoiceCodeMatch = compactText.match(/发票代码[：:]\s*(\d{10,12})/);
      if (invoiceCodeMatch) {
        invoiceData.invoiceCode = invoiceCodeMatch[1];
      }

      // 提取开票日期 - 辅助函数
      const tryExtractYMD = (m: RegExpMatchArray | null): string | null => {
        if (!m) return null;
        const y = parseInt(m[1]), mo = parseInt(m[2]), d = parseInt(m[3]);
        if (y >= 2000 && y <= 2050 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
          return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        return null;
      };

      // 方式1：开票日期 标签后直接跟年月日
      let dateMatch = compactText.match(/开票日期[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      invoiceData.invoiceDate = tryExtractYMD(dateMatch) || undefined;

      // 方式2：扫描所有"年月日"格式，取最后一个有效匹配
      // （全电发票的开票日期通常在文本最末尾，紧跟在发票号码后面）
      if (!invoiceData.invoiceDate) {
        const allDateMatches = Array.from(compactText.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g));
        for (let i = allDateMatches.length - 1; i >= 0; i--) {
          const extracted = tryExtractYMD(allDateMatches[i]);
          if (extracted) { invoiceData.invoiceDate = extracted; break; }
        }
      }

      // 方式3：原始文本（逐行）中搜索 年月日
      if (!invoiceData.invoiceDate) {
        const rawMatch = fullText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
        invoiceData.invoiceDate = tryExtractYMD(rawMatch) || undefined;
      }

      // 方式4：YYYY-MM-DD 格式
      if (!invoiceData.invoiceDate) {
        const dateMatch2 = compactText.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        invoiceData.invoiceDate = tryExtractYMD(dateMatch2) || undefined;
      }

      // 备选：从文件名提取日期（排除时间戳，如 dzfp_..._20260319194925.pdf 中末尾的时间戳）
      if (!invoiceData.invoiceDate && file.name) {
        // 只匹配 YYYY-MM-DD 或 YYYY_MM_DD 格式（有分隔符的），避免匹配时间戳
        const fileNameDateMatch = file.name.match(/(\d{4})[-_](\d{2})[-_](\d{2})(?!\d)/);
        if (fileNameDateMatch) {
          const y = parseInt(fileNameDateMatch[1]);
          const m = parseInt(fileNameDateMatch[2]);
          const d = parseInt(fileNameDateMatch[3]);
          if (y >= 2000 && y <= 2050 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            invoiceData.invoiceDate = `${fileNameDateMatch[1]}-${fileNameDateMatch[2]}-${fileNameDateMatch[3]}`;
          }
        }
        if (!invoiceData.invoiceDate) {
          const fileMonthDayMatch = file.name.match(/(\d{1,2})月(\d{1,2})日/);
          if (fileMonthDayMatch) {
            const year = new Date().getFullYear().toString();
            invoiceData.invoiceDate = `${year}-${fileMonthDayMatch[1].padStart(2, '0')}-${fileMonthDayMatch[2].padStart(2, '0')}`;
          }
        }
      }

      // 备选：从发票号码提取日期（中国全电发票格式：前4位地区码+8位YYYYMMDD）
      if (!invoiceData.invoiceDate && invoiceData.invoiceNumber && invoiceData.invoiceNumber.length >= 12) {
        const datePart = invoiceData.invoiceNumber.substring(4, 12);
        if (/^\d{8}$/.test(datePart)) {
          const y = parseInt(datePart.substring(0, 4));
          const m = parseInt(datePart.substring(4, 6));
          const d = parseInt(datePart.substring(6, 8));
          if (y >= 2000 && y <= 2050 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            invoiceData.invoiceDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          }
        }
      }

      // 最后兜底：使用当前日期（并记录警告）
      if (!invoiceData.invoiceDate) {
        console.warn(`[发票解析] 文件 ${file.name} 无法提取日期，使用当前日期作为兜底`);
        const today = new Date();
        invoiceData.invoiceDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        invoiceData.parseError = (invoiceData.parseError || '') + '日期识别失败，使用当前日期；';
      }

      // 提取价税合计
      // 方式1：¥/￥符号后的数字（限制合理金额范围：1-7位整数+可选2位小数）
      const amountMatches = compactText.matchAll(/[¥￥]\s*(\d{1,7}(?:\.\d{1,2})?)/g);
      const amounts = Array.from(amountMatches)
        .map(m => parseFloat(m[1]))
        .filter(val => val >= 0.01 && val <= 1000000); // 过滤合理金额范围
      if (amounts.length > 0) {
        invoiceData.amountWithTax = Math.max(...amounts);
      }

      // 方式2："价税合计"后的数字
      if (!invoiceData.amountWithTax) {
        const totalMatch = compactText.match(/价税合计[：:\s]*[¥￥]?\s*(\d{1,7}(?:\.\d{1,2})?)/);
        if (totalMatch) {
          const val = parseFloat(totalMatch[1]);
          if (val >= 0.01 && val <= 1000000) {
            invoiceData.amountWithTax = val;
          }
        }
      }

      // 方式3："（小写）"后的金额
      if (!invoiceData.amountWithTax) {
        const xiaoXieMatch = compactText.match(/（小写）[^0-9]*(\d{1,7}(?:\.\d{1,2})?)/);
        if (xiaoXieMatch) {
          const val = parseFloat(xiaoXieMatch[1]);
          if (val >= 0.01 && val <= 1000000) {
            invoiceData.amountWithTax = val;
          }
        }
      }

      // 方式4："圆整"后面的数字（中文大写金额后跟小写金额）
      if (!invoiceData.amountWithTax) {
        const yuanZhengMatch = compactText.match(/圆整[^0-9]*(\d{1,7}(?:\.\d{1,2})?)/);
        if (yuanZhengMatch) {
          const val = parseFloat(yuanZhengMatch[1]);
          if (val >= 0.01 && val <= 1000000) {
            invoiceData.amountWithTax = val;
          }
        }
      }

      // 金额识别失败警告
      if (!invoiceData.amountWithTax) {
        console.warn(`[发票解析] 文件 ${file.name} 无法提取金额`);
        invoiceData.parseError = (invoiceData.parseError || '') + '金额识别失败；';
      }

      // 提取地点信息（针对发票）
      // 辅助函数：统计候选城市出现频率
      const extractMostFrequentCity = (text: string): string | null => {
        // 常见城市列表（包含直辖市、省会、主要城市）
        const cities = [
          '北京', '上海', '天津', '重庆', '广州', '深圳', '成都', '杭州', '武汉', '西安',
          '郑州', '南京', '济南', '沈阳', '长春', '哈尔滨', '石家庄', '太原', '呼和浩特',
          '南昌', '长沙', '福州', '南宁', '昆明', '贵阳', '兰州', '西宁', '银川', '乌鲁木齐',
          '拉萨', '海口', '合肥', '苏州', '无锡', '宁波', '青岛', '大连', '厦门', '珠海',
          '东莞', '佛山', '中山', '惠州', '江门', '湛江', '汕头', '温州', '嘉兴', '绍兴',
          '台州', '金华', '常州', '徐州', '南通', '扬州', '盐城', '淮安', '连云港', '泰州',
          '镇江', '宿迁', '芜湖', '蚌埠', '淮南', '马鞍山', '安庆', '滁州', '阜阳', '宿州',
          '六安', '亳州', '池州', '宣城', '赣州', '吉安', '宜春', '抚州', '上饶', '九江',
          '景德镇', '萍乡', '新余', '鹰潭', '洛阳', '开封', '平顶山', '安阳', '鹤壁', '新乡',
          '焦作', '濮阳', '许昌', '漯河', '三门峡', '南阳', '商丘', '信阳', '周口', '驻马店',
        ];

        const cityCount: Record<string, number> = {};

        for (const city of cities) {
          const regex = new RegExp(city, 'g');
          const matches = text.match(regex);
          if (matches && matches.length > 0) {
            cityCount[city] = matches.length;
          }
        }

        // 找出出现次数最多的城市
        let mostFrequentCity: string | null = null;
        let maxCount = 0;
        for (const [city, count] of Object.entries(cityCount)) {
          if (count > maxCount) {
            maxCount = count;
            mostFrequentCity = city;
          }
        }

        return mostFrequentCity ? (mostFrequentCity.endsWith('市') ? mostFrequentCity : mostFrequentCity + '市') : null;
      };

      // 方式1：从酒店名称中提取城市（如"全季北京朝阳路酒店"）
      const hotelPattern = /([\u4e00-\u9fa5]{0,20}(?:酒店|宾馆|大厦|饭店|旅馆|客栈|民宿|公寓))/g;
      const hotelMatches = Array.from(compactText.matchAll(hotelPattern));
      let hotelName = '';
      for (const match of hotelMatches) {
        const name = match[1];
        // 检查是否包含酒店相关词
        if (name.length >= 4 && (name.includes('酒店') || name.includes('宾馆') || name.includes('大厦') ||
            name.includes('饭店') || name.includes('旅馆'))) {
          hotelName = name;
          break;
        }
      }

      if (hotelName) {
        // 常见城市列表
        const cities = ['北京', '上海', '天津', '重庆', '广州', '深圳', '成都', '杭州', '武汉', '西安', '南京', '济南', '沈阳', '郑州', '长沙', '青岛', '大连', '厦门', '珠海', '苏州', '无锡', '宁波', '佛山', '东莞', '石家庄', '太原', '合肥', '南昌', '昆明', '贵阳', '兰州', '海口', '南宁', '呼和浩特', '乌鲁木齐', '拉萨', '银川', '西宁', '哈尔滨', '长春'];
        for (const city of cities) {
          if (hotelName.includes(city)) {
            invoiceData.destination = city + '市';
            if (!invoiceData.remarks) {
              invoiceData.remarks = hotelName;
            }
            break;
          }
        }
      }

      // 方式2：如果酒店名称没找到城市，则从整个文本中统计出现频率最高的城市
      if (!invoiceData.destination) {
        const frequentCity = extractMostFrequentCity(compactText);
        if (frequentCity) {
          invoiceData.destination = frequentCity;
        }
      }

      // 方式3：从销售方名称提取地点（最后兜底）
      if (!invoiceData.destination && invoiceData.sellerName) {
        const cityMatch = invoiceData.sellerName.match(/^([\u4e00-\u9fa5]{2,10})[市县区]?/);
        if (cityMatch) {
          const cityName = cityMatch[1];
          // 过滤掉常见的非地名词
          const excludeWords = ['中国', '北方', '南方', '东方', '西方', '全国', '国际', '华北', '华南', '华东', '华西', '华中', '住宿', '运输', '经纪', '代理', '服务'];
          if (!excludeWords.includes(cityName) && !excludeWords.some(w => cityName.includes(w)) && cityName.length >= 2) {
            invoiceData.destination = cityName.endsWith('市') ? cityName : cityName + '市';
          }
        }
      }

      // 方式4：从文件名提取地点（如文件名包含城市名）
      if (!invoiceData.destination && file.name) {
        const fileNameCityMatch = file.name.match(/([\u4e00-\u9fa5]{2,10}市)/);
        if (fileNameCityMatch) {
          const cityFromFile = fileNameCityMatch[1];
          // 过滤服务项目
          if (!cityFromFile.includes('服务') && !cityFromFile.includes('经纪') && !cityFromFile.includes('代理')) {
            invoiceData.destination = cityFromFile;
          }
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

  // 优先通过文件名识别：dzfp_ / fp_ 前缀是全电发票标准命名格式
  // 不在此处 return，继续文本分析以检测子类型（餐饮/交通/住宿）
  const isElectronicInvoiceByName = fileName ? /^(dzfp|fp|sfp|qdfp)_/i.test(fileName) : false;
  if (isElectronicInvoiceByName) {
    logs.push(`[PDF类型检测] 文件名前缀匹配全电发票格式（将兜底判定为发票，仍继续文本分析子类型）`);
  }

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
  
  // 如果满足多个发票特征，或文件名为全电发票格式，判定为发票
  const invoiceScore = (isElectronicInvoice ? 2 : 0) + (hasInvoiceNumber ? 2 : 0) + (hasTaxInfo ? 1 : 0) + foundInvoiceKeywords.length;
  logs.push(`[PDF类型检测] 发票特征得分: ${invoiceScore}/10`);

  if (invoiceScore >= 3 || foundInvoiceKeywords.length >= 2 || isElectronicInvoiceByName) {
    logs.push(`[PDF类型检测] 判定为: 发票`);

    // 检测发票类型 - 扩展关键词库
    const isTransportInvoice = checkText.includes('运输服务') ||
                               checkText.includes('客运服务') ||
                               checkText.includes('代订车服务') ||
                               checkText.includes('网约车') ||
                               checkText.includes('出租车服务');

    const isHotelInvoice = checkText.includes('住宿服务') ||
                           checkText.includes('代订住宿') ||
                           checkText.includes('经纪代理服务') ||
                           checkText.includes('酒店服务') ||
                           checkText.includes('宾馆');

    const isFoodInvoice = checkText.includes('餐饮服务') ||
                          checkText.includes('餐饮费') ||
                          checkText.includes('*餐饮*') ||
                          checkText.includes('餐费') ||
                          checkText.includes('餐饮') ||
                          checkText.includes('食品') ||
                          (checkText.includes('餐') && (checkText.includes('服务') || checkText.includes('饮')));

    logs.push(`[PDF类型检测] 运输服务发票: ${isTransportInvoice}`);
    logs.push(`[PDF类型检测] 住宿服务发票: ${isHotelInvoice}`);
    logs.push(`[PDF类型检测] 餐饮服务发票: ${isFoodInvoice}`);

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
    if (isFoodInvoice) {
      return {
        type: 'invoice',
        subtype: 'invoice_food',
        reason: '检测到「电子发票-餐饮服务」',
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
    
    // 提取城市信息（从表格中的"城市"列或"地点"列）
    // 辅助函数：统计候选城市出现频率
    const extractMostFrequentCity = (text: string): string | null => {
      const cities = [
        '北京', '上海', '天津', '重庆', '广州', '深圳', '成都', '杭州', '武汉', '西安',
        '郑州', '南京', '济南', '沈阳', '长春', '哈尔滨', '石家庄', '太原', '呼和浩特',
        '南昌', '长沙', '福州', '南宁', '昆明', '贵阳', '兰州', '西宁', '银川', '乌鲁木齐',
        '拉萨', '海口', '合肥', '苏州', '无锡', '宁波', '青岛', '大连', '厦门', '珠海',
        '东莞', '佛山', '中山', '惠州', '江门', '湛江', '汕头', '温州', '嘉兴', '绍兴',
      ];

      const cityCount: Record<string, number> = {};
      for (const city of cities) {
        const regex = new RegExp(city, 'g');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
          cityCount[city] = matches.length;
        }
      }

      let mostFrequentCity: string | null = null;
      let maxCount = 0;
      for (const [city, count] of Object.entries(cityCount)) {
        if (count > maxCount) {
          maxCount = count;
          mostFrequentCity = city;
        }
      }

      return mostFrequentCity ? mostFrequentCity + '市' : null;
    };

    // 使用频率统计提取城市
    const frequentCity = extractMostFrequentCity(text);
    if (frequentCity) {
      data.destination = frequentCity;
    }

    // 从表格行中提取城市（作为辅助验证）
    const rowCityMatches = text.matchAll(/\d{4}-\d{2}-\d{2}[^\n]*?([\u4e00-\u9fa5]{2,10}市)/g);
    const rowCities: string[] = [];
    for (const match of rowCityMatches) {
      const city = match[1];
      // 过滤掉服务项目
      if (!city.includes('服务') && !city.includes('经纪') && !city.includes('代理') &&
          !city.includes('运输') && !city.includes('住宿') && !rowCities.includes(city)) {
        rowCities.push(city);
      }
    }
    // 如果表格行中只有一个有效城市且还没设置目的地，使用它
    if (!data.destination && rowCities.length === 1) {
      data.destination = rowCities[0];
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
            // 如果还没有设置目的地，使用第一个找到的城市
            if (!data.destination) {
              data.destination = city;
            }
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

      // 提取起止点信息
      const locations = trips.map(t => {
        if (t.from && t.to) return `${t.from}-${t.to}`;
        return '';
      }).filter(Boolean);

      if (locations.length > 0) {
        data.remarks = locations.join('; ');
        // 设置第一个行程的起止点为 departure 和 destination
        const firstTrip = trips.find(t => t.from && t.to);
        if (firstTrip) {
          data.departure = firstTrip.from;
          data.destination = firstTrip.to;
        }
      }

      // 如果没有具体起止点，但有城市信息，使用城市作为地点
      if (!data.departure && !data.destination && rowCities.length > 0) {
        data.destination = rowCities[0];
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

    // 归一化文本（处理PDF.js逐字符换行分隔的情况）
    const normalizedText = text.replace(/\n+/g, '').replace(/\s+/g, ' ');
    debugLogs.push(`[DEBUG] 归一化文本前200字符: ${normalizedText.substring(0, 200)}`);

    // 提取发票号码
    const invoiceMatch = normalizedText.match(/发票号码[：:]\s*(\d+)/);
    if (invoiceMatch) {
      data.invoiceNumber = invoiceMatch[1];
      debugLogs.push(`[DEBUG] 提取发票号码: ${data.invoiceNumber}`);
    }

    // 提取开票日期（使用归一化文本）
    const dateMatch = normalizedText.match(/开票日期[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (dateMatch) {
      data.invoiceDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      debugLogs.push(`[DEBUG] 提取开票日期: ${data.invoiceDate}`);
    }

    // 提取乘车日期 - 先尝试"XX:XX开"模式
    const travelDateMatch = normalizedText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*\d{2}:\d{2}开/);
    if (travelDateMatch) {
      data.departureDate = `${travelDateMatch[1]}-${travelDateMatch[2].padStart(2, '0')}-${travelDateMatch[3].padStart(2, '0')}`;
      debugLogs.push(`[DEBUG] 提取乘车日期: ${data.departureDate}`);
    }

    // 备选：匹配任意"年月日"格式（归一化文本中\s*能处理各种空白）
    if (!data.departureDate) {
      const spacedDateMatch = normalizedText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (spacedDateMatch) {
        data.departureDate = `${spacedDateMatch[1]}-${spacedDateMatch[2].padStart(2, '0')}-${spacedDateMatch[3].padStart(2, '0')}`;
        debugLogs.push(`[DEBUG] 提取乘车日期（年月日格式）: ${data.departureDate}`);
      }
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

    // 备选：铁路电子客票特殊格式（CMap字体导致中文丢失，日期为纯数字空格分隔）
    // 乘车日期格式："2025 12 23 09:56" - 年月日后面紧跟时间
    if (!data.departureDate) {
      const numericTravelDate = normalizedText.match(/(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+\d{2}:\d{2}/);
      if (numericTravelDate) {
        const y = parseInt(numericTravelDate[1]), m = parseInt(numericTravelDate[2]), d = parseInt(numericTravelDate[3]);
        if (y >= 2000 && y <= 2050 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          data.departureDate = `${numericTravelDate[1]}-${numericTravelDate[2].padStart(2, '0')}-${numericTravelDate[3].padStart(2, '0')}`;
          debugLogs.push(`[DEBUG] 提取乘车日期（数字格式）: ${data.departureDate}`);
        }
      }
    }
    // 开票日期格式：":2026 03 19" - 冒号前缀的年月日
    if (!data.invoiceDate) {
      const numericInvoiceDate = normalizedText.match(/:(\d{4})\s+(\d{1,2})\s+(\d{1,2})(?!\d)/);
      if (numericInvoiceDate) {
        const y = parseInt(numericInvoiceDate[1]), m = parseInt(numericInvoiceDate[2]), d = parseInt(numericInvoiceDate[3]);
        if (y >= 2000 && y <= 2050 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          data.invoiceDate = `${numericInvoiceDate[1]}-${numericInvoiceDate[2].padStart(2, '0')}-${numericInvoiceDate[3].padStart(2, '0')}`;
          debugLogs.push(`[DEBUG] 提取开票日期（数字格式）: ${data.invoiceDate}`);
        }
      }
    }
    
    // 提取车次（归一化文本中查找）
    const trainMatch = normalizedText.match(/([GDCZTKY]\d{2,4})/);
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
    debugLogs.push(`[DEBUG] 找到中文站点: ${stationMatches?.join(', ') || '无'}`);

    // 提取英文站名（如 Beijingnan, Hangzhoudong）
    const englishStationMatches = text.match(/[A-Z][a-z]+(?:nan|dong|xi|bei|zhong|[a-z]+)/g);
    debugLogs.push(`[DEBUG] 找到英文站点: ${englishStationMatches?.join(', ') || '无'}`);

    // 英文站名到中文的映射
    const stationNameMap: { [key: string]: string } = {
      // 北京
      'Beijingnan': '北京南站',
      'Beijing': '北京站',
      'Beijingxi': '北京西站',
      'Beijingbei': '北京北站',
      // 上海
      'Shanghainan': '上海南站',
      'Shanghai': '上海站',
      'Shanghaihongqiao': '上海虹桥站',
      'Shanghaixi': '上海西站',
      // 广州/深圳
      'Guangzhoudong': '广州东站',
      'Guangzhou': '广州站',
      'Guangzhounan': '广州南站',
      'Guangzhoubei': '广州北站',
      'Shenzhenbei': '深圳北站',
      'Shenzhen': '深圳站',
      'Shenzhenxi': '深圳西站',
      // 杭州
      'Hangzhoudong': '杭州东站',
      'Hangzhou': '杭州站',
      'Hangzhounan': '杭州南站',
      // 南京/苏州
      'Nanjingnan': '南京南站',
      'Nanjing': '南京站',
      'Suzhoubei': '苏州北站',
      'Suzhou': '苏州站',
      'Suzhoudong': '苏州东站',
      // 天津
      'Tianjinnan': '天津南站',
      'Tianjin': '天津站',
      'Tianjinxi': '天津西站',
      'Tianjinbei': '天津北站',
      // 其他主要城市
      'Wuxi': '无锡站',
      'Wuxidong': '无锡东站',
      'Changzhou': '常州站',
      'Changzhoudong': '常州东站',
      'Zhengzhoudong': '郑州东站',
      'Zhengzhou': '郑州站',
      'Xian': '西安站',
      'Xianbei': '西安北站',
      'Chengdudong': '成都东站',
      'Chengdu': '成都站',
      'Chengdunan': '成都南站',
      'Chongqingbei': '重庆北站',
      'Chongqing': '重庆站',
      'Chongqingxi': '重庆西站',
      'Wuhan': '武汉站',
      'Changsha': '长沙站',
      'Changshanan': '长沙南站',
      'Ningbo': '宁波站',
      'Ningbodong': '宁波东站',
      'Wenzhou': '温州站',
      'Wenzhounan': '温州南站',
      'Hefei': '合肥站',
      'Hefeinan': '合肥南站',
      'Nanchang': '南昌站',
      'Nanchangxi': '南昌西站',
      'Fuzhou': '福州站',
      'Fuzhounan': '福州南站',
      'Xiamen': '厦门站',
      'Xiamenbei': '厦门北站',
      'Qingdao': '青岛站',
      'Qingdaobei': '青岛北站',
      'Jinan': '济南站',
      'Jinandong': '济南东站',
      'Jinanxi': '济南西站',
      'Taiyuan': '太原站',
      'Taiyuannan': '太原南站',
      'Shijiazhuang': '石家庄站',
      'Shijiazhuangdong': '石家庄东站',
      'Haerbin': '哈尔滨站',
      'Haerbinxi': '哈尔滨西站',
      'Changchun': '长春站',
      'Changchunxi': '长春西站',
      'Shenyang': '沈阳站',
      'Shenyangbei': '沈阳北站',
      'Dalian': '大连站',
      'Dalianbei': '大连北站',
      'Kunming': '昆明站',
      'Kunmingnan': '昆明南站',
      'Guiyang': '贵阳站',
      'Guiyangbei': '贵阳北站',
      'Lanzhou': '兰州站',
      'Lanzhouxi': '兰州西站',
      'Xining': '西宁站',
      'Yinchuan': '银川站',
      'Urumqi': '乌鲁木齐站',
    };

    // 如果找到英文站名，转换为中文
    if (englishStationMatches && englishStationMatches.length >= 2) {
      const firstStation = englishStationMatches[0];
      const secondStation = englishStationMatches[englishStationMatches.length - 1];

      // 只有在映射表中找到对应的中文站名时才使用
      if (stationNameMap[firstStation]) {
        data.departure = stationNameMap[firstStation];
      }
      if (stationNameMap[secondStation]) {
        data.destination = stationNameMap[secondStation];
      }

      debugLogs.push(`[DEBUG] 从英文站名提取: ${data.departure || '未找到映射'} -> ${data.destination || '未找到映射'}`);
    }
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

    // 如果没有从英文站名提取到，尝试从中文站名提取
    if (!data.departure && !data.destination && stationMatches && stationMatches.length > 0) {
      // 去重并过滤
      const uniqueStations = [...new Set(stationMatches)];
      const validStations = uniqueStations.filter(s =>
        s !== '国家税务总局' &&
        s !== '统一社会信用代码' &&
        s.length <= 6 &&
        s !== '站'
      );
      debugLogs.push(`[DEBUG] 有效中文站点: ${validStations.join(', ')}`);

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

    // 地点提取：优先从文本，兜底从文件名
    const locationMatch = text.match(/([\u4e00-\u9fa5]+)[-至→]([\u4e00-\u9fa5]+)/);
    if (locationMatch) {
      data.departure = locationMatch[1];
      data.destination = locationMatch[2];
    }

    // 兜底：从文件名提取地点
    if ((!data.departure || !data.destination) && data.fileName) {
      const fileLocationMatch = data.fileName.match(/([\u4e00-\u9fa5]+)[-至]([\u4e00-\u9fa5]+)/);
      if (fileLocationMatch) {
        if (!data.departure) data.departure = fileLocationMatch[1];
        if (!data.destination) data.destination = fileLocationMatch[2];
      }
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
  // 包含所有有效数据（发票和行程单）
  const validInvoices = invoices.filter(inv => inv.isValid);

  // 按日期排序（升序：从早到晚）
  validInvoices.sort((a, b) => {
    const dateA = a.departureDate || a.invoiceDate || '';
    const dateB = b.departureDate || b.invoiceDate || '';

    // 如果两个都有日期，按日期排序
    if (dateA && dateB) {
      return dateA.localeCompare(dateB);
    }

    // 有日期的排在前面
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;

    // 都没有日期，保持原顺序
    return 0;
  });

  return validInvoices.map(invoice => {
    // 地点字段生成逻辑
    let location = '';
    if (invoice.departure && invoice.destination) {
      location = `${invoice.departure}-${invoice.destination}`;
    } else if (invoice.destination || invoice.departure) {
      location = invoice.destination || invoice.departure || '';
    } else if (invoice.invoiceType?.startsWith('invoice_')) {
      // 发票类型：尝试从销售方名称提取城市
      if (invoice.sellerName) {
        const cityMatch = invoice.sellerName.match(/([\u4e00-\u9fa5]{2,10}[市区县])/);
        if (cityMatch) {
          location = cityMatch[1];
        }
      }
    }

    const row: ExcelRowData = {
      date: invoice.departureDate || invoice.invoiceDate || '',
      location,
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

    // 获取发票类型的中文名称
    const getInvoiceTypeName = (type?: string): string => {
      switch (type) {
        case 'invoice_transport': return '交通';
        case 'invoice_hotel': return '住宿';
        case 'invoice_food': return '餐饮';
        case 'invoice_other': return '其他';
        default: return '';
      }
    };

    // 处理发票类型
    if (invoice.invoiceType?.startsWith('invoice_')) {
      const typeName = getInvoiceTypeName(invoice.invoiceType);

      switch (invoice.invoiceType) {
        case 'invoice_transport':
          // 运输服务发票 -> 旅客运输服务电子发票列（暂时放到taxi列）
          row.taxi = amount;
          row.remarks = `${typeName} | ${invoice.fileName}`;
          break;
        case 'invoice_hotel':
          // 住宿服务发票 -> 住宿费
          row.accommodation = amount;
          row.remarks = `${typeName} | ${invoice.fileName}`;
          break;
        case 'invoice_food':
          // 餐饮服务发票 -> 其它
          row.other = amount;
          row.remarks = `${typeName} | ${invoice.fileName}`;
          break;
        case 'invoice_other':
        default:
          // 其他发票 -> 其它
          row.other = amount;
          row.remarks = `${typeName || '其他'} | ${invoice.fileName}`;
          break;
      }
    } else {
      // 处理行程单类型
      switch (invoice.vehicleType) {
        case '飞机':
          if (invoice.buyerName) {
            row.planeWithInfo = amount;
          } else {
            row.planeWithoutInfo = amount;
          }
          row.remarks = invoice.fileName;
          break;

        case '火车':
          row.railway = amount;
          row.remarks = invoice.fileName;
          break;

        case '轮船':
        case '大巴':
          row.roadWater = amount;
          row.remarks = invoice.fileName;
          break;

        case '的士（含个人信息）':
          row.taxi = amount;
          row.remarks = invoice.fileName;
          break;

        case '的士':
          row.taxi = amount;
          row.remarks = invoice.fileName;
          break;

        case '地铁':
        case '公交':
          row.trainBus = amount;
          row.remarks = invoice.fileName;
          break;

        case '住宿':
          row.accommodation = amount;
          row.remarks = invoice.fileName;
          break;

        default:
          row.other = amount;
          row.remarks = invoice.fileName;
      }
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
  
  // 设置列宽（放宽以便一眼看全）
  ws['!cols'] = [
    { wch: 14 },  // 日期
    { wch: 24 },  // 地点
    { wch: 12 },  // 飞机（含个人信息）
    { wch: 12 },  // 铁路费
    { wch: 14 },  // 公路水路费
    { wch: 18 },  // 旅客运输服务电子发票
    { wch: 12 },  // 飞机（不含个人信息）
    { wch: 14 },  // 火车、轮船、大巴
    { wch: 12 },  // 的士.公交
    { wch: 12 },  // 住宿费
    { wch: 12 },  // 其它
    { wch: 12 },  // 餐补
    { wch: 12 },  // 小计
    { wch: 30 },  // 备注
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
  // 获取发票类型的中文名称
  const getInvoiceTypeName = (type?: string): string => {
    switch (type) {
      case 'invoice_transport': return '交通';
      case 'invoice_hotel': return '住宿';
      case 'invoice_food': return '餐饮';
      case 'invoice_other': return '其他';
      case 'train': return '火车票';
      case 'flight': return '机票';
      case 'taxi': return '打车';
      case 'hotel': return '住宿';
      default: return '';
    }
  };

  return invoices.filter(inv => inv.isValid).map(invoice => {
    const typeName = getInvoiceTypeName(invoice.invoiceType);
    const invoiceNum = invoice.invoiceNumber || '';
    const otherInfo = typeName ? `${invoiceNum} [${typeName}]`.trim() : invoiceNum;

    return {
      date: invoice.invoiceDate || invoice.departureDate || '未识别',
      projectName: invoice.fileName || '',  // 使用文件名作为项目名称
      category: typeName,  // 将类型填入类别列
      amount: invoice.amountWithTax || invoice.totalAmount || 0,
      other: otherInfo,
      subtotal: invoice.amountWithTax || invoice.totalAmount || 0
    };
  });
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
