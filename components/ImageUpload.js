'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

export default function ImageUpload({
  onUpload,
  multiple = false,
  existingUrls = [],
  onRemove,
  folder = 'uploads',
  accept = 'image/*',
  maxSizeMB = 5,
  label,
}) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const uploadFile = useCallback(
    async (file) => {
      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        setError(`File too large. Max size: ${maxSizeMB}MB`);
        return null;
      }

      const ext = file.name.split('.').pop();
      const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const storageRef = ref(storage, filename);

      return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file);
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress((p) => ({ ...p, [file.name]: pct }));
          },
          (err) => {
            setError(err.message);
            reject(err);
          },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            setProgress((p) => {
              const updated = { ...p };
              delete updated[file.name];
              return updated;
            });
            resolve(url);
          }
        );
      });
    },
    [folder, maxSizeMB]
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
        }
      } catch (e) {
        setError('Upload failed. Please try again.');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [uploadFile, onUpload, multiple]
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
          ${dragging ? 'border-primary bg-primary/10' : 'border-white/10 bg-surface hover:border-primary/40 hover:bg-primary/5'}`}
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
            <p className="text-sm text-text-main font-medium">{t('common_drag_drop')}</p>
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
        <div className="flex items-center gap-2 text-error text-xs bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Preview grid */}
      {existingUrls && existingUrls.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {existingUrls.map((url, i) => (
            <div key={url + i} className="relative group aspect-square">
              <img
                src={url}
                alt={`Upload ${i + 1}`}
                className="w-full h-full object-cover rounded-lg border border-white/10"
              />
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(url, i); }}
                  className="absolute top-1 right-1 p-1 bg-dark/80 rounded-full text-error
                    opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error hover:text-white"
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
