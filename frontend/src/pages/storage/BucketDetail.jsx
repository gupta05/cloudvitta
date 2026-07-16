import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FolderOpen, Upload, Download, Trash2, ChevronRight, Search, RefreshCw } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatBytes, formatDate } from '../../lib/format';
import { getFileIcon } from '../../lib/uiMaps';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PageHeader from '../../components/ui/PageHeader';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function BucketDetail() {
  const { id: bucketId } = useParams();
  const [bucket, setBucket] = useState(null);
  const [objects, setObjects] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [prefix, setPrefix] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadBucket();
  }, [bucketId]);

  useEffect(() => {
    loadObjects();
  }, [bucketId, prefix]);

  async function loadBucket() {
    try {
      const data = await api.getBucket(bucketId);
      setBucket(data);
    } catch (err) {
      toast.error('Failed to load bucket');
    }
  }

  async function loadObjects() {
    setLoading(true);
    try {
      const params = prefix ? `prefix=${encodeURIComponent(prefix)}` : '';
      const data = await api.getObjects(bucketId, params);
      setObjects(data.data || []);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      toast.error('Failed to load objects');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let uploaded = 0;

    for (const file of files) {
      try {
        setUploadProgress({ name: file.name, current: uploaded + 1, total: files.length });
        const key = prefix ? `${prefix}${file.name}` : file.name;
        await api.uploadObject(bucketId, file, key);
        uploaded++;
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    }

    if (uploaded > 0) {
      toast.success(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''}`);
      loadObjects();
      loadBucket();
    }
    setUploading(false);
    setUploadProgress(null);
  }

  async function handleDownload(objectId, key) {
    try {
      const { blob, filename } = await api.downloadObject(bucketId, objectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || key.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (err) {
      toast.error('Download failed');
    }
  }

  async function handleDelete(obj) {
    try {
      await api.deleteObject(bucketId, obj.id);
      toast.success('Object deleted');
      loadObjects();
      loadBucket();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length > 0) handleUpload(Array.from(files));
  }, [bucketId, prefix]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  // Build breadcrumb from prefix
  const breadcrumbs = prefix ? prefix.split('/').filter(Boolean) : [];

  if (!bucket && loading) return <LoadingSpinner />;

  return (
    <div className="animate-fade-in" onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      {/* Header */}
      <PageHeader
        title={bucket?.name}
        titleIcon={FolderOpen}
        subtitle={`${bucket?.customer?.name} • ${formatBytes(bucket?.usedBytes || 0)} • ${bucket?.objectCount?.toLocaleString()} objects`}
        backTo="/storage/buckets"
        actions={
          <>
            <button onClick={loadObjects} className="btn btn-secondary btn-sm" aria-label="Refresh objects">
              <RefreshCw size={14} />
            </button>
            <label className="btn btn-primary cursor-pointer">
              <Upload size={16} /> Upload Files
              <input type="file" multiple className="hidden" onChange={(e) => handleUpload(Array.from(e.target.files))} />
            </label>
          </>
        }
      />

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-4 text-sm">
        <button onClick={() => setPrefix('')} className="text-cv-primary hover:text-cv-primary-hover font-medium">
          {bucket?.name}
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-cv-text-muted" />
            <button
              onClick={() => setPrefix(breadcrumbs.slice(0, i + 1).join('/') + '/')}
              className={i === breadcrumbs.length - 1 ? 'text-cv-text' : 'text-cv-primary hover:text-cv-primary-hover font-medium'}
            >
              {crumb}
            </button>
          </span>
        ))}
      </div>

      {/* Search / Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cv-text-muted" />
          <input
            type="text"
            className="form-input pl-9"
            placeholder="Filter by key prefix..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setPrefix(searchInput)}
            aria-label="Filter objects by key prefix"
          />
        </div>
        <span className="text-xs text-cv-text-muted">{totalCount} objects</span>
      </div>

      {/* Drop zone overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-40 bg-cv-primary/10 border-4 border-dashed border-cv-primary/50 flex items-center justify-center pointer-events-none">
          <div className="glass-card p-8 text-center">
            <Upload size={48} className="mx-auto mb-3 text-cv-primary" />
            <p className="text-lg font-bold text-cv-text">Drop files to upload</p>
            <p className="text-sm text-cv-text-secondary mt-1">Files will be uploaded to {prefix || 'root'}</p>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress && (
        <div className="glass-card p-4 mb-4 flex items-center gap-3" role="status">
          <div className="w-6 h-6 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm text-cv-text">Uploading {uploadProgress.name}...</p>
            <p className="text-xs text-cv-text-muted">{uploadProgress.current} of {uploadProgress.total}</p>
          </div>
        </div>
      )}

      {/* Objects Table */}
      <div className="glass-card overflow-hidden">
        {objects.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Size</th>
                <th>Type</th>
                <th>Last Modified</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {objects.map((obj) => {
                const { Icon, colorClass } = getFileIcon(obj.contentType);
                const filename = obj.key.split('/').pop();
                return (
                  <tr key={obj.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-cv-surface-3 border border-cv-border">
                          <Icon size={16} className={colorClass} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-cv-text truncate">{filename}</p>
                          {obj.key !== filename && <p className="text-xs text-cv-text-muted truncate">{obj.key}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs">{formatBytes(obj.sizeBytes)}</td>
                    <td className="text-xs text-cv-text-secondary">{obj.contentType}</td>
                    <td className="text-xs text-cv-text-muted">{formatDate(obj.updatedAt, 'datetime')}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleDownload(obj.id, obj.key)} className="icon-btn" aria-label={`Download ${filename}`}>
                          <Download size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(obj)} className="icon-btn icon-btn-danger" aria-label={`Delete ${filename}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center">
            <div className={`dropzone mx-auto max-w-md ${dragOver ? 'active' : ''}`}>
              <Upload size={40} className="mx-auto mb-3 text-cv-text-muted opacity-40" />
              <p className="text-cv-text-secondary mb-1">No objects in this bucket</p>
              <p className="text-cv-text-muted text-sm mb-4">Drag and drop files or click to upload</p>
              <label className="btn btn-primary cursor-pointer">
                <Upload size={16} /> Choose Files
                <input type="file" multiple className="hidden" onChange={(e) => handleUpload(Array.from(e.target.files))} />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Delete object?"
        message={`Delete "${deleteTarget?.key}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
