import { useCallback, useEffect, useState } from 'react';
import { Upload, X, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PDFFile } from '@/types/pdf';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  files: PDFFile[];
  onFilesAdd: (files: FileList | null) => Promise<string[]> | string[];
  onFileRemove: (id: string) => void;
  onClear: () => void;
  isProcessing?: boolean;
  progress?: number;
  maxFiles?: number;
  accept?: string;
}

export function FileUpload({
  files,
  onFilesAdd,
  onFileRemove,
  onClear,
  isProcessing = false,
  progress = 0,
  maxFiles = 999,
  accept = '.pdf',
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setValidationErrors([]);
    const errors = await onFilesAdd(e.dataTransfer.files);
    if (errors.length > 0) {
      setValidationErrors(errors);
    }
  }, [onFilesAdd]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationErrors([]);
    const errors = await onFilesAdd(e.target.files);
    if (errors.length > 0) {
      setValidationErrors(errors);
    }
    e.target.value = ''; // 重置input
  }, [onFilesAdd]);

  // 粘贴功能
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const fileList: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type === 'application/pdf') {
          const file = item.getAsFile();
          if (file) fileList.push(file);
        }
      }

      if (fileList.length > 0) {
        setValidationErrors([]);
        const dataTransfer = new DataTransfer();
        fileList.forEach(file => dataTransfer.items.add(file));
        const errors = await onFilesAdd(dataTransfer.files);
        if (errors.length > 0) {
          setValidationErrors(errors);
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onFilesAdd]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleRemoveFile = (id: string) => {
    onFileRemove(id);
    setValidationErrors([]);
  };

  const handleClear = () => {
    onClear();
    setValidationErrors([]);
  };

  return (
    <div className="w-full space-y-4">
      {/* 验证错误提示 */}
      {validationErrors.length > 0 && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <AlertDescription className="text-yellow-700">
            <p className="font-medium mb-1">以下文件未能添加：</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* 拖放区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 transition-all duration-200',
          'flex flex-col items-center justify-center gap-4',
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100',
          isProcessing && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          type="file"
          accept={accept}
          multiple
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isProcessing}
        />
        
        <div className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center transition-colors',
          isDragOver ? 'bg-blue-100' : 'bg-white'
        )}>
          <Upload className={cn(
            'w-8 h-8 transition-colors',
            isDragOver ? 'text-blue-500' : 'text-gray-400'
          )} />
        </div>
        
        <div className="text-center">
          <p className="text-lg font-medium text-gray-700">
            选择文件或 Ctrl+V 粘贴文件
          </p>
          <p className="text-sm text-gray-500 mt-1">
            拖放文件到此处 | 支持粘贴截图
          </p>
          <p className="text-xs text-gray-400 mt-2">
            支持的文件格式：PDF（同时最大 {maxFiles} 份，单个文件最大100MB）
          </p>
        </div>
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">
              已上传 {files.length} 个文件
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isProcessing}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <X className="w-4 h-4 mr-1" />
              清空
            </Button>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center justify-between px-4 py-3',
                  index !== files.length - 1 && 'border-b border-gray-100'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                      {file.pageCount && ` · ${file.pageCount} 页`}
                    </p>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(file.id)}
                  disabled={isProcessing}
                  className="flex-shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          
          {/* 进度条 */}
          {isProcessing && (
            <div className="px-4 py-3 bg-blue-50 border-t border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-700">处理中...</span>
                <span className="text-sm font-medium text-blue-700">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
