import React, { useMemo, useState } from 'react';
import { Bell, Calendar, MapPin, Plus, Sparkles } from 'lucide-react';
import { addDays, formatIsoDate } from '../data/seedData';
import { useApp } from '../context/AppContext';
import { getTodayIso } from '../services/dataService';
import { Audience } from '../types';

export function NoticesEventsView() {
  const { currentUser, state, visibleNotices, createNotice, createEvent } = useApp();

  const [audienceFilter, setAudienceFilter] = useState<'Relevant' | Audience>('Relevant');
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);

  // Notice form
  const [nTitle, setNTitle] = useState('');
  const [nMsg, setNMsg] = useState('');
  const [nAudience, setNAudience] = useState<Audience>('All');

  // Event form
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eDate, setEDate] = useState(getTodayIso());
  const [eTime, setETime] = useState('10:00 AM');
  const [eVenue, setEVenue] = useState('Sri Ranganatha Auditorium');
  const [eAudience, setEAudience] = useState<Audience>('All');

  if (!currentUser) return null;

  const canPost = currentUser.role === 'staff' || currentUser.role === 'management';
  const todayStr = getTodayIso();
  const tomorrowStr = formatIsoDate(addDays(new Date(), 1));

  const isAudienceAllowed = (aud: Audience) => {
    if (currentUser.role === 'management') return true;
    if (aud === 'All') return true;
    if (aud === 'Students' && currentUser.role === 'student') return true;
    if (aud === 'Staff' && currentUser.role === 'staff') return true;
    if (aud === 'Hostel' && (currentUser.isHostel || currentUser.isWarden)) return true;
    return false;
  };

  const filteredNotices = useMemo(() => {
    return visibleNotices.filter((n) => {
      if (!isAudienceAllowed(n.audience)) return false;
      if (audienceFilter === 'Relevant') return true;
      return n.audience === audienceFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNotices, audienceFilter, currentUser]);

  const upcomingEvents = useMemo(() => {
    return state.events
      .filter((e) => e.date >= todayStr && isAudienceAllowed(e.audience))
      .sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.events, todayStr, currentUser]);

  const immediateEvents = upcomingEvents.filter(
    (e) => e.date === todayStr || e.date === tomorrowStr
  );

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nTitle.trim() || !nMsg.trim()) return;
    await createNotice({
      title: nTitle.trim(),
      message: nMsg.trim(),
      audience: nAudience,
      pinned: false,
    });
    setNTitle('');
    setNMsg('');
    setShowNoticeForm(false);
  };

  const handlePostEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eTitle.trim() || !eVenue.trim()) return;
    await createEvent({
      title: eTitle.trim(),
      description: eDesc.trim() || 'Campus scheduled event.',
      date: eDate,
      time: eTime,
      venue: eVenue.trim(),
      audience: eAudience,
      organizerName: currentUser.name,
    });
    setETitle('');
    setEDesc('');
    setShowEventForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Banner for Events Happening Today or Tomorrow */}
      {immediateEvents.length > 0 && (
        <section className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Happening Today or Tomorrow</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {immediateEvents.map((evt) => (
              <div
                key={evt.id}
                className="bg-white border border-indigo-100 rounded-xl p-4 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-medium text-indigo-700 tabular-nums">
                    {evt.date === todayStr ? 'Today' : 'Tomorrow'} · {evt.time} · {evt.audience}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">{evt.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{evt.venue}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Header & Action Controls */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Notices & Campus Events</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Official announcements and upcoming academic or hostel events
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPost && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowNoticeForm((v) => !v);
                  setShowEventForm(false);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Post Notice</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEventForm((v) => !v);
                  setShowNoticeForm(false);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
              >
                <Calendar className="w-4 h-4" />
                <span>Create Event</span>
              </button>
            </>
          )}
        </div>
      </section>

      {showNoticeForm && (
        <form
          onSubmit={handlePostNotice}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900">Publish New Notice</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Notice Title</label>
              <input
                type="text"
                required
                value={nTitle}
                onChange={(e) => setNTitle(e.target.value)}
                placeholder="e.g. Semester Exam Fee Deadline Extended"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Audience</label>
              <select
                value={nAudience}
                onChange={(e) => setNAudience(e.target.value as Audience)}
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
            <label className="block text-xs font-medium text-slate-600 mb-1">Message</label>
            <textarea
              rows={3}
              required
              value={nMsg}
              onChange={(e) => setNMsg(e.target.value)}
              placeholder="Write clear instructions for the selected audience..."
              className="w-full p-3.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNoticeForm(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Publish Notice
            </button>
          </div>
        </form>
      )}

      {showEventForm && (
        <form
          onSubmit={handlePostEvent}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900">Schedule New Event</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Event Title</label>
              <input
                type="text"
                required
                value={eTitle}
                onChange={(e) => setETitle(e.target.value)}
                placeholder="e.g. National Robotics Symposium"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input
                type="date"
                required
                value={eDate}
                onChange={(e) => setEDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
              <input
                type="text"
                required
                value={eTime}
                onChange={(e) => setETime(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Venue</label>
              <input
                type="text"
                required
                value={eVenue}
                onChange={(e) => setEVenue(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Audience</label>
              <select
                value={eAudience}
                onChange={(e) => setEAudience(e.target.value as Audience)}
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
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              rows={2}
              value={eDesc}
              onChange={(e) => setEDesc(e.target.value)}
              placeholder="Brief agenda or registration details..."
              className="w-full p-3.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEventForm(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Create Event
            </button>
          </div>
        </form>
      )}

      {/* Split Layout: Notices Feed + Upcoming Events */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-semibold text-slate-900">Notices</h3>
            </div>
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl">
              {(['Relevant', 'All', 'Students', 'Staff', 'Hostel'] as const).map((aud) => (
                <button
                  key={aud}
                  type="button"
                  onClick={() => setAudienceFilter(aud)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    audienceFilter === aud
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {aud === 'Relevant' ? 'For Me' : aud}
                </button>
              ))}
            </div>
          </div>

          {filteredNotices.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              No notices found for this filter.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredNotices.map((n) => (
                <article key={n.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-semibold text-blue-700">{n.audience}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{n.date}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {n.authorName} ({n.authorRole})
                    </span>
                  </div>
                  <h4 className="text-base font-semibold text-slate-900">{n.title}</h4>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 self-start">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Upcoming Events</h3>
          </div>

          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming events scheduled.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingEvents.map((evt) => (
                <div key={evt.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="text-xs font-medium text-indigo-700 tabular-nums">
                    {evt.date} · {evt.time} · {evt.audience}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{evt.title}</div>
                  <div className="text-xs text-slate-600">{evt.venue}</div>
                  <p className="text-xs text-slate-500 mt-1">{evt.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
