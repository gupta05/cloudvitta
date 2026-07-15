import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Download, Trash2, File, Image, Film, FileText, Archive, Search, FolderOpen } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { toast } from 'sonner';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getFileIcon(contentType) {
  if (contentType?.startsWith('image/')) return { icon: Image, color: '#22c55e' };
  if (contentType?.startsWith('video/')) return { icon: Film, color: '#ef4444' };
  if (contentType?.startsWith('text/')) return { icon: FileText, color: '#3b82f6' };
  if (contentType?.includes('zip') || contentType?.includes('tar') || contentType?.includes('gzip')) return { icon: Archive, color: '#f59e0b' };
  return { icon: File, color: '#71717a' };
}

export default function CustomerBucketDetail() {
  const { id } = useParams();
  const [bucket, setBucket] = useState(null);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
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
    if (!confirm(`Delete "${obj.key}"?`)) return;
    try {
      await api.deleteObject(id, obj.id);
      toast.success('File deleted');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;

  const filteredObjects = objects.filter(o => !search || o.key.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/portal/storage" className="p-2 rounded-lg hover:bg-cv-surface-2 text-cv-text-muted hover:text-cv-text transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen size={20} className="text-cv-accent" />
              <h1 className="text-2xl font-bold text-cv-text">{bucket?.name}</h1>
            </div>
            <p className="text-cv-text-secondary text-sm mt-0.5">{formatBytes(Number(bucket?.usedBytes || 0))} • {bucket?.objectCount || 0} objects</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={handleUpload} multiple className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary" disabled={uploading}>
            <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
        </div>
      </div>

      {/* Dropzone */}
      <div
        className="dropzone mb-6 text-center"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('active'); }}
        onDragLeave={(e) => e.currentTarget.classList.remove('active')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('active');
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
                const { icon: FileIcon, color } = getFileIcon(obj.contentType);
                return (
                  <tr key={obj.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileIcon size={16} style={{ color }} />
                        <span className="font-medium truncate max-w-xs">{obj.key}</span>
                      </div>
                    </td>
                    <td className="font-mono text-cv-text-secondary">{formatBytes(Number(obj.sizeBytes || 0))}</td>
                    <td className="text-cv-text-muted">{obj.contentType?.split('/').pop() || '—'}</td>
                    <td className="text-cv-text-muted">{new Date(obj.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => handleDownload(obj)} className="p-1.5 rounded-md text-cv-text-muted hover:text-cv-primary hover:bg-cv-surface-3 transition-colors" title="Download">
                          <Download size={14} />
                        </button>
                        <button onClick={() => handleDelete(obj)} className="p-1.5 rounded-md text-cv-text-muted hover:text-cv-danger hover:bg-red-500/10 transition-colors" title="Delete">
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
        <div className="glass-card p-8 text-center text-cv-text-muted">
          <p className="text-sm">No files matching "{search}"</p>
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <Upload size={48} className="mx-auto mb-4 text-cv-text-muted opacity-30" />
          <h3 className="text-lg font-semibold text-cv-text mb-2">Empty bucket</h3>
          <p className="text-sm text-cv-text-muted">Upload your first file to get started</p>
        </div>
      )}
    </div>
  );
}
