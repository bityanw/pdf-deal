import { 
  Image, FileText, FileImage, Globe, Table, Type, 
  Combine, Scissors, FileOutput, Trash2, RotateCw, Minimize2,
  Unlock, Lock, Receipt, FileSpreadsheet, FileEdit,
  Droplet, Presentation,
  ArrowRight
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PDFTool } from '@/types/pdf';
import { cn } from '@/lib/utils';

interface PDFToolCardProps {
  tool: PDFTool;
  onClick?: (tool: PDFTool) => void;
}

const iconMap: Record<string, React.ElementType> = {
  Image,
  FileText,
  FileImage,
  Globe,
  Table,
  Type,
  Combine,
  Scissors,
  FileOutput,
  Trash2,
  RotateCw,
  Minimize2,
  Unlock,
  Lock,
  Receipt,
  FileSpreadsheet,
  FileEdit,
  Droplet,
  Presentation,
};

export function PDFToolCard({ tool, onClick }: PDFToolCardProps) {
  const Icon = iconMap[tool.icon] || FileText;
  
  // 判断是否是外部链接
  const isExternalLink = tool.href.startsWith('http') || tool.href.startsWith('/');
  
  const handleClick = () => {
    if (isExternalLink) {
      window.location.href = tool.href;
    } else {
      onClick?.(tool);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative bg-white rounded-xl border border-gray-200 p-4',
        'transition-all duration-200 cursor-pointer',
        'hover:shadow-lg hover:border-blue-300 hover:-translate-y-1'
      )}
    >
      {/* 标签 */}
      {(tool.isHot || tool.isNew) && (
        <div className="absolute -top-2 -right-2">
          {tool.isHot && (
            <Badge className="bg-red-500 text-white text-xs px-2 py-0.5">
              hot
            </Badge>
          )}
          {tool.isNew && !tool.isHot && (
            <Badge className="bg-green-500 text-white text-xs px-2 py-0.5">
              new
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
          'bg-gray-50 group-hover:bg-blue-50 transition-colors'
        )}>
          <Icon className={cn(
            'w-5 h-5 text-gray-500 group-hover:text-blue-500 transition-colors'
          )} />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors truncate">
            {tool.name}
          </h3>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {tool.description}
          </p>
        </div>

        {/* 箭头 */}
        <ArrowRight className={cn(
          'w-4 h-4 text-gray-300 flex-shrink-0',
          'group-hover:text-blue-500 group-hover:translate-x-1 transition-all'
        )} />
      </div>
    </div>
  );
}
