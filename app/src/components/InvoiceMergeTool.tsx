import { useState, useCallback } from 'react';
import { FileText, Download, RotateCcw, Check, AlertCircle, Eye, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileUpload } from './FileUpload';
import { usePDFProcessor } from '@/hooks/usePDFProcessor';
import type { ProcessingOptions, ProcessingResult } from '@/types/pdf';
import type { InvoiceData, ExpenseDetailRow } from '@/types/invoice';
import { parseItineraryPDF } from '@/utils/invoiceParser';
import { convertToExpenseDetailRows, generateExpenseDetailExcel } from '@/utils/invoiceParser';

export function InvoiceMergeTool() {
  const {
    files,
    isProcessing,
    progress,
    addFiles,
    removeFile,
    clearFiles,
    mergeInvoices,
  } = usePDFProcessor();

  const [options, setOptions] = useState<ProcessingOptions>({
    mergeMode: 'two-per-page',
    outputFormat: 'hd-pdf',
  });

  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [expenseDetailRows, setExpenseDetailRows] = useState<ExpenseDetailRow[]>([]);
  const [showExpensePreview, setShowExpensePreview] = useState(false);
  const [sortedInvoices, setSortedInvoices] = useState<InvoiceData[]>([]);
  const [showPrintListPreview, setShowPrintListPreview] = useState(false);

  const handleConvert = useCallback(async () => {
    // 先解析发票数据
    const parsedInvoices: InvoiceData[] = [];
    for (const file of files) {
      try {
        const parseResult = await parseItineraryPDF(file.file);
        console.log(`解析文件 ${file.name}:`, parseResult);
        if (parseResult.success) {
          // 将文件ID关联到发票数据
          parsedInvoices.push({
            ...parseResult.data,
            id: file.id, // 使用文件ID
          });
        }
      } catch (error) {
        console.error(`解析发票失败: ${file.name}`, error);
      }
    }

    console.log('所有解析的发票:', parsedInvoices);

    // 按日期排序发票（升序：最早的在前）
    // 如果日期相同或都没有日期，则按文件名排序
    parsedInvoices.sort((a, b) => {
      const dateA = a.invoiceDate || a.departureDate || '';
      const dateB = b.invoiceDate || b.departureDate || '';

      // 如果两个都有日期，按日期排序
      if (dateA && dateB) {
        const dateCompare = dateA.localeCompare(dateB);
        if (dateCompare !== 0) return dateCompare;
        // 日期相同，按文件名排序
        return (a.fileName || '').localeCompare(b.fileName || '');
      }

      // 如果只有一个有日期，有日期的排在前面
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;

      // 如果都没有日期，按文件名排序
      return (a.fileName || '').localeCompare(b.fileName || '');
    });

    console.log('排序后的发票:', parsedInvoices);

    // 保存排序后的发票数据
    setSortedInvoices(parsedInvoices);

    // 分离发票和行程单
    const invoiceList = parsedInvoices.filter(inv =>
      inv.invoiceType?.startsWith('invoice_')
    );
    const itineraryList = parsedInvoices.filter(inv =>
      !inv.invoiceType?.startsWith('invoice_')
    );

    console.log('发票列表:', invoiceList);
    console.log('行程单列表:', itineraryList);

    // 先排列发票，再排列行程单
    const invoiceFiles = invoiceList
      .map(invoice => files.find(f => f.id === invoice.id))
      .filter(Boolean) as typeof files;

    const itineraryFiles = itineraryList
      .map(itinerary => files.find(f => f.id === itinerary.id))
      .filter(Boolean) as typeof files;

    // 合并顺序：发票在前，行程单在后
    const sortedFiles = [...invoiceFiles, ...itineraryFiles];

    // 添加未解析成功的文件到末尾
    const parsedFileIds = new Set(parsedInvoices.map(inv => inv.id));
    const unparsedFiles = files.filter(f => !parsedFileIds.has(f.id));
    const finalSortedFiles = [...sortedFiles, ...unparsedFiles];

    console.log('最终文件顺序:', finalSortedFiles.map(f => f.name));
    console.log(`发票: ${invoiceFiles.length}张, 行程单: ${itineraryFiles.length}张`);

    // 生成费用明细表数据
    const expenseRows = convertToExpenseDetailRows(parsedInvoices);
    console.log('费用明细表行数据:', expenseRows);
    setExpenseDetailRows(expenseRows);

    // 执行PDF合并（使用排序后的文件，传递分组信息）
    const result = await mergeInvoices(options, finalSortedFiles, invoiceFiles.length);
    setResult(result);
  }, [mergeInvoices, options, files]);

  const handleDownload = useCallback(() => {
    if (result?.downloadUrl && result?.fileName) {
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [result]);

  const handleReset = useCallback(() => {
    clearFiles();
    setResult(null);
    setExpenseDetailRows([]);
    setShowExpensePreview(false);
    setSortedInvoices([]);
    setShowPrintListPreview(false);
  }, [clearFiles]);

  const handleExportExpenseDetail = useCallback(() => {
    if (expenseDetailRows.length === 0) return;

    const blob = generateExpenseDetailExcel(expenseDetailRows);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `业务费用明细表_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [expenseDetailRows]);

  // 生成打印清单
  const handleExportPrintList = useCallback(() => {
    if (sortedInvoices.length === 0) return;

    const XLSX = window.XLSX;
    if (!XLSX) {
      alert('Excel库未加载，请刷新页面重试');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 准备数据
    const data: (string | number)[][] = [
      ['发票打印清单', '', '', '', '', ''],
      ['打印日期：', new Date().toLocaleDateString('zh-CN'), '', '', '', ''],
      ['总计：', `${sortedInvoices.length} 张发票`, '', '', '', ''],
      [],
      ['序号', '文件名', '发票日期', '发票号码', '金额（元）', '备注'],
    ];

    // 数据行
    sortedInvoices.forEach((invoice, index) => {
      data.push([
        index + 1,
        invoice.fileName || '',
        invoice.invoiceDate || invoice.departureDate || '未识别',
        invoice.invoiceNumber || '',
        invoice.amountWithTax || invoice.totalAmount || 0,
        invoice.invoiceType?.startsWith('invoice_') ? '发票' : '行程单'
      ]);
    });

    // 合计行
    const totalAmount = sortedInvoices.reduce((sum, inv) =>
      sum + (inv.amountWithTax || inv.totalAmount || 0), 0
    );
    data.push([
      '',
      '合计',
      '',
      '',
      totalAmount,
      ''
    ]);

    // 创建工作表
    const ws = XLSX.utils.aoa_to_sheet(data);

    // 设置列宽
    ws['!cols'] = [
      { wch: 8 },   // 序号
      { wch: 35 },  // 文件名
      { wch: 15 },  // 发票日期
      { wch: 20 },  // 发票号码
      { wch: 15 },  // 金额
      { wch: 12 }   // 备注
    ];

    // 合并单元格
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },  // 标题行
    ];

    XLSX.utils.book_append_sheet(wb, ws, '打印清单');

    // 导出
    XLSX.writeFile(wb, `发票打印清单_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [sortedInvoices]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* 步骤1：文件上传 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">1</span>
            文件上传
            <span className="text-sm font-normal text-gray-500">（同时最大 999 份）</span>
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
          />
        </CardContent>
      </Card>

      {/* 步骤2：转换参数 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">2</span>
            转换参数和提交转换
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 合并方式 */}
          <div className="space-y-3">
            <Label className="text-base font-medium">合并方式：</Label>
            <RadioGroup
              value={options.mergeMode}
              onValueChange={(value) =>
                setOptions(prev => ({ ...prev, mergeMode: value as 'two-per-page' | 'four-per-page' }))
              }
              className="flex flex-wrap gap-4"
              disabled={isProcessing}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="two-per-page" id="two-per-page" />
                <Label htmlFor="two-per-page" className="cursor-pointer">
                  两张发票在一张A4纸张上
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="four-per-page" id="four-per-page" />
                <Label htmlFor="four-per-page" className="cursor-pointer">
                  四张发票在一张A4纸张上
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 展示内容 */}
          <div className="space-y-3">
            <Label className="text-base font-medium">展示内容：</Label>
            <RadioGroup
              value={options.outputFormat}
              onValueChange={(value) =>
                setOptions(prev => ({ ...prev, outputFormat: value as 'hd-pdf' | 'image' | 'pdf' }))
              }
              className="flex flex-wrap gap-4"
              disabled={isProcessing}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="hd-pdf" id="hd-pdf" />
                <Label htmlFor="hd-pdf" className="cursor-pointer flex items-center gap-1">
                  高清PDF
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">建议</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="image" id="image" />
                <Label htmlFor="image" className="cursor-pointer">
                  图片
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="cursor-pointer flex items-center gap-1">
                  PDF
                  <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">可能丢失印章</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 排序说明 */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-700 text-sm">
              <div className="space-y-1">
                <p>• 发票将按照开票日期自动排序（从早到晚）</p>
                <p>• 发票和行程单会分开打印，不会混在同一页</p>
                <p>• 打印顺序：先打印所有发票，再打印所有行程单</p>
              </div>
            </AlertDescription>
          </Alert>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              onClick={handleConvert}
              disabled={files.length === 0 || isProcessing}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              {isProcessing ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  免费转换
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isProcessing || (files.length === 0 && !result)}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              刷新页面
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 步骤3：转换结果 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">3</span>
            转换结果
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-4">
              <Alert className={result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
                <AlertDescription className="flex items-center gap-2">
                  {result.success ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className={result.success ? 'text-green-700' : 'text-red-700'}>
                    {result.message}
                  </span>
                </AlertDescription>
              </Alert>
              
              {result.success && result.downloadUrl && (
                <>
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-green-500 hover:bg-green-600 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    下载合并PDF
                  </Button>

                  {/* 打印清单按钮 */}
                  {sortedInvoices.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <Button
                          onClick={() => setShowPrintListPreview(!showPrintListPreview)}
                          variant="outline"
                          className="flex-1"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          {showPrintListPreview ? '隐藏' : '预览'}打印清单
                        </Button>
                        <Button
                          onClick={handleExportPrintList}
                          className="flex-1 bg-purple-500 hover:bg-purple-600 text-white"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          导出打印清单
                        </Button>
                      </div>

                      {showPrintListPreview && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-4 py-3 border-b">
                            <h3 className="font-bold text-center">发票打印清单</h3>
                            <div className="text-sm text-gray-600 mt-1 flex justify-between">
                              <span>打印日期：{new Date().toLocaleDateString('zh-CN')}</span>
                              <span>总计：{sortedInvoices.length} 张发票</span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-center border">序号</th>
                                  <th className="px-4 py-2 text-left border">文件名</th>
                                  <th className="px-4 py-2 text-left border">发票日期</th>
                                  <th className="px-4 py-2 text-left border">发票号码</th>
                                  <th className="px-4 py-2 text-right border">金额（元）</th>
                                  <th className="px-4 py-2 text-center border">备注</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedInvoices.map((invoice, index) => (
                                  <tr key={invoice.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 text-center border">{index + 1}</td>
                                    <td className="px-4 py-2 border text-xs" title={invoice.fileName}>
                                      {invoice.fileName && invoice.fileName.length > 30
                                        ? invoice.fileName.substring(0, 30) + '...'
                                        : invoice.fileName}
                                    </td>
                                    <td className="px-4 py-2 border">
                                      {invoice.invoiceDate || invoice.departureDate || (
                                        <span className="text-gray-400">未识别</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2 border text-xs">
                                      {invoice.invoiceNumber || '-'}
                                    </td>
                                    <td className="px-4 py-2 text-right border">
                                      {(invoice.amountWithTax || invoice.totalAmount || 0).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-2 text-center border text-xs">
                                      {invoice.invoiceType?.startsWith('invoice_') ? '发票' : '行程单'}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="bg-yellow-50 font-bold">
                                  <td className="px-4 py-2 border"></td>
                                  <td className="px-4 py-2 border">合计</td>
                                  <td className="px-4 py-2 border"></td>
                                  <td className="px-4 py-2 border"></td>
                                  <td className="px-4 py-2 text-right border">
                                    {sortedInvoices.reduce((sum, inv) =>
                                      sum + (inv.amountWithTax || inv.totalAmount || 0), 0
                                    ).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2 border"></td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {expenseDetailRows.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <div className="flex gap-3">
                        <Button
                          onClick={() => setShowExpensePreview(!showExpensePreview)}
                          variant="outline"
                          className="flex-1"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          {showExpensePreview ? '隐藏' : '预览'}费用明细表
                        </Button>
                        <Button
                          onClick={handleExportExpenseDetail}
                          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          导出费用明细表
                        </Button>
                      </div>

                      {showExpensePreview && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-4 py-2 text-left border">日期</th>
                                  <th className="px-4 py-2 text-left border">项目名称</th>
                                  <th className="px-4 py-2 text-left border">类别</th>
                                  <th className="px-4 py-2 text-right border">金额</th>
                                  <th className="px-4 py-2 text-left border">其他</th>
                                  <th className="px-4 py-2 text-right border">小计</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expenseDetailRows.map((row, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 border">{row.date}</td>
                                    <td className="px-4 py-2 border">{row.projectName}</td>
                                    <td className="px-4 py-2 border">{row.category}</td>
                                    <td className="px-4 py-2 text-right border">{row.amount.toFixed(2)}</td>
                                    <td className="px-4 py-2 border text-xs">{row.other}</td>
                                    <td className="px-4 py-2 text-right border">{row.subtotal.toFixed(2)}</td>
                                  </tr>
                                ))}
                                <tr className="bg-yellow-50 font-bold">
                                  <td className="px-4 py-2 border"></td>
                                  <td className="px-4 py-2 border">合计</td>
                                  <td className="px-4 py-2 border"></td>
                                  <td className="px-4 py-2 text-right border">
                                    {expenseDetailRows.reduce((sum, r) => sum + r.amount, 0).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2 border"></td>
                                  <td className="px-4 py-2 text-right border">
                                    {expenseDetailRows.reduce((sum, r) => sum + r.subtotal, 0).toFixed(2)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>请先上传文件并且提交转换，结果自动显示</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
