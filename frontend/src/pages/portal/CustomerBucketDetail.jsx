import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, Download, Trash2, Search, FolderOpen } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { formatBytes, formatDate } from '../../lib/format';
import { getFileIcon } from '../../lib/uiMaps';
import { toast } from 'sonner';

export default function CustomerBucketDetail() {
  const { id } = useParams();
  const [bucket, setBucket] = useState(null);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bucketRes, objectsRes] = await Promise.all([
        api.getBucket(id),
        api.getObjects(id, 'pageSize=200'),
      ]);
      setBucket(bucketRes);
      setObjects(objectsRes?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load bucket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of files) {
      try {
        await api.uploadObject(id, file, file.name);
        successCount++;
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`);
      fetchData();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (obj) => {
    try {
      const { blob, filename } = await api.downloadObject(id, obj.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || obj.key;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Download failed: ${err.message}`);
    }
  };

  const handleDelete = async (obj) => {
    try {
      await api.deleteObject(id, obj.id);
      toast.success('File deleted');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;

  const filteredObjects = objects.filter(o => !search || o.key.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={bucket?.name}
        subtitle={`${formatBytes(Number(bucket?.usedBytes || 0))} • ${bucket?.objectCount || 0} objects`}
        backTo="/portal/storage"
        titleIcon={FolderOpen}
        actions={
          <>
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary" disabled={uploading}>
              {uploading ? <span className="btn-spinner" /> : <Upload size={16} />}
              {uploading ? 'Uploading...' : 'Upload Files'}
            </button>
          </>
        }
      />

      {/* Dropzone (click, keyboard, or drag & drop) */}
      <div
        className={`dropzone mb-6 text-center ${dragOver ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dt = new DataTransfer();
          for (const f of e.dataTransfer.files) dt.items.add(f);
          if (fileInputRef.current) {
            fileInputRef.current.files = dt.files;
            handleUpload({ target: { files: dt.files } });
          }
        }}
      >
        <Upload size={32} className="mx-auto mb-2 text-cv-text-muted" />
        <p className="text-sm text-cv-text-secondary">Drag files here or click <strong>Upload Files</strong></p>
      </div>

      {/* Search */}
      {objects.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cv-text-muted" />
          <input
            type="text"
            className="form-input pl-9"
            placeholder="Search files..."
            aria-label="Search files"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* File Table */}
      {filteredObjects.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Type</th>
                <th>Uploaded</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredObjects.map((obj) => {
                const { Icon: FileIcon, colorClass } = getFileIcon(obj.contentType);
                return (
                  <tr key={obj.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileIcon size={16} className={colorClass} />
                        <span className="font-medium truncate max-w-xs">{obj.key}</span>
                      </div>
                    </td>
                    <td className="font-mono text-cv-text-secondary">{formatBytes(Number(obj.sizeBytes || 0))}</td>
                    <td className="text-cv-text-muted">{obj.contentType?.split('/').pop() || '—'}</td>
                    <td className="text-cv-text-muted">{formatDate(obj.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => handleDownload(obj)} className="icon-btn" aria-label={`Download ${obj.key}`}>
                          <Download size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(obj)} className="icon-btn icon-btn-danger" aria-label={`Delete ${obj.key}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : objects.length > 0 ? (
        <EmptyState icon={Search} message={`No files matching "${search}"`} compact />
      ) : (
        <EmptyState
          icon={Upload}
          title="Empty bucket"
          message="Upload your first file to get started"
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Delete file?"
        message={`Delete "${deleteTarget?.key}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
