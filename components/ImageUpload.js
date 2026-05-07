'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────
// Defensive URL cleaner. getDownloadURL() always returns a clean string,
// but if any layer in the upload pipeline ever wraps it in quotes (an old
// bug we've seen), this strips them. Belt-and-suspenders against the
// "Preparing textures… 0%" bug seen in the mobile AR app.
// ─────────────────────────────────────────────────────────────────────────
function cleanUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']+|["']+$/g, '');
}

// CHANGED: Validate the file is actually an image (or matches the accept type).
function isAcceptableFile(file, acceptPattern) {
  if (!file || !file.type) return false;
  // Accept patterns can be 'image/*', 'image/png,image/jpeg', or specific MIME
  if (acceptPattern === 'image/*') {
    return file.type.startsWith('image/');
  }
  const tokens = acceptPattern.split(',').map((s) => s.trim());
  for (const tok of tokens) {
    if (tok.endsWith('/*')) {
      const prefix = tok.slice(0, -1); // 'image/'
      if (file.type.startsWith(prefix)) return true;
    } else if (tok === file.type) {
      return true;
    }
  }
  return false;
}

export default function ImageUpload({
  onUpload,
  multiple = false,
  existingUrls = [],
  onRemove,
  folder = 'uploads',
  accept = 'image/*',
  maxSizeMB = 5,
  label,
  // CHANGED: optional flag to suppress toast (parent may show its own feedback)
  showToast = true,
}) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const uploadFile = useCallback(
    async (file) => {
      // CHANGED: MIME validation before we touch Firebase
      if (!isAcceptableFile(file, accept)) {
        const msg = `"${file.name}" is not an accepted file type. Allowed: ${accept}`;
        setError(msg);
        return null;
      }

      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        const msg = `"${file.name}" is too large (max ${maxSizeMB}MB)`;
        setError(msg);
        return null;
      }

      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'bin';
      const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;
      const storageRef = ref(storage, filename);

      return new Promise((resolve) => {
        const task = uploadBytesResumable(storageRef, file);
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress((p) => ({ ...p, [file.name]: pct }));
          },
          (err) => {
            // CHANGED: more informative error + always clean up progress entry
            const msg = `Upload failed for "${file.name}": ${err?.message || err?.code || 'unknown error'}`;
            setError(msg);
            setProgress((p) => {
              const updated = { ...p };
              delete updated[file.name];
              return updated;
            });
            resolve(null);
          },
          async () => {
            try {
              const rawUrl = await getDownloadURL(task.snapshot.ref);
              // CHANGED: Clean the URL before it leaves this component.
              // This is the single chokepoint — every URL the parent receives
              // is guaranteed quote-free.
              const url = cleanUrl(rawUrl);
              setProgress((p) => {
                const updated = { ...p };
                delete updated[file.name];
                return updated;
              });
              if (!url) {
                setError(`"${file.name}" uploaded but URL was empty`);
                resolve(null);
                return;
              }
              resolve(url);
            } catch (e) {
              setError(`Could not retrieve URL for "${file.name}"`);
              setProgress((p) => {
                const updated = { ...p };
                delete updated[file.name];
                return updated;
              });
              resolve(null);
            }
          }
        );
      });
    },
    [folder, maxSizeMB, accept]
  );

  const handleFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return;
      setError('');
      setUploading(true);
      try {
        const urls = [];
        for (const file of Array.from(files)) {
          const url = await uploadFile(file);
          if (url) urls.push(url);
        }
        if (urls.length > 0) {
          onUpload(multiple ? urls : urls[0]);
          if (showToast) {
            toast.success(
              urls.length === 1
                ? 'Image uploaded'
                : `${urls.length} images uploaded`,
              { duration: 1800 }
            );
          }
        }
      } catch (e) {
        setError(e?.message || 'Upload failed. Please try again.');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [uploadFile, onUpload, multiple, showToast]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const activeUploads = Object.keys(progress);

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-medium text-text-main">{label}</label>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200
          ${dragging ? 'border-primary bg-primary/10' : 'border-white/10 bg-surface hover:border-primary/40 hover:bg-primary/5'}
          ${uploading ? 'pointer-events-none opacity-70' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <div className={`p-3 rounded-full ${dragging ? 'bg-primary/20' : 'bg-white/5'}`}>
            <Upload size={20} className={dragging ? 'text-primary' : 'text-subtext'} />
          </div>
          <div>
            <p className="text-sm text-text-main font-medium">
              {uploading ? 'Uploading…' : t('common_drag_drop')}
            </p>
            <p className="text-xs text-subtext mt-1">
              {accept === 'image/*' ? 'PNG, JPG, WEBP' : accept} · Max {maxSizeMB}MB
            </p>
          </div>
        </div>
      </div>

      {/* Upload progress */}
      {activeUploads.length > 0 && (
        <div className="space-y-2">
          {activeUploads.map((name) => (
            <div key={name}>
              <div className="flex justify-between text-xs text-subtext mb-1">
                <span className="truncate max-w-[200px]">{name}</span>
                <span>{progress[name]}%</span>
              </div>
              <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-200"
                  style={{ width: `${progress[name]}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-error text-xs bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setError(''); }}
            className="text-error hover:text-error/70 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Preview grid */}
      {existingUrls && existingUrls.length > 0 && (
        <div
          className="grid grid-cols-3 sm:grid-cols-4 gap-2"
          // CHANGED: stop click bubbling so clicking a preview doesn't open file picker
          onClick={(e) => e.stopPropagation()}
        >
          {existingUrls.map((url, i) => (
            <div key={url + i} className="relative group aspect-square">
              <img
                src={url}
                alt={`Upload ${i + 1}`}
                className="w-full h-full object-cover rounded-lg border border-white/10"
                onError={(e) => {
                  // CHANGED: visible broken-image fallback
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden absolute inset-0 bg-surface border border-error/30 rounded-lg flex items-center justify-center text-error text-xs">
                <AlertCircle size={16} />
              </div>
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(url, i); }}
                  className="absolute top-1 right-1 p-1 bg-dark/80 rounded-full text-error
                    opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error hover:text-white"
                  aria-label="Remove image"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
