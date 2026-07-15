import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FolderOpen, Upload, Download, Trash2, File, FileText, FileImage, FileVideo, FileArchive, ChevronRight, ArrowLeft, Search, RefreshCw } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getFileIcon(contentType) {
  if (!contentType) return File;
  if (contentType.startsWith('image/')) return FileImage;
  if (contentType.startsWith('video/')) return FileVideo;
  if (contentType.startsWith('text/')) return FileText;
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gzip') || contentType.includes('compressed')) return FileArchive;
  return File;
}

function getFileColor(contentType) {
  if (!contentType) return '#6b7490';
  if (contentType.startsWith('image/')) return '#34d399';
  if (contentType.startsWith('video/')) return '#f87171';
  if (contentType.startsWith('text/')) return '#60a5fa';
  if (contentType.includes('zip') || contentType.includes('compressed')) return '#fbbf24';
  return '#6b7490';
}

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

  async function handleDelete(objectId, key) {
    if (!confirm(`Delete "${key}"?`)) return;
    try {
      await api.deleteObject(bucketId, objectId);
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

  if (!bucket && loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="animate-fade-in" onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/storage/buckets" className="p-2 rounded-lg hover:bg-cv-surface-2 text-cv-text-muted hover:text-cv-text transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen size={20} className="text-cv-accent" />
              <h1 className="text-2xl font-bold text-cv-text">{bucket?.name}</h1>
            </div>
            <p className="text-cv-text-secondary text-sm mt-0.5">
              {bucket?.customer?.name} • {formatBytes(bucket?.usedBytes || 0)} • {bucket?.objectCount?.toLocaleString()} objects
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadObjects} className="btn btn-secondary btn-sm" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <label className="btn btn-primary cursor-pointer">
            <Upload size={16} /> Upload Files
            <input type="file" multiple className="hidden" onChange={(e) => handleUpload(Array.from(e.target.files))} />
          </label>
        </div>
      </div>

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
        <div className="glass-card p-4 mb-4 flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" />
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
                const Icon = getFileIcon(obj.contentType);
                const color = getFileColor(obj.contentType);
                const filename = obj.key.split('/').pop();
                return (
                  <tr key={obj.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                          <Icon size={16} style={{ color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-cv-text truncate">{filename}</p>
                          {obj.key !== filename && <p className="text-xs text-cv-text-muted truncate">{obj.key}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs">{formatBytes(obj.sizeBytes)}</td>
                    <td className="text-xs text-cv-text-secondary">{obj.contentType}</td>
                    <td className="text-xs text-cv-text-muted">{new Date(obj.updatedAt).toLocaleString()}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleDownload(obj.id, obj.key)} className="p-1.5 rounded-lg hover:bg-cv-surface-2 text-cv-text-muted hover:text-cv-accent transition-colors" title="Download">
                          <Download size={14} />
                        </button>
                        <button onClick={() => handleDelete(obj.id, obj.key)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-cv-text-muted hover:text-cv-danger transition-colors" title="Delete">
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
    </div>
  );
}
