import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { assetUrl } from '../../services/api';
import { MAX_PHOTOS, MAX_PHOTO_MB } from '../../lib/devices';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Photo chooser with previews. `existing` are already-uploaded photos ({url, publicId}) that can be marked for removal;
 * `files` are new File objects. The parent owns both lists so the form can submit them.
 */
export default function PhotoPicker({ existing = [], files, onFiles, removed = [], onRemoved, error }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [problem, setProblem] = useState('');
  const kept = existing.filter((p) => !removed.includes(p.publicId));
  const total = kept.length + files.length;

  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const add = (picked) => {
    const accepted = [];
    let msg = '';
    for (const f of picked) {
      if (!OK_TYPES.includes(f.type)) msg = `“${f.name}” is not a JPEG, PNG or WebP image.`;
      else if (f.size > MAX_PHOTO_MB * 1024 * 1024) msg = `“${f.name}” is larger than ${MAX_PHOTO_MB} MB.`;
      else if (total + accepted.length >= MAX_PHOTOS) msg = `You can add up to ${MAX_PHOTOS} photos.`;
      else accepted.push(f);
    }
    setProblem(msg);
    if (accepted.length) onFiles([...files, ...accepted]);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add([...e.dataTransfer.files]);
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-secondary-strong bg-primary/10' : 'border-black/15 dark:border-white/20'}`}
      >
        <ImagePlus aria-hidden className="mx-auto text-primary dark:text-primary-tint" size={32} />
        <p className="mt-2 text-sm text-ink dark:text-white">Drag photos here or</p>
        <input
          ref={input}
          type="file"
          multiple
          accept={OK_TYPES.join(',')}
          className="hidden"
          aria-label="Choose device photos"
          data-testid="photo-input"
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn-glass mt-2" onClick={() => input.current?.click()} disabled={total >= MAX_PHOTOS}>Choose photos</button>
        <p className="mt-2 text-xs text-ink-muted dark:text-[#9FB2A7]">JPEG, PNG or WebP · up to {MAX_PHOTOS} photos · {MAX_PHOTO_MB} MB each · {total}/{MAX_PHOTOS} added</p>
      </div>
      {(problem || error) && <p role="alert" className="mt-2 text-xs font-medium text-danger dark:text-red-300">{problem || error}</p>}

      {(kept.length > 0 || previews.length > 0) && (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Selected photos">
          {kept.map((p) => (
            <li key={p.publicId} className="relative aspect-square overflow-hidden rounded-xl">
              <img src={assetUrl(p.url)} alt="Uploaded photo" className="h-full w-full object-cover" />
              <button type="button" aria-label="Remove uploaded photo" onClick={() => onRemoved([...removed, p.publicId])} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white">
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
          {previews.map(({ file, url }, i) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-xl">
              <img src={url} alt={`Preview of ${file.name}`} className="h-full w-full object-cover" />
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white">
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
