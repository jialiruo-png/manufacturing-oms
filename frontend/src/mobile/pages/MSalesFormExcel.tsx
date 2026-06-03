import { useRef, useState } from 'react';
import { Drawer, message } from 'antd';
import { CloudUploadOutlined, FileExcelOutlined, LoadingOutlined, PictureOutlined } from '@ant-design/icons';
import { excelApi } from '../../api';
import type { ParsedExcelItem } from '../../api';

type ExcelPreviewResult = {
  contractInfo: Record<string, string>;
  previewHash: string;
  rows: Record<string, string>[];
  items: ParsedExcelItem[];
  totalRows: number;
  sheetName: string;
  diagnostics: {
    parser: string;
    canImport: boolean;
    missingRequiredFields: string[];
    warnings: string[];
  };
};

interface MSalesFormExcelProps {
  open: boolean;
  onClose: () => void;
  onApply: (data: { contractRef?: string; deliveryDate?: string; customerName?: string; items: ParsedExcelItem[]; previewHash?: string }) => void;
}

export default function MSalesFormExcel({ open, onClose, onApply }: MSalesFormExcelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState<'preview' | 'ai' | 'image' | null>(null);
  const [result, setResult] = useState<ExcelPreviewResult | null>(null);

  const handleFile = async (mode: 'preview' | 'ai', file: File) => {
    setLoading(mode);
    try {
      const res = mode === 'ai' ? await excelApi.aiParse(file) : await excelApi.preview(file);
      setResult(res);
      message.success(mode === 'ai' ? 'AI 解析完成' : '解析完成');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || (mode === 'ai' ? 'AI 解析失败' : '解析失败'));
    } finally {
      setLoading(null);
    }
  };

  const handleImage = async (file: File) => {
    setLoading('image');
    try {
      const res = await excelApi.aiParseImage(file);
      setResult(res);
      message.success('图片识别完成');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || '图片识别失败');
    } finally {
      setLoading(null);
    }
  };

  const handleApply = () => {
    if (!result || !result.items?.length) {
      message.warning('暂无可应用的明细');
      return;
    }
    onApply({
      contractRef: result.contractInfo?.contractNo || undefined,
      deliveryDate: result.contractInfo?.deliveryDate || undefined,
      customerName: result.contractInfo?.customerName || undefined,
      items: result.items,
      previewHash: result.previewHash,
    });
    onClose();
    setResult(null);
  };

  return (
    <Drawer
      title="Excel / 图片 智能解析"
      placement="bottom"
      height="86%"
      open={open}
      onClose={() => { onClose(); setResult(null); }}
      styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile('preview', f);
          e.target.value = '';
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImage(f);
          e.target.value = '';
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <button
          type="button"
          className="m-btn"
          onClick={() => fileRef.current?.click()}
          disabled={loading !== null}
          style={{ width: '100%' }}
        >
          {loading === 'preview' ? <><LoadingOutlined spin /> 解析中…</> : <><FileExcelOutlined /> 上传 Excel（正则解析）</>}
        </button>
        <button
          type="button"
          className="m-ai-btn"
          onClick={async () => {
            // 用同一文件输入，但模式切到 ai。简单做法：复用 fileRef，先弹原生选择
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.xls,.csv';
            input.onchange = () => {
              const f = input.files?.[0];
              if (f) void handleFile('ai', f);
            };
            input.click();
          }}
          disabled={loading !== null}
          style={{ width: '100%' }}
        >
          {loading === 'ai' ? <><LoadingOutlined spin /> AI 解析中…</> : <><CloudUploadOutlined /> AI 智能解析（推荐）</>}
        </button>
        <button
          type="button"
          className="m-ai-btn"
          onClick={() => imageRef.current?.click()}
          disabled={loading !== null}
          style={{ width: '100%' }}
        >
          {loading === 'image' ? <><LoadingOutlined spin /> 图片识别中…</> : <><PictureOutlined /> 上传订单图片（AI 识别）</>}
        </button>
      </div>

      {result && (
        <>
          {result.contractInfo && (
            <div className="m-card">
              <div className="m-card-title" style={{ fontSize: 14 }}>解析到的合同信息</div>
              <div className="m-card-divider" />
              <div className="m-card-row"><span className="m-card-label">合同号</span><span className="m-card-value">{result.contractInfo.contractNo || '—'}</span></div>
              <div className="m-card-row"><span className="m-card-label">客户</span><span className="m-card-value">{result.contractInfo.customerName || '—'}</span></div>
              <div className="m-card-row"><span className="m-card-label">交期</span><span className="m-card-value">{result.contractInfo.deliveryDate || '—'}</span></div>
            </div>
          )}

          <div className="m-section-head"><span className="m-section-head-title">产品明细 ({result.items?.length ?? 0} 项)</span></div>
          {(!result.items || result.items.length === 0) ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>未识别出明细</div>
          ) : (
            result.items.map((item, i) => (
              <div key={i} className="m-card">
                <div className="m-card-header"><div className="m-card-title" style={{ fontSize: 14 }}>{item.productName || '产品未识别'}</div></div>
                <div className="m-card-row"><span className="m-card-label">规格</span><span className="m-card-value">{item.spec || '—'}</span></div>
                <div className="m-card-row"><span className="m-card-label">数量</span><span className="m-card-value m-num">{item.quantity ?? '—'} {item.unit || ''}</span></div>
                <div className="m-card-row"><span className="m-card-label">单价</span><span className="m-card-value m-num">{item.unitPrice ?? '—'}</span></div>
              </div>
            ))
          )}

          {result.diagnostics?.warnings && result.diagnostics.warnings.length > 0 && (
            <div className="m-card" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 12, color: '#92400e' }}>
                {result.diagnostics.warnings.map((d, i) => <div key={i}>· {d}</div>)}
              </div>
            </div>
          )}
          {result.diagnostics?.missingRequiredFields && result.diagnostics.missingRequiredFields.length > 0 && (
            <div className="m-card" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 12, color: '#b91c1c' }}>
                缺少字段：{result.diagnostics.missingRequiredFields.join(', ')}
              </div>
            </div>
          )}

          <button
            type="button"
            className="m-btn m-btn-primary"
            onClick={handleApply}
            style={{ width: '100%', marginTop: 16 }}
            disabled={!result.items?.length}
          >
            应用到订单（{result.items?.length ?? 0} 项）
          </button>
        </>
      )}
    </Drawer>
  );
}
