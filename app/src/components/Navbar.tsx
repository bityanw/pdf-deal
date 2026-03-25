import { useState } from 'react';
import { Menu, X, FileText, Table, Receipt, Droplets, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavbarProps {
  currentTool?: string;
  onToolChange?: (toolId: string) => void;
  onLogout?: () => void;
}

const navItems = [
  { id: 'home', name: '发票合并打印', icon: Receipt, href: 'index.html' },
  { id: 'tools', name: 'PDF行程单转Excel', icon: Table, href: 'itinerary-to-excel.html' },
  { id: 'watermark', name: 'PDF水印', icon: Droplets, href: 'watermark.html' },
];

export function Navbar({ currentTool, onLogout }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (href: string) => {
    window.location.href = href;
  };

  const handleLogout = () => {
    if (onLogout && confirm('确定要退出登录吗？')) {
      onLogout();
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="text-lg font-bold text-gray-900">PDF处理工具</span>
              <span className="text-xs text-gray-500 ml-2">在线PDF转换器</span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  'text-gray-600 hover:text-blue-600 hover:bg-blue-50',
                  currentTool === item.id && 'text-blue-600 bg-blue-50'
                )}
              >
                <item.icon className="w-4 h-4 mr-2" />
                {item.name}
              </Button>
            ))}
            {onLogout && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-2"
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <div className="space-y-2">
              {navItems.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    handleNavClick(item.href);
                    setMobileMenuOpen(false);
                  }}
                >
                  <item.icon className="w-4 h-4 mr-2" />
                  {item.name}
                </Button>
              ))}
              {onLogout && (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  退出登录
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
