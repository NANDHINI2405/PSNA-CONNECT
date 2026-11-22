import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Plus, Send, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function ChatView() {
  const {
    currentUser,
    state,
    dataMode,
    subscribeThread,
    sendChatMessage,
    createOrOpenDmThread,
    createGroupThread,
  } = useApp();

  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupClass, setGroupClass] = useState('III CSE A');
  const [groupType, setGroupType] = useState<'class' | 'hostel'>('class');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Filter threads visible to this user's role
  const accessibleThreads = useMemo(() => {
    if (!currentUser) return [];
    return state.chatThreads.filter((t) => {
      if (t.type === 'class') {
        if (currentUser.role === 'management' || currentUser.role === 'staff') return true;
        return !t.className || t.className === currentUser.className;
      }
      if (t.type === 'hostel') {
        return currentUser.isHostel || currentUser.isWarden || currentUser.role === 'management';
      }
      if (t.type === 'dm') {
        return (
          currentUser.role === 'management' ||
          Boolean(t.participantUids?.includes(currentUser.uid))
        );
      }
      return false;
    });
  }, [state.chatThreads, currentUser]);

  const activeThread =
    accessibleThreads.find((t) => t.id === selectedThreadId) || accessibleThreads[0] || null;

  useEffect(() => {
    if (!activeThread) return;
    const unsub = subscribeThread(activeThread.id);
    return () => unsub();
  }, [activeThread, subscribeThread]);

  const activeMessages = activeThread ? state.chatMessages[activeThread.id] || [] : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeThread?.id]);

  if (!currentUser) return null;

  const canCreateGroup = currentUser.role === 'staff' || currentUser.role === 'management';
  const dmCandidates = state.users.filter((u) => u.uid !== currentUser.uid);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !messageText.trim()) return;
    const txt = messageText;
    setMessageText('');
    await sendChatMessage(activeThread.id, txt);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) return;
    const thread = await createGroupThread({
      type: groupType,
      title: groupTitle,
      className: groupType === 'class' ? groupClass : undefined,
    });
    setSelectedThreadId(thread.id);
    setGroupTitle('');
    setShowGroupForm(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-3 min-h-[540px]">
      {/* Thread List */}
      <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">Campus Channels</h2>
            <p className="text-xs text-slate-500">
              {dataMode === 'firebase' ? 'Live Firestore sync' : 'Simulated real-time chat'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canCreateGroup && (
              <button
                type="button"
                onClick={() => {
                  setShowGroupForm((v) => !v);
                  setShowDmPicker(false);
                }}
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Group</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowDmPicker((v) => !v);
                setShowGroupForm(false);
              }}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>DM</span>
            </button>
          </div>
        </div>

        {showGroupForm && canCreateGroup && (
          <form onSubmit={handleCreateGroup} className="p-3 bg-slate-50 border-b border-slate-200 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700">Create Class / Hostel Group</div>
            <input
              type="text"
              required
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="e.g. IV CSE A · Placement Group"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={groupType}
                onChange={(e) => setGroupType(e.target.value as 'class' | 'hostel')}
                className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs"
              >
                <option value="class">Class Group</option>
                <option value="hostel">Hostel Group</option>
              </select>
              {groupType === 'class' && (
                <input
                  type="text"
                  value={groupClass}
                  onChange={(e) => setGroupClass(e.target.value)}
                  placeholder="Class (e.g. III CSE A)"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs"
                />
              )}
            </div>
            <button
              type="submit"
              className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
            >
              Create Channel
            </button>
          </form>
        )}

        {showDmPicker && (
          <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
            <div className="text-xs font-medium text-slate-600">Start Direct Message</div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {dmCandidates.map((u) => (
                <button
                  key={u.uid}
                  type="button"
                  onClick={async () => {
                    const thread = await createOrOpenDmThread(u);
                    setSelectedThreadId(thread.id);
                    setShowDmPicker(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-left text-xs flex items-center justify-between"
                >
                  <span className="font-medium text-slate-900">{u.name}</span>
                  <span className="text-slate-500">
                    {u.isWarden ? 'Warden' : u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {accessibleThreads.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 text-center">No chat channels available.</p>
          ) : (
            accessibleThreads.map((t) => {
              const active = activeThread?.id === t.id;
              const lastMsg = (state.chatMessages[t.id] || []).slice(-1)[0];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedThreadId(t.id)}
                  className={`w-full p-4 text-left transition-colors ${
                    active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {t.title}
                    </span>
                    <span className="text-[11px] font-medium text-blue-700 uppercase shrink-0">
                      {t.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate">
                    {lastMsg ? `${lastMsg.senderName}: ${lastMsg.text}` : 'No messages yet'}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Active Chat Conversation */}
      <section className="lg:col-span-2 flex flex-col min-h-[420px]">
        {!activeThread ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
            <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm">Select a class group, hostel group, or direct message.</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{activeThread.title}</h3>
                  <div className="text-xs text-slate-500">
                    {activeThread.type === 'hostel'
                      ? 'Warden & Hostel Residents'
                      : activeThread.type === 'class'
                      ? 'Class Announcement & Discussion Group'
                      : 'Direct Message'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 sm:p-6 space-y-3 overflow-y-auto max-h-[420px] bg-slate-50/50">
              {activeMessages.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  Start the conversation in {activeThread.title}.
                </p>
              ) : (
                activeMessages.map((m) => {
                  const isMine = m.senderUid === currentUser.uid;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="text-[11px] text-slate-500 mb-1 px-1 tabular-nums">
                        {isMine ? 'You' : `${m.senderName} (${m.senderRole})`} ·{' '}
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div
                        className={`max-w-[82%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMine
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center gap-2"
            >
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Message ${activeThread.title}...`}
                className="flex-1 h-11 px-4 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={!messageText.trim()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
