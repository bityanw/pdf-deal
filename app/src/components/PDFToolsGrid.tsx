import { PDFToolCard } from './PDFToolCard';
import { pdfTools, toolCategories } from '@/data/pdfTools';
import type { PDFTool } from '@/types/pdf';

interface PDFToolsGridProps {
  onToolClick?: (tool: PDFTool) => void;
  filterCategory?: string;
}

export function PDFToolsGrid({ onToolClick, filterCategory }: PDFToolsGridProps) {
  const groupedTools = toolCategories.map(category => ({
    ...category,
    tools: pdfTools.filter(tool => 
      tool.category === category.id &&
      (!filterCategory || tool.category === filterCategory)
    ),
  })).filter(group => group.tools.length > 0);

  return (
    <div className="space-y-8">
      {groupedTools.map(category => (
        <div key={category.id} className="space-y-4">
          {/* 分类标题 */}
          <div className="flex items-center gap-3">
            <div className={`w-1 h-5 ${category.color} rounded-full`} />
            <h2 className="text-lg font-semibold text-gray-800">
              {category.name}
            </h2>
          </div>

          {/* 工具网格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {category.tools.map(tool => (
              <PDFToolCard
                key={tool.id}
                tool={tool}
                onClick={onToolClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
