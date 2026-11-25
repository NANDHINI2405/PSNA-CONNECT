import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, Plus, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Audience, CampusDocument, canAccessScreen } from '../types';
import { buildPdfDataUrl } from '../utils/pdfGenerator';

export function PdfViewerView() {
  const { currentUser, state, uploadDocument } = useApp();
  const [audienceFilter, setAudienceFilter] = useState<'Relevant' | Audience>('Relevant');
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'pdf' | 'text'>('pdf');
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'Notes' | 'Circular'>('Notes');
  const [audience, setAudience] = useState<Audience>('Students');
  const [summary, setSummary] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pdfDataUrl, setPdfDataUrl] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!currentUser || !canAccessScreen(currentUser, 'documents')) return null;

  const canUpload = currentUser.role === 'staff' || currentUser.role === 'management';

  const isAudienceAllowed = (aud: Audience) => {
    if (currentUser.role === 'management') return true;
    if (aud === 'All') return true;
    if (aud === 'Students' && currentUser.role === 'student') return true;
    if (aud === 'Staff' && currentUser.role === 'staff') return true;
    if (aud === 'Hostel' && (currentUser.isHostel || currentUser.isWarden)) return true;
    return false;
  };

  const filteredDocs = useMemo(() => {
    return state.documents.filter((d) => {
      if (!isAudienceAllowed(d.audience)) return false;
      if (audienceFilter === 'Relevant') return true;
      return d.audience === audienceFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.documents, audienceFilter, currentUser]);

  const activeDoc: CampusDocument | null =
    filteredDocs.find((d) => d.id === selectedDocId) || filteredDocs[0] || null;

  // Convert data URL (or reconstruct PDF if loaded from Firestore without data URL) to Blob URL for <iframe>
  const [blobUrl, setBlobUrl] = useState<string>('');
  useEffect(() => {
    if (!activeDoc) {
      setBlobUrl('');
      return;
    }
    const sourceDataUrl =
      activeDoc.pdfDataUrl ||
      buildPdfDataUrl(
        activeDoc.title,
        `${activeDoc.department} · ${activeDoc.category} · Audience: ${activeDoc.audience}`,
        activeDoc.sections && activeDoc.sections.length > 0
          ? activeDoc.sections
          : [activeDoc.summary]
      );

    try {
      const base64 = sourceDataUrl.split(',')[1];
      if (!base64) {
        setBlobUrl(sourceDataUrl);
        return;
      }
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setBlobUrl('');
    }
  }, [activeDoc]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Please choose a valid .pdf file.');
      return;
    }
    if (file.size > 500 * 1024) {
      setUploadError('PDF file exceeds 500 KB limit for in-browser storage.');
      return;
    }
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.pdf$/i, ''));
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPdfDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!title.trim()) return;
    const sections = bodyText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const finalPdf =
      pdfDataUrl ||
      buildPdfDataUrl(
        title.trim(),
        `${currentUser.department} · ${category} · Audience: ${audience}`,
        sections.length > 0 ? sections : [summary.trim() || 'Official PSNA document.']
      );

    await uploadDocument({
      title: title.trim(),
      category,
      audience,
      department: currentUser.department,
      fileName: fileName || `${title.trim().replace(/\s+/g, '_')}.pdf`,
      summary: summary.trim() || sections[0] || 'Uploaded campus document.',
      sections,
      pdfDataUrl: finalPdf,
    });

    setTitle('');
    setSummary('');
    setBodyText('');
    setFileName('');
    setPdfDataUrl('');
    setShowUpload(false);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">PDF Viewer · Notes & Circulars</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Read official circulars and lecture notes directly inside PSNA Connect
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canUpload && (
            <button
              type="button"
              onClick={() => setShowUpload((v) => !v)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Upload PDF / Note</span>
            </button>
          )}
        </div>
      </section>

      {showUpload && (
        <form
          onSubmit={handleUploadSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900">Upload PDF Notes or Circular</h3>
          {uploadError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
              {uploadError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Document Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. CS3402 Operating Systems Lab Manual"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as 'Notes' | 'Circular')}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="Notes">Notes</option>
                  <option value="Circular">Circular</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Audience</label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="All">All</option>
                  <option value="Students">Students</option>
                  <option value="Staff">Staff</option>
                  <option value="Hostel">Hostel</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Attach PDF File (optional, up to 500 KB)
              </label>
              <label className="min-h-[44px] px-4 py-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm text-slate-700 flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-blue-600" />
                <span className="truncate">{fileName || 'Choose .pdf file (or auto-generate from text)'}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFilePick}
                  className="hidden"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Summary</label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief one-line overview"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Document Content (used for PDF generation & text reader)
            </label>
            <textarea
              rows={3}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Enter paragraphs or guidelines (one per line)..."
              className="w-full p-3.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Publish Document
            </button>
          </div>
        </form>
      )}

      {/* Split Document List & In-App PDF Viewer */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl">
            {(['Relevant', 'All', 'Students', 'Staff', 'Hostel'] as const).map((aud) => (
              <button
                key={aud}
                type="button"
                onClick={() => setAudienceFilter(aud)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium ${
                  audienceFilter === aud
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {aud === 'Relevant' ? 'For Me' : aud}
              </button>
            ))}
          </div>

          {filteredDocs.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No documents available.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredDocs.map((docItem) => {
                const active = activeDoc?.id === docItem.id;
                return (
                  <button
                    key={docItem.id}
                    type="button"
                    onClick={() => setSelectedDocId(docItem.id)}
                    className={`w-full py-3.5 px-3 rounded-xl text-left transition-colors ${
                      active ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-medium text-blue-700">
                      {docItem.category} · {docItem.audience} ·{' '}
                      <span className="tabular-nums">{docItem.uploadedAt}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">
                      {docItem.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {docItem.summary}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col space-y-4">
          {!activeDoc ? (
            <div className="py-16 text-center text-slate-500">
              <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Select a document from the list to view it here.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">
                    {activeDoc.department} · Uploaded by {activeDoc.uploadedByName}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
                    {activeDoc.title}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setViewMode('pdf')}
                      className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${
                        viewMode === 'pdf' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>PDF Frame</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('text')}
                      className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium ${
                        viewMode === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      Reader View
                    </button>
                  </div>
                  {blobUrl && (
                    <a
                      href={blobUrl}
                      download={activeDoc.fileName || 'document.pdf'}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  )}
                </div>
              </div>

              {viewMode === 'pdf' && blobUrl ? (
                <iframe
                  title={activeDoc.title}
                  src={blobUrl}
                  className="w-full h-[500px] rounded-xl border border-slate-200 bg-slate-100"
                />
              ) : (
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    PSNA College of Engineering and Technology · {activeDoc.category}
                  </div>
                  <p className="text-sm font-medium text-slate-800">{activeDoc.summary}</p>
                  {activeDoc.sections && activeDoc.sections.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      {activeDoc.sections.map((sec, i) => (
                        <p key={i} className="text-sm text-slate-700 leading-relaxed">
                          {sec}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
