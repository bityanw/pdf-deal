// 声明xlsx模块
declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [key: string]: WorkSheet };
  }
  
  export interface WorkSheet {
    [key: string]: any;
  }
  
  export interface WritingOptions {
    bookType?: 'xlsx' | 'xlsm' | 'xlsb' | 'xls' | 'csv' | 'txt' | 'html';
    type?: 'base64' | 'binary' | 'buffer' | 'file' | 'array';
  }
  
  export function utils_book_new(): WorkBook;
  export function utils_aoa_to_sheet(data: any[][]): WorkSheet;
  export function utils_sheet_add_json(ws: WorkSheet, data: any[], opts?: any): void;
  export function book_append_sheet(wb: WorkBook, ws: WorkSheet, name: string): void;
  export function write(wb: WorkBook, opts: WritingOptions): any;
  
  export const utils: {
    book_new: typeof utils_book_new;
    aoa_to_sheet: typeof utils_aoa_to_sheet;
    sheet_add_json: typeof utils_sheet_add_json;
  };
  
  export function writeFile(wb: WorkBook, filename: string): void;
}

// 声明pdfjs-dist模块
declare module 'pdfjs-dist' {
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }
  
  export interface PDFPageProxy {
    getTextContent(): Promise<TextContent>;
  }
  
  export interface TextContent {
    items: TextItem[];
  }
  
  export interface TextItem {
    str: string;
    dir: string;
    width: number;
    height: number;
    transform: number[];
    fontName: string;
    hasEOL: boolean;
  }
  
  export interface GetDocumentParams {
    data: ArrayBuffer;
    cMapUrl?: string;
    cMapPacked?: boolean;
  }
  
  export function getDocument(params: GetDocumentParams | { data: ArrayBuffer }): { promise: Promise<PDFDocumentProxy> };
  
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };
  
  export const version: string;
}

// 声明全局window.XLSX
declare global {
  interface Window {
    XLSX: typeof import('xlsx');
  }
}

export {};
