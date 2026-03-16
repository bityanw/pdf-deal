import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PDFWatermarkPage } from './pages/PDFWatermarkPage';
import './index.css';

// 加载PDF.js库
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
script.async = true;
document.head.appendChild(script);

// 加载XLSX库
const xlsxScript = document.createElement('script');
xlsxScript.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
xlsxScript.async = true;
document.head.appendChild(xlsxScript);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PDFWatermarkPage />
  </StrictMode>
);
