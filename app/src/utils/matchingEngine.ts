import type { InvoiceData } from '@/types/pdf';
import type { MatchResult, MatchStatus, MatchStatistics } from '@/types/invoice';

// 判断是否为发票类型
function isInvoiceType(type?: string): boolean {
  return type?.startsWith('invoice_') || false;
}

// 判断是否为行程单类型
function isItineraryType(type?: string): boolean {
  return !isInvoiceType(type) && type !== undefined;
}

// 判断是否为火车票（不需要行程单）
function isTrainTicket(type?: string): boolean {
  return type === 'train';
}

// 类型匹配映射
const TYPE_MATCH_MAP: Record<string, string[]> = {
  'invoice_transport': ['taxi'],           // 运输服务发票 <-> 打车行程单
  'invoice_hotel': ['hotel'],              // 住宿服务发票 <-> 住宿水单
  'train': ['invoice_transport'],          // 火车票 <-> 运输服务发票
  'flight': ['invoice_transport'],         // 机票 <-> 运输服务发票
};

// 判断类型是否匹配
function isTypeMatch(type1?: string, type2?: string): boolean {
  if (!type1 || !type2) return false;

  // 完全相同
  if (type1 === type2) return true;

  // 检查映射关系
  const matches1 = TYPE_MATCH_MAP[type1] || [];
  const matches2 = TYPE_MATCH_MAP[type2] || [];

  return matches1.includes(type2) || matches2.includes(type1);
}

// 计算日期差异（天数）
function getDateDiff(date1?: string, date2?: string): number {
  if (!date1 || !date2) return 999;

  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return 999;
  }
}

// 计算金额差异
function getAmountDiff(amount1?: number, amount2?: number): number {
  if (amount1 === undefined || amount2 === undefined) return 999999;
  return Math.abs(amount1 - amount2);
}

// 计算匹配分数
function calculateMatchScore(invoice: InvoiceData, itinerary: InvoiceData): number {
  let score = 0;

  // 1. 类型匹配 (40分)
  if (isTypeMatch(invoice.invoiceType, itinerary.invoiceType)) {
    score += 40;
  }

  // 2. 日期匹配 (30分)
  const invoiceDate = invoice.invoiceDate || invoice.departureDate;
  const itineraryDate = itinerary.departureDate || itinerary.invoiceDate;
  const dateDiff = getDateDiff(invoiceDate, itineraryDate);

  if (dateDiff === 0) {
    score += 30;
  } else if (dateDiff <= 1) {
    score += 25;
  } else if (dateDiff <= 3) {
    score += 20;
  } else if (dateDiff <= 7) {
    score += 10;
  }

  // 3. 金额匹配 (30分)
  const invoiceAmount = invoice.amountWithTax || invoice.totalAmount || 0;
  const itineraryAmount = itinerary.amountWithTax || itinerary.totalAmount || 0;

  if (invoiceAmount > 0 && itineraryAmount > 0) {
    const amountDiff = Math.abs(invoiceAmount - itineraryAmount);
    const amountPercent = amountDiff / Math.max(invoiceAmount, itineraryAmount);

    if (amountPercent <= 0.01) {
      score += 30;
    } else if (amountPercent <= 0.05) {
      score += 25;
    } else if (amountPercent <= 0.1) {
      score += 15;
    } else if (amountPercent <= 0.2) {
      score += 5;
    }
  }

  return score;
}

// 主比对函数
export function matchInvoicesWithItineraries(allData: InvoiceData[]): MatchResult[] {
  const results: MatchResult[] = [];

  // 分离发票和行程单
  const invoices = allData.filter(d => d.isValid && isInvoiceType(d.invoiceType));
  const itineraries = allData.filter(d => d.isValid && isItineraryType(d.invoiceType));

  // 分离火车票（不需要行程单）
  const trainTickets = allData.filter(d => d.isValid && isTrainTicket(d.invoiceType));

  const matchedInvoices = new Set<string>();
  const matchedItineraries = new Set<string>();

  // 1. 遍历所有发票，寻找匹配的行程单
  for (const invoice of invoices) {
    let bestMatch: { itinerary: InvoiceData; score: number } | null = null;

    for (const itinerary of itineraries) {
      if (matchedItineraries.has(itinerary.id)) continue;

      const score = calculateMatchScore(invoice, itinerary);

      if (score >= 60 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { itinerary, score };
      }
    }

    if (bestMatch && bestMatch.score >= 60) {
      // 找到匹配
      matchedInvoices.add(invoice.id);
      matchedItineraries.add(bestMatch.itinerary.id);

      const invoiceDate = invoice.invoiceDate || invoice.departureDate;
      const itineraryDate = bestMatch.itinerary.departureDate || bestMatch.itinerary.invoiceDate;
      const dateDiff = getDateDiff(invoiceDate, itineraryDate);

      const invoiceAmount = invoice.amountWithTax || invoice.totalAmount || 0;
      const itineraryAmount = bestMatch.itinerary.amountWithTax || bestMatch.itinerary.totalAmount || 0;
      const amountDiff = getAmountDiff(invoiceAmount, itineraryAmount);

      // 判断具体状态
      let status: MatchStatus = 'matched';
      let reason = '匹配成功';

      if (dateDiff > 3) {
        status = 'date_mismatch';
        reason = `日期相差${dateDiff}天`;
      } else if (amountDiff > Math.max(invoiceAmount, itineraryAmount) * 0.1) {
        status = 'amount_mismatch';
        reason = `金额相差¥${amountDiff.toFixed(2)}`;
      }

      results.push({
        id: `match-${invoice.id}-${bestMatch.itinerary.id}`,
        status,
        invoice,
        itinerary: bestMatch.itinerary,
        confidence: bestMatch.score,
        dateDiff,
        amountDiff,
        reason
      });
    } else {
      // 发票缺少行程单
      results.push({
        id: `invoice-only-${invoice.id}`,
        status: 'invoice_missing_itinerary',
        invoice,
        reason: '未找到对应的行程单'
      });
    }
  }

  // 2. 处理火车票（标记为完全匹配，不需要行程单）
  for (const trainTicket of trainTickets) {
    results.push({
      id: `train-${trainTicket.id}`,
      status: 'matched',
      invoice: trainTicket,
      reason: '火车票无需行程单'
    });
  }

  // 3. 检查未匹配的行程单
  for (const itinerary of itineraries) {
    if (!matchedItineraries.has(itinerary.id)) {
      results.push({
        id: `itinerary-only-${itinerary.id}`,
        status: 'itinerary_missing_invoice',
        itinerary,
        reason: '未找到对应的发票'
      });
    }
  }

  // 4. 按日期排序（最新的在前）
  results.sort((a, b) => {
    const dateA = a.invoice?.invoiceDate || a.invoice?.departureDate ||
                  a.itinerary?.departureDate || a.itinerary?.invoiceDate || '';
    const dateB = b.invoice?.invoiceDate || b.invoice?.departureDate ||
                  b.itinerary?.departureDate || b.itinerary?.invoiceDate || '';

    // 降序排列（最新的在前）
    return dateB.localeCompare(dateA);
  });

  return results;
}

// 计算比对统计
export function calculateMatchStatistics(matchResults: MatchResult[]): MatchStatistics {
  const stats: MatchStatistics = {
    total: matchResults.length,
    matched: 0,
    invoiceMissing: 0,
    itineraryMissing: 0,
    amountMismatch: 0,
    dateMismatch: 0
  };

  for (const result of matchResults) {
    switch (result.status) {
      case 'matched':
        stats.matched++;
        break;
      case 'invoice_missing_itinerary':
        stats.invoiceMissing++;
        break;
      case 'itinerary_missing_invoice':
        stats.itineraryMissing++;
        break;
      case 'amount_mismatch':
        stats.amountMismatch++;
        break;
      case 'date_mismatch':
        stats.dateMismatch++;
        break;
    }
  }

  return stats;
}

// 获取状态文本
export function getMatchStatusText(status: MatchStatus): string {
  const statusMap: Record<MatchStatus, string> = {
    'matched': '完全匹配',
    'invoice_missing_itinerary': '发票缺行程单',
    'itinerary_missing_invoice': '行程单缺发票',
    'amount_mismatch': '金额不符',
    'date_mismatch': '日期不符',
    'unmatched': '未匹配'
  };

  return statusMap[status] || '未知';
}

// 获取状态颜色类
export function getMatchStatusColor(status: MatchStatus): string {
  const colorMap: Record<MatchStatus, string> = {
    'matched': 'bg-green-100 text-green-800',
    'invoice_missing_itinerary': 'bg-orange-100 text-orange-800',
    'itinerary_missing_invoice': 'bg-yellow-100 text-yellow-800',
    'amount_mismatch': 'bg-red-100 text-red-800',
    'date_mismatch': 'bg-red-100 text-red-800',
    'unmatched': 'bg-gray-100 text-gray-800'
  };

  return colorMap[status] || 'bg-gray-100 text-gray-800';
}
