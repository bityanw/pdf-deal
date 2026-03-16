import { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HeroSection } from '@/sections/HeroSection';
import { InvoiceMergeTool } from '@/components/InvoiceMergeTool';
import { PDFToolsGrid } from '@/components/PDFToolsGrid';
import type { PDFTool } from '@/types/pdf';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/FileUpload';
import { usePDFProcessor } from '@/hooks/usePDFProcessor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Check, AlertCircle, RotateCcw } from 'lucide-react';

// PDF合并工具对话框
function MergePDFDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { files, isProcessing, progress, addFiles, removeFile, clearFiles, mergePDFs } = usePDFProcessor();
  const [result, setResult] = useState<{ success: boolean; message: string; downloadUrl?: string; fileName?: string } | null>(null);

  const handleMerge = async () => {
    const res = await mergePDFs();
    setResult(res);
  };

  const handleDownload = () => {
    if (result?.downloadUrl && result?.fileName) {
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleClose = () => {
    clearFiles();
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PDF合并</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <FileUpload
            files={files}
            onFilesAdd={addFiles}
            onFileRemove={removeFile}
            onClear={clearFiles}
            isProcessing={isProcessing}
            progress={progress}
          />
          
          {result && (
            <Alert className={result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
              <AlertDescription className="flex items-center gap-2">
                {result.success ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
                <span className={result.success ? 'text-green-700' : 'text-red-700'}>{result.message}</span>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex gap-2">
            <Button
              onClick={handleMerge}
              disabled={files.length < 2 || isProcessing}
              className="flex-1 bg-blue-500 hover:bg-blue-600"
            >
              {isProcessing ? <><RotateCcw className="w-4 h-4 mr-2 animate-spin" />处理中...</> : '合并PDF'}
            </Button>
            
            {result?.success && result.downloadUrl && (
              <Button onClick={handleDownload} className="bg-green-500 hover:bg-green-600">
                <Download className="w-4 h-4 mr-2" />下载
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// PDF分割工具对话框
function SplitPDFDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { files, isProcessing, progress, addFiles, removeFile, clearFiles, splitPDF } = usePDFProcessor();
  const [pageRanges, setPageRanges] = useState('1-3');
  const [result, setResult] = useState<{ success: boolean; message: string; downloadUrl?: string; fileName?: string } | null>(null);

  const handleSplit = async () => {
    const res = await splitPDF(pageRanges);
    setResult(res);
  };

  const handleDownload = () => {
    if (result?.downloadUrl && result?.fileName) {
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleClose = () => {
    clearFiles();
    setResult(null);
    setPageRanges('1-3');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PDF分割</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <FileUpload
            files={files}
            onFilesAdd={addFiles}
            onFileRemove={removeFile}
            onClear={clearFiles}
            isProcessing={isProcessing}
            progress={progress}
            maxFiles={1}
          />
          
          {files.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">页码范围（例如：1-3,5,7-9）</label>
              <input
                type="text"
                value={pageRanges}
                onChange={(e) => setPageRanges(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="1-3,5,7-9"
              />
            </div>
          )}
          
          {result && (
            <Alert className={result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
              <AlertDescription className="flex items-center gap-2">
                {result.success ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
                <span className={result.success ? 'text-green-700' : 'text-red-700'}>{result.message}</span>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex gap-2">
            <Button
              onClick={handleSplit}
              disabled={files.length !== 1 || isProcessing}
              className="flex-1 bg-blue-500 hover:bg-blue-600"
            >
              {isProcessing ? <><RotateCcw className="w-4 h-4 mr-2 animate-spin" />处理中...</> : '分割PDF'}
            </Button>
            
            {result?.success && result.downloadUrl && (
              <Button onClick={handleDownload} className="bg-green-500 hover:bg-green-600">
                <Download className="w-4 h-4 mr-2" />下载
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// PDF压缩工具对话框
function CompressPDFDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { files, isProcessing, progress, addFiles, removeFile, clearFiles, compressPDF } = usePDFProcessor();
  const [result, setResult] = useState<{ success: boolean; message: string; downloadUrl?: string; fileName?: string } | null>(null);

  const handleCompress = async () => {
    const res = await compressPDF();
    setResult(res);
  };

  const handleDownload = () => {
    if (result?.downloadUrl && result?.fileName) {
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleClose = () => {
    clearFiles();
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PDF压缩</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <FileUpload
            files={files}
            onFilesAdd={addFiles}
            onFileRemove={removeFile}
            onClear={clearFiles}
            isProcessing={isProcessing}
            progress={progress}
            maxFiles={1}
          />
          
          {result && (
            <Alert className={result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
              <AlertDescription className="flex items-center gap-2">
                {result.success ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
                <span className={result.success ? 'text-green-700' : 'text-red-700'}>{result.message}</span>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex gap-2">
            <Button
              onClick={handleCompress}
              disabled={files.length !== 1 || isProcessing}
              className="flex-1 bg-blue-500 hover:bg-blue-600"
            >
              {isProcessing ? <><RotateCcw className="w-4 h-4 mr-2 animate-spin" />处理中...</> : '压缩PDF'}
            </Button>
            
            {result?.success && result.downloadUrl && (
              <Button onClick={handleDownload} className="bg-green-500 hover:bg-green-600">
                <Download className="w-4 h-4 mr-2" />下载
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function App() {
  const [activeDialog, setActiveDialog] = useState<string | null>(null);

  const handleToolClick = (tool: PDFTool) => {
    if (tool.id === 'pdf-merge') {
      setActiveDialog('merge');
    } else if (tool.id === 'pdf-split') {
      setActiveDialog('split');
    } else if (tool.id === 'pdf-compress') {
      setActiveDialog('compress');
    } else if (tool.id === 'pdf-invoice-parse') {
      // 跳转到新页面 - 使用相对路径
      window.location.href = './itinerary-to-excel.html';
    } else {
      alert(`「${tool.name}」功能即将上线，敬请期待！`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar currentTool="home" />
      
      <main className="flex-1">
        {/* Hero区域 */}
        <HeroSection />
        
        {/* 主工具区域 - 发票合并 */}
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">在线PDF电子发票合并批量打印</h2>
              <p className="text-gray-500 mt-2">简单三步，快速合并您的电子发票</p>
            </div>
            <InvoiceMergeTool />
          </div>
        </section>

        {/* 其他PDF工具 */}
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">在线PDF转换器/处理工具</h2>
              <p className="text-gray-500 mt-2">更多实用的PDF处理功能</p>
            </div>
            <PDFToolsGrid onToolClick={handleToolClick} />
          </div>
        </section>
      </main>

      <Footer />

      {/* 工具对话框 */}
      <MergePDFDialog open={activeDialog === 'merge'} onClose={() => setActiveDialog(null)} />
      <SplitPDFDialog open={activeDialog === 'split'} onClose={() => setActiveDialog(null)} />
      <CompressPDFDialog open={activeDialog === 'compress'} onClose={() => setActiveDialog(null)} />
    </div>
  );
}

export default App;
