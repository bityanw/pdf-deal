import { useState, useCallback } from 'react';
import { Download, RotateCcw, Check, AlertCircle, Table, Eye, EyeOff, Train, Plane, Hotel, Car, FileSpreadsheet, Receipt, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileUpload } from './FileUpload';
import { useInvoiceToExcel } from '@/hooks/useInvoiceToExcel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getMatchStatusText, getMatchStatusColor } from '@/utils/matchingEngine';

// 判断是否为发票类型
const isInvoiceType = (type?: string): boolean => {
  return type?.startsWith('invoice_') || false;
};

// 获取行程单类型图标
function getItineraryIcon(type?: string) {
  if (isInvoiceType(type)) {
    return <Receipt className="w-4 h-4 text-gray-500" />;
  }
  switch (type) {
    case 'train':
      return <Train className="w-4 h-4 text-blue-500" />;
    case 'flight':
      return <Plane className="w-4 h-4 text-sky-500" />;
    case 'hotel':
      return <Hotel className="w-4 h-4 text-orange-500" />;
    case 'taxi':
      return <Car className="w-4 h-4 text-green-500" />;
    default:
      return <Table className="w-4 h-4 text-gray-500" />;
  }
}

// 获取行程单类型名称
function getItineraryTypeName(type?: string) {
  if (isInvoiceType(type)) {
    return '发票';
  }
  switch (type) {
    case 'train':
      return '火车票';
    case 'flight':
      return '机票';
    case 'hotel':
      return '住宿';
    case 'taxi':
      return '打车';
    default:
      return '其他';
  }
}

export function InvoiceToExcelTool() {
  const {
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
  } = useInvoiceToExcel();

  const [showDetails, setShowDetails] = useState(false);
  const [showMatchDetails, setShowMatchDetails] = useState(false);

  const handleDownload = useCallback(() => {
    downloadExcel();
  }, [downloadExcel]);

  const handleReset = useCallback(() => {
    clearFiles();
  }, [clearFiles]);

  // 获取有效发票数量
  const validInvoiceCount = invoices.filter(inv => inv.isValid).length;
  const invalidInvoiceCount = invoices.filter(inv => !inv.isValid).length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* 步骤1：文件上传 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">1</span>
            上传发票和行程单
            <span className="text-sm font-normal text-gray-500">（同时最大 50 份，单个文件最大10MB）</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FileUpload
            files={files}
            onFilesAdd={addFiles}
            onFileRemove={removeFile}
            onClear={clearFiles}
            isProcessing={isProcessing}
            progress={progress}
            maxFiles={50}
          />
        </CardContent>
      </Card>

      {/* 步骤2：转换结果 */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">2</span>
              解析结果
              {validInvoiceCount > 0 && (
                <Badge className="bg-green-500 text-white ml-2">
                  成功 {validInvoiceCount} 张
                </Badge>
              )}
              {invalidInvoiceCount > 0 && (
                <Badge className="bg-red-500 text-white ml-2">
                  失败 {invalidInvoiceCount} 张
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 结果显示 */}
            {result && (
              <Alert className={result.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}>
                <AlertDescription className="flex items-center gap-2">
                  {result.success ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  )}
                  <span className={result.success ? 'text-green-700' : 'text-yellow-700'}>
                    {result.message}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {/* 重复提示 */}
            {duplicates && duplicates.length > 0 && (
              <Alert className="bg-orange-50 border-orange-200">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <AlertDescription className="text-orange-700">
                  <p className="font-medium">检测到重复行程单：</p>
                  <ul className="list-disc list-inside text-sm mt-1">
                    {duplicates.map((dup, idx) => (
                      <li key={idx}>{dup}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* 统计信息 */}
            {statistics && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h4 className="text-sm font-medium text-blue-800 mb-3">解析统计</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{statistics.total}</div>
                    <div className="text-xs text-blue-700">总计</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{statistics.success}</div>
                    <div className="text-xs text-green-700">成功</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{statistics.failed}</div>
                    <div className="text-xs text-red-700">失败</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{statistics.duplicate}</div>
                    <div className="text-xs text-orange-700">重复</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-500">{statistics.invoice}</div>
                    <div className="text-xs text-gray-600">发票</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-500">{statistics.itinerary}</div>
                    <div className="text-xs text-blue-600">行程单</div>
                  </div>
                </div>
                {statistics.success > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <div className="text-xs text-blue-700 mb-2">分类统计：</div>
                    <div className="flex flex-wrap gap-2">
                      {statistics.byType.train > 0 && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          <Train className="w-3 h-3 mr-1" />
                          火车票 {statistics.byType.train}
                        </Badge>
                      )}
                      {statistics.byType.taxi > 0 && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          <Car className="w-3 h-3 mr-1" />
                          打车 {statistics.byType.taxi}
                        </Badge>
                      )}
                      {statistics.byType.flight > 0 && (
                        <Badge variant="secondary" className="bg-sky-100 text-sky-800">
                          <Plane className="w-3 h-3 mr-1" />
                          机票 {statistics.byType.flight}
                        </Badge>
                      )}
                      {statistics.byType.hotel > 0 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                          <Hotel className="w-3 h-3 mr-1" />
                          住宿 {statistics.byType.hotel}
                        </Badge>
                      )}
                      {statistics.byType.other > 0 && (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                          <Table className="w-3 h-3 mr-1" />
                          其他 {statistics.byType.other}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 比对结果 */}
            {matchStats && matchStats.total > 0 && (
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-purple-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    发票与行程单比对结果
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMatchDetails(!showMatchDetails)}
                    className="text-purple-600 hover:text-purple-700"
                  >
                    {showMatchDetails ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                    {showMatchDetails ? '收起' : '展开'}
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{matchStats.matched}</div>
                    <div className="text-xs text-green-700">完全匹配</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{matchStats.invoiceMissing}</div>
                    <div className="text-xs text-orange-700">发票缺行程单</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{matchStats.itineraryMissing}</div>
                    <div className="text-xs text-yellow-700">行程单缺发票</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{matchStats.amountMismatch}</div>
                    <div className="text-xs text-red-700">金额不符</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{matchStats.dateMismatch}</div>
                    <div className="text-xs text-red-700">日期不符</div>
                  </div>
                </div>

                {/* 比对详情表格 */}
                {showMatchDetails && (
                  <div className="mt-4 overflow-x-auto border rounded-lg bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">状态</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">发票</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">行程单</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">日期</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">金额</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">说明</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {matchResults.map((match) => (
                          <tr key={match.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <Badge className={getMatchStatusColor(match.status)}>
                                {getMatchStatusText(match.status)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 max-w-[150px] truncate" title={match.invoice?.fileName}>
                              {match.invoice?.fileName || '-'}
                            </td>
                            <td className="px-3 py-2 max-w-[150px] truncate" title={match.itinerary?.fileName}>
                              {match.itinerary?.fileName || '-'}
                            </td>
                            <td className="px-3 py-2">
                              {match.invoice?.invoiceDate || match.itinerary?.departureDate || '-'}
                              {match.dateDiff !== undefined && match.dateDiff > 0 && (
                                <span className="text-xs text-red-600 ml-1">
                                  (±{match.dateDiff}天)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {match.invoice?.amountWithTax && match.itinerary?.amountWithTax ? (
                                match.invoice.amountWithTax !== match.itinerary.amountWithTax ? (
                                  <span className="text-red-600">
                                    ¥{match.invoice.amountWithTax.toFixed(2)} ≠ ¥{match.itinerary.amountWithTax.toFixed(2)}
                                  </span>
                                ) : (
                                  `¥${match.invoice.amountWithTax.toFixed(2)}`
                                )
                              ) : (
                                `¥${(match.invoice?.amountWithTax || match.itinerary?.amountWithTax || 0).toFixed(2)}`
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {match.reason || '-'}
                              {match.confidence !== undefined && (
                                <span className="ml-1 text-gray-400">
                                  ({match.confidence}%)
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 发票详情表格 */}
            {invoices.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">行程单解析详情</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-gray-500"
                  >
                    {showDetails ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                    {showDetails ? '收起' : '展开'}
                  </Button>
                </div>
                
                {showDetails && (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">类型</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">文件名</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">日期</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">行程</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">金额</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-700">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {invoices.map((invoice, index) => (
                          <tr key={invoice.id} className={cn(
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50',
                            !invoice.isValid && 'bg-red-50'
                          )}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                {getItineraryIcon(invoice.invoiceType)}
                                <span className="text-xs">{getItineraryTypeName(invoice.invoiceType)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 max-w-[150px] truncate" title={invoice.fileName}>
                              {invoice.fileName}
                            </td>
                            <td className="px-3 py-2">{invoice.departureDate || invoice.invoiceDate || '-'}</td>
                            <td className="px-3 py-2">
                              {invoice.departure && invoice.destination 
                                ? `${invoice.departure}-${invoice.destination}` 
                                : invoice.destination || '-'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {invoice.amountWithTax !== undefined 
                                ? `¥${invoice.amountWithTax.toFixed(2)}` 
                                : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {isInvoiceType(invoice.invoiceType) ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                  已跳过
                                </span>
                              ) : invoice.isValid ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  成功
                                </span>
                              ) : (
                                <span 
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 cursor-help" 
                                  title={invoice.parseError}
                                >
                                  失败
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-3 pt-4">
              {result?.success && result.excelUrl && (
                <Button
                  onClick={handleDownload}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  下载Excel文件
                </Button>
              )}
              
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isProcessing}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                清空重置
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Excel预览 - 默认展示 */}
      {previewData && previewData.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-500" />
              Excel预览
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    {previewData[0]?.map((header: string, idx: number) => (
                      <th 
                        key={idx} 
                        className="px-3 py-2 text-left font-medium text-gray-700 border border-gray-300"
                        colSpan={idx === 2 || idx === 6 ? 3 : 1}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {previewData.slice(1).map((row: any[], rowIdx: number) => (
                    <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {row.map((cell: any, cellIdx: number) => (
                        <td 
                          key={cellIdx} 
                          className={cn(
                            "px-3 py-2 border border-gray-200",
                            typeof cell === 'number' && cell > 0 ? 'text-right font-medium' : '',
                            rowIdx === previewData.length - 2 && 'bg-yellow-50 font-bold'
                          )}
                        >
                          {cell !== '' && cell !== undefined ? 
                            (typeof cell === 'number' ? `¥${cell.toFixed(2)}` : cell) 
                            : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              * 预览仅供参考，实际Excel文件包含完整格式和边框
            </p>
          </CardContent>
        </Card>
      )}

      {/* 步骤3：Excel模板说明 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Table className="w-5 h-5 text-blue-500" />
            Excel模板说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600 space-y-2">
            <p>生成的Excel文件包含以下字段：</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong>日期</strong> - 行程日期或发票日期</li>
              <li><strong>地点</strong> - 出发地-目的地</li>
              <li><strong>含个人信息交通费-飞机</strong> - 含个人信息的机票费用</li>
              <li><strong>铁路费</strong> - 火车票费用</li>
              <li><strong>公路水路费</strong> - 轮船、大巴费用</li>
              <li><strong>旅客运输服务电子发票</strong> - 打车发票、运输服务发票</li>
              <li><strong>不含个人信息交通费-飞机</strong> - 不含个人信息的机票</li>
              <li><strong>火车、轮船、大巴</strong> - 其他交通工具费用</li>
              <li><strong>的士、公交</strong> - 出租车、地铁、公交费用</li>
              <li><strong>住宿费</strong> - 酒店住宿费用、住宿发票</li>
              <li><strong>其它</strong> - 其他费用、其他类型发票</li>
              <li><strong>餐补</strong> - 出差餐费补贴（默认50元）</li>
              <li><strong>小计</strong> - 各项费用合计</li>
              <li><strong>备注</strong> - 备注信息</li>
            </ul>
            <p className="text-xs text-gray-500 mt-4">
              提示：系统会自动识别文件类型（发票/行程单）并分类到对应的费用栏目，同时进行智能比对。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
