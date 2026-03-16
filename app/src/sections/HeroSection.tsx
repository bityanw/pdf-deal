import { FileText, Zap, Shield, Clock } from 'lucide-react';

export function HeroSection() {
  const features = [
    { icon: Zap, text: '高效处理', desc: '秒级响应' },
    { icon: Shield, text: '安全可靠', desc: '本地处理' },
    { icon: Clock, text: '24小时服务', desc: '随时可用' },
    { icon: FileText, text: '格式丰富', desc: '多种输出' },
  ];

  return (
    <section className="bg-gradient-to-b from-blue-50 to-white py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          {/* 标题 */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            在线PDF电子发票合并批量打印
          </h1>
          
          {/* 描述 */}
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            电子发票怎么打印？如何让两张电子发票打印到一张A4纸上？
            如何将多份电子发票合成一份文档？PDF发票合并功能帮到你！
            功能支持批量上传电子发票，然后把多份电子发票合成单份PDF，不会丢失印章。
            节约纸张，保护环境，提高效率，方便处理保存，能省不少时间。
          </p>

          {/* 特性标签 */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-gray-600"
              >
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <feature.icon className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{feature.text}</p>
                  <p className="text-xs text-gray-400">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
