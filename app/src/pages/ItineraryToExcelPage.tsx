import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { InvoiceToExcelTool } from '@/components/InvoiceToExcelTool';
import { Table, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function ItineraryToExcelPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar currentTool="tools" />
      
      <main className="flex-1">
        {/* Hero区域 */}
        <section className="bg-gradient-to-b from-blue-50 to-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                  <Table className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                  PDF行程单转Excel
                </h1>
              </div>
              
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                智能识别各类差旅行程单，自动转换为Excel报销明细表。
                支持高德/滴滴打车行程单、铁路电子客票、机票行程单、酒店住宿水单等多种格式。
              </p>

              {/* 支持的类型 */}
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { icon: '🚕', text: '打车行程单' },
                  { icon: '🚄', text: '火车票' },
                  { icon: '✈️', text: '机票' },
                  { icon: '🏨', text: '住宿水单' },
                ].map((item, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-white rounded-full border border-gray-200 text-sm"
                  >
                    <span>{item.icon}</span>
                    <span className="text-gray-700">{item.text}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 主工具区域 */}
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <InvoiceToExcelTool />
          </div>
        </section>

        {/* 使用说明 */}
        <section className="py-12 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">使用说明</h2>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-blue-600 font-bold">1</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">上传行程单</h3>
                <p className="text-sm text-gray-600">
                  支持批量上传PDF格式的打车行程单、火车票、机票、住宿水单。删除文件后结果会自动更新。
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-blue-600 font-bold">2</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">自动识别</h3>
                <p className="text-sm text-gray-600">
                  系统自动识别行程单类型，提取日期、金额、行程等关键信息。识别失败会提示具体原因。
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-blue-600 font-bold">3</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">导出Excel</h3>
                <p className="text-sm text-gray-600">
                  一键导出标准格式的差旅费报销明细表，可直接用于财务报销流程。
                </p>
              </div>
            </div>

            {/* 注意事项 */}
            <Alert className="mt-8 bg-yellow-50 border-yellow-200">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <AlertDescription className="text-yellow-700">
                <p className="font-medium mb-1">注意事项：</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>请确保上传的PDF文件清晰可读，扫描件可能无法识别</li>
                  <li>系统会自动识别行程单类型，如果识别错误可尝试重新上传</li>
                  <li>解析失败时会显示具体原因，可根据提示检查文件</li>
                  <li>建议单个文件大小不超过10MB，批量上传最多50个文件</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
