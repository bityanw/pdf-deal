import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ItineraryToExcelPage } from './pages/ItineraryToExcelPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ItineraryToExcelPage />
  </StrictMode>
);
