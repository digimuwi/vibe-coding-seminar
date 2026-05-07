import { useRef, useState, useCallback } from 'react';
import styles from './FileUpload.module.css';

interface Props {
  onFile: (file: File) => void;
}

export default function FileUpload({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xml|musicxml|mxl)$/i)) {
      alert('Please upload a MusicXML file (.xml or .musicxml).');
      return;
    }
    onFile(file);
  }, [onFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      className={`${styles.dropzone} ${dragOver ? styles.over : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
    >
      <div className={styles.icon}>♩</div>
      <p className={styles.primary}>Drop a MusicXML file here</p>
      <p className={styles.secondary}>or click to browse (.xml, .musicxml)</p>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,.musicxml,.mxl"
        className={styles.hiddenInput}
        onChange={onInputChange}
        tabIndex={-1}
      />
    </div>
  );
}
