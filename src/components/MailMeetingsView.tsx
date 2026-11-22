import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ExternalLink,
  Inbox,
  Mail,
  Plus,
  Send,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayIso } from '../services/dataService';
import { Audience } from '../types';

export function MailMeetingsView() {
  const { currentUser, state, sendMail, markMailRead, createMeeting } = useApp();

  const [section, setSection] = useState<'mail' | 'meetings'>('mail');
  const [mailBox, setMailBox] = useState<'inbox' | 'sent' | 'compose'>('inbox');
  const [selectedMailId, setSelectedMailId] = useState<string>('');

  // Compose mail
  const [toUid, setToUid] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mailFeedback, setMailFeedback] = useState<string | null>(null);

  // Schedule meeting
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState(getTodayIso());
  const [mTime, setMTime] = useState('03:30 PM');
  const [mAudience, setMAudience] = useState<Audience>('Students');
  const [mUrl, setMUrl] = useState('https://meet.google.com/psna-session');
  const [mAgenda, setMAgenda] = useState('');

  if (!currentUser) return null;

  const canCreateMeeting = currentUser.role === 'staff' || currentUser.role === 'management';

  const inboxMails = useMemo(
    () =>
      state.mails
        .filter((m) => m.toUid === currentUser.uid)
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [state.mails, currentUser.uid]
  );

  const sentMails = useMemo(
    () =>
      state.mails
        .filter((m) => m.fromUid === currentUser.uid)
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [state.mails, currentUser.uid]
  );

  const displayedMails = mailBox === 'sent' ? sentMails : inboxMails;
  const activeMail =
    displayedMails.find((m) => m.id === selectedMailId) || displayedMails[0] || null;

  const visibleMeetings = useMemo(() => {
    return state.meetings
      .filter((m) => {
        if (currentUser.role === 'management') return true;
        if (m.audience === 'All') return true;
        if (m.audience === 'Students' && currentUser.role === 'student') return true;
        if (m.audience === 'Staff' && currentUser.role === 'staff') return true;
        if (m.audience === 'Hostel' && (currentUser.isHostel || currentUser.isWarden)) return true;
        return false;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [state.meetings, currentUser]);

  const recipientOptions = state.users.filter((u) => u.uid !== currentUser.uid);

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = recipientOptions.find((u) => u.uid === toUid) || recipientOptions[0];
    if (!target || !subject.trim() || !body.trim()) return;
    await sendMail({
      toUser: target,
      toEmail: `${target.uid}@psnacet.edu.in`,
      subject,
      body,
    });
    setSubject('');
    setBody('');
    setMailFeedback(`Message sent to ${target.name}.`);
    setMailBox('sent');
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mTitle.trim() || !mUrl.trim()) return;
    const safeUrl = mUrl.startsWith('http://') || mUrl.startsWith('https://')
      ? mUrl.trim()
      : `https://${mUrl.trim()}`;
    await createMeeting({
      title: mTitle.trim(),
      department: currentUser.department,
      audience: mAudience,
      date: mDate,
      time: mTime,
      joinUrl: safeUrl,
      agenda: mAgenda.trim() || 'Academic & campus coordination sync.',
    });
    setMTitle('');
    setMAgenda('');
    setShowMeetingForm(false);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Campus Mail & Meetings</h2>
          <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
            {inboxMails.filter((m) => !m.read).length} unread mail · {visibleMeetings.length}{' '}
            scheduled meetings
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSection('mail')}
            className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              section === 'mail' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Mail
          </button>
          <button
            type="button"
            onClick={() => setSection('meetings')}
            className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              section === 'meetings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Meetings
          </button>
        </div>
      </section>

      {section === 'mail' ? (
        <section className="space-y-4">
          {mailFeedback && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
              {mailFeedback}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-3 min-h-[460px]">
            <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col">
              <div className="p-3 border-b border-slate-200 grid grid-cols-3 gap-1 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setMailBox('inbox')}
                  className={`min-h-[38px] rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 ${
                    mailBox === 'inbox' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <Inbox className="w-3.5 h-3.5" />
                  <span>Inbox ({inboxMails.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMailBox('sent')}
                  className={`min-h-[38px] rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 ${
                    mailBox === 'sent' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Sent ({sentMails.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMailBox('compose');
                    setMailFeedback(null);
                  }}
                  className={`min-h-[38px] rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 ${
                    mailBox === 'compose' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Compose</span>
                </button>
              </div>

              {mailBox !== 'compose' && (
                <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                  {displayedMails.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500 text-center">No messages here.</p>
                  ) : (
                    displayedMails.map((m) => {
                      const active = activeMail?.id === m.id;
                      const unread = mailBox === 'inbox' && !m.read;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedMailId(m.id);
                            if (unread) markMailRead(m.id);
                          }}
                          className={`w-full p-4 text-left transition-colors ${
                            active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className={unread ? 'font-semibold text-blue-700' : ''}>
                              {mailBox === 'inbox' ? m.fromName : `To: ${m.toName}`}
                            </span>
                            <span className="tabular-nums">
                              {new Date(m.sentAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div
                            className={`text-sm mt-1 truncate ${
                              unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'
                            }`}
                          >
                            {m.subject}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </aside>

            <div className="lg:col-span-2 p-6">
              {mailBox === 'compose' ? (
                <form onSubmit={handleComposeSubmit} className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900">New Campus Mail</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Recipient
                    </label>
                    <select
                      value={toUid || recipientOptions[0]?.uid || ''}
                      onChange={(e) => setToUid(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      {recipientOptions.map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {u.name} ({u.isWarden ? 'Warden' : u.role} · {u.department})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject line"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Message</label>
                    <textarea
                      rows={5}
                      required
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write your message..."
                      className="w-full p-3.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setMailBox('inbox')}
                      className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-1.5"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Mail</span>
                    </button>
                  </div>
                </form>
              ) : !activeMail ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-14">
                  <Mail className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-sm">Select a message to read.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="pb-4 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-900">{activeMail.subject}</h3>
                    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                      <div>
                        From: <span className="font-medium text-slate-800">{activeMail.fromName}</span>{' '}
                        ({activeMail.fromEmail})
                      </div>
                      <div>
                        To: <span className="font-medium text-slate-800">{activeMail.toName}</span> ·{' '}
                        <span className="tabular-nums">
                          {new Date(activeMail.sentAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {activeMail.body}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        /* Meetings Section */
        <section className="space-y-4">
          {canCreateMeeting && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowMeetingForm((v) => !v)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create Meeting</span>
              </button>
            </div>
          )}

          {showMeetingForm && (
            <form
              onSubmit={handleCreateMeeting}
              className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
            >
              <h3 className="text-base font-semibold text-slate-900">Schedule New Meeting</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Meeting Title
                  </label>
                  <input
                    type="text"
                    required
                    value={mTitle}
                    onChange={(e) => setMTitle(e.target.value)}
                    placeholder="e.g. Project Phase II Review"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={mDate}
                    onChange={(e) => setMDate(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
                  <input
                    type="text"
                    required
                    value={mTime}
                    onChange={(e) => setMTime(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Join URL</label>
                  <input
                    type="url"
                    required
                    value={mUrl}
                    onChange={(e) => setMUrl(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Audience</label>
                  <select
                    value={mAudience}
                    onChange={(e) => setMAudience(e.target.value as Audience)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="All">All</option>
                    <option value="Students">Students</option>
                    <option value="Staff">Staff</option>
                    <option value="Hostel">Hostel</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Agenda</label>
                <input
                  type="text"
                  value={mAgenda}
                  onChange={(e) => setMAgenda(e.target.value)}
                  placeholder="Topics to be discussed"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMeetingForm(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
                >
                  Publish Meeting
                </button>
              </div>
            </form>
          )}

          {visibleMeetings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
              No meetings scheduled.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleMeetings.map((m) => (
                <div
                  key={m.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs text-blue-700 font-medium tabular-nums">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {m.date} · {m.time}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{m.audience}</span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mt-1.5">{m.title}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Host: {m.hostName} · {m.department}
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{m.agenda}</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-xs font-mono text-slate-500 truncate max-w-[60%]">
                      {m.joinUrl}
                    </span>
                    <a
                      href={m.joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
