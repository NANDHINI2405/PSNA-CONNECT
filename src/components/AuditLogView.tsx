import React, { useMemo, useState } from 'react';
import { ClipboardList, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AuditCategory } from '../types';

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  role_change: 'Role Change',
  medical_record: 'Medical Record',
  personal_record: 'Personal Record',
  account_status: 'Account Status',
};

function categoryBadgeStyle(category: AuditCategory): string {
  switch (category) {
    case 'role_change':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'medical_record':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'personal_record':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'account_status':
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function AuditLogView() {
  const { currentUser, state } = useApp();
  const [categoryFilter, setCategoryFilter] = useState<'all' | AuditCategory>('all');
  const [search, setSearch] = useState('');

  if (!currentUser || currentUser.role !== 'management' || currentUser.active === false) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Management Access Only</h2>
        <p className="text-sm text-slate-600 mt-1">
          Only active Management accounts can inspect campus audit logs.
        </p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filteredLogs = useMemo(() => {
    return [...state.auditLogs]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .filter((log) => {
        if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          log.actorName.toLowerCase().includes(q) ||
          log.targetName.toLowerCase().includes(q) ||
          log.field.toLowerCase().includes(q) ||
          log.oldValue.toLowerCase().includes(q) ||
          log.newValue.toLowerCase().includes(q) ||
          (log.note || '').toLowerCase().includes(q)
        );
      });
  }, [state.auditLogs, categoryFilter, q]);

  const roleCount = state.auditLogs.filter((l) => l.category === 'role_change').length;
  const medicalCount = state.auditLogs.filter((l) => l.category === 'medical_record').length;
  const personalCount = state.auditLogs.filter((l) => l.category === 'personal_record').length;
  const statusCount = state.auditLogs.filter((l) => l.category === 'account_status').length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-blue-700 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Immutable Compliance Trail</span>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mt-0.5">
            Role &amp; Record Audit Log
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Tracks every modification to user roles, account activation, medical records, and personal contact info.
          </p>
        </div>
        <div className="text-xs text-slate-500 font-medium tabular-nums shrink-0">
          {state.auditLogs.length} total event(s)
        </div>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Role Changes</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{roleCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Medical Record Edits</div>
          <div className="text-2xl font-semibold text-rose-700 mt-1 tabular-nums">{medicalCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Personal Record Edits</div>
          <div className="text-2xl font-semibold text-amber-700 mt-1 tabular-nums">{personalCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Account Status Changes</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{statusCount}</div>
        </div>
      </section>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'role_change', label: 'Role Changes' },
                { id: 'medical_record', label: 'Medical Records' },
                { id: 'personal_record', label: 'Personal Records' },
                { id: 'account_status', label: 'Account Status' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategoryFilter(opt.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                  categoryFilter === opt.id
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, target, field, value..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            No audit events match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4">When</th>
                  <th className="py-3 pr-4">Who Changed</th>
                  <th className="py-3 pr-4">Target Account</th>
                  <th className="py-3 pr-4">Category &amp; Field</th>
                  <th className="py-3 pr-4">Old Value</th>
                  <th className="py-3">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="py-3.5 pr-4 whitespace-nowrap text-xs text-slate-600 tabular-nums">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3.5 pr-4">
                      <div className="font-medium text-slate-900">{log.actorName}</div>
                      <div className="text-xs text-slate-500">{log.actorRole}</div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <div className="font-medium text-slate-900">{log.targetName}</div>
                      <div className="text-xs font-mono text-slate-400">{log.targetUid}</div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-medium ${categoryBadgeStyle(
                          log.category
                        )}`}
                      >
                        {CATEGORY_LABELS[log.category]}
                      </span>
                      <div className="text-xs font-mono text-slate-600 mt-1">{log.field}</div>
                      {log.note && <div className="text-xs text-slate-500 mt-0.5">{log.note}</div>}
                    </td>
                    <td className="py-3.5 pr-4 max-w-[200px]">
                      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 break-words">
                        {log.oldValue}
                      </div>
                    </td>
                    <td className="py-3.5 max-w-[220px]">
                      <div className="text-xs text-slate-900 font-medium bg-blue-50/70 border border-blue-200 rounded-lg px-2.5 py-1.5 break-words">
                        {log.newValue}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
