'use client';
import { useState, useRef, useCallback } from 'react';

export interface UploadedImage {
  id: string;
  file?: File;
  preview: string;
  name: string;
  size?: number;
}

interface Props {
  label?: string;
  hint?: string;
  maxImages?: number;
  circular?: boolean;
  onImagesChange: (files: UploadedImage[]) => void;
  existingImages?: UploadedImage[];
}

export default function ImageUpload({
  label = 'Upload Images',
  hint = 'PNG, JPG, WEBP up to 10MB each',
  maxImages = 5,
  circular = false,
  onImagesChange,
  existingImages = [],
}: Props) {
  const [images, setImages] = useState<UploadedImage[]>(existingImages);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setError('');
      const arr = Array.from(files);
      const remaining = maxImages - images.length;
      if (remaining <= 0) { setError(`Max ${maxImages} image${maxImages > 1 ? 's' : ''} allowed`); return; }
      const toAdd: UploadedImage[] = [];
      for (const f of arr.slice(0, remaining)) {
        if (!ALLOWED.includes(f.type)) { setError('Only JPG, PNG, WEBP allowed'); continue; }
        if (f.size > 10 * 1024 * 1024) { setError(`${f.name} exceeds 10MB`); continue; }
        const preview = await readFile(f);
        toAdd.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f, preview, name: f.name, size: f.size });
      }
      const updated = [...images, ...toAdd];
      setImages(updated);
      onImagesChange(updated);
    },
    [images, maxImages, onImagesChange]
  );

  const remove = (id: string) => {
    const updated = images.filter(i => i.id !== id);
    setImages(updated);
    onImagesChange(updated);
  };

  const move = (from: number, to: number) => {
    const updated = [...images];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setImages(updated);
    onImagesChange(updated);
  };

  const fmt = (b?: number) =>
    !b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${(b / 1024).toFixed(0)}KB`;

  // ── Circular / Profile Photo mode ────────────────────────────────────────
  if (circular) {
    const photo = images[0];
    return (
      <div className="flex flex-col items-center gap-3">
        <div onClick={() => inputRef.current?.click()} className="relative w-28 h-28 rounded-full cursor-pointer group">
          {photo ? (
            <>
              <img src={photo.preview} alt="Profile" className="w-28 h-28 rounded-full object-cover border-4 border-amber-400 shadow-lg" />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                <span className="text-white text-xs font-bold">Change</span>
              </div>
            </>
          ) : (
            <div className="w-28 h-28 rounded-full bg-stone-100 border-4 border-dashed border-stone-300 hover:border-amber-400 transition-all flex flex-col items-center justify-center group-hover:bg-amber-50">
              <span className="text-3xl mb-1">👤</span>
              <span className="text-xs text-stone-500 font-medium">Add Photo</span>
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-md border-2 border-white text-white text-xs">📷</div>
        </div>
        <p className="text-xs text-stone-500 text-center">{hint}</p>
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        {photo && (
          <button onClick={() => { setImages([]); onImagesChange([]); }} className="text-xs text-red-500 hover:text-red-700 underline">Remove photo</button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => e.target.files && processFiles(e.target.files)} />
      </div>
    );
  }

  // ── Multi-image grid mode ─────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-stone-700">{label}</label>
          <span className="text-xs text-stone-400">{images.length}/{maxImages}</span>
        </div>
      )}

      {images.length < maxImages && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragging ? 'border-amber-500 bg-amber-50 scale-[1.01]' : 'border-stone-300 hover:border-amber-400 hover:bg-amber-50/50'
          }`}
        >
          <div className="text-4xl mb-3">{dragging ? '📂' : '🖼️'}</div>
          <p className="font-semibold text-stone-700 text-sm mb-1">
            {dragging ? 'Drop images here' : 'Drag & drop images, or click to browse'}
          </p>
          <p className="text-xs text-stone-400">{hint}</p>
          <p className="text-xs text-amber-600 font-medium mt-1">
            {maxImages - images.length} more image{maxImages - images.length !== 1 ? 's' : ''} can be added
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {error}</p>}

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, idx) => (
            <div key={img.id} className="relative group rounded-xl overflow-hidden border border-stone-200 aspect-square bg-stone-100">
              <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
              {idx === 0 && (
                <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">Main</div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                {idx > 0 && (
                  <button onClick={() => move(idx, idx - 1)} title="Set as main" className="w-8 h-8 bg-white/20 hover:bg-amber-500 rounded-lg flex items-center justify-center text-white text-sm transition-all">←</button>
                )}
                <button onClick={() => remove(img.id)} className="w-8 h-8 bg-white/20 hover:bg-red-500 rounded-lg flex items-center justify-center text-white text-sm transition-all">🗑</button>
                {idx < images.length - 1 && (
                  <button onClick={() => move(idx, idx + 1)} className="w-8 h-8 bg-white/20 hover:bg-amber-500 rounded-lg flex items-center justify-center text-white text-sm transition-all">→</button>
                )}
              </div>
              <div className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">{fmt(img.size)}</div>
            </div>
          ))}
          {images.length < maxImages && (
            <button onClick={() => inputRef.current?.click()}
              className="aspect-square border-2 border-dashed border-stone-300 hover:border-amber-400 rounded-xl flex flex-col items-center justify-center gap-1 text-stone-400 hover:text-amber-600 transition-all hover:bg-amber-50 text-xs font-medium">
              <span className="text-2xl">+</span>Add more
            </button>
          )}
        </div>
      )}

      {images.length > 1 && (
        <p className="text-xs text-stone-400">💡 Hover to reorder. First image is the main product photo.</p>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={maxImages > 1} className="hidden"
        onChange={e => e.target.files && processFiles(e.target.files)} />
    </div>
  );
}
