import { useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { formatBytes } from '../utils/format';

interface UploadDropzoneProps {
  accept: string;
  /** 最大字节数（超出报错） */
  maxSize?: number;
  file: File | null;
  onFile: (file: File | null) => void;
  hint?: ReactNode;
  title: string;
  disabled?: boolean;
  /** 预览图（例如自动截取的封面） */
  previewUrl?: string | null;
  /** 是否显示文件大小信息 */
  compact?: boolean;
}

export default function UploadDropzone({
  accept,
  maxSize,
  file,
  onFile,
  hint,
  title,
  disabled = false,
  previewUrl,
  compact = false,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = (f: File | null | undefined) => {
    setLocalError(null);
    if (!f) return;
    if (maxSize && f.size > maxSize) {
      setLocalError(`文件过大（${formatBytes(f.size)}），最大允许 ${formatBytes(maxSize)}`);
      return;
    }
    onFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 transition ${
          dragging
            ? 'border-rose-500 bg-rose-500/10'
            : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-900/80'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${compact ? 'py-5' : 'py-10'}`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="预览" className="h-28 rounded-lg object-contain" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          </div>
        )}
        <div className="text-sm font-medium text-zinc-200">{file ? file.name : title}</div>
        {file ? (
          <div className="text-xs text-zinc-500">{formatBytes(file.size)}</div>
        ) : (
          <div className="text-xs text-zinc-500">点击选择或拖拽文件到此处</div>
        )}
        {hint ? <div className="max-w-xs text-center text-xs text-zinc-600">{hint}</div> : null}
      </div>

      {localError && <p className="mt-2 text-xs text-rose-400">{localError}</p>}

      {file && !disabled && (
        <button
          type="button"
          onClick={() => onFile(null)}
          className="mt-2 text-xs text-zinc-500 underline-offset-2 transition hover:text-rose-400 hover:underline"
        >
          移除文件
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
