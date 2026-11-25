import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coffee,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CanteenItem, CanteenOrderItem, OrderStatus, canAccessScreen } from '../types';

const STATUS_FLOW: OrderStatus[] = ['Placed', 'Preparing', 'Ready', 'Collected'];

export function CanteenView() {
  const {
    currentUser,
    state,
    placeCanteenOrder,
    updateCanteenOrderStatus,
    toggleCanteenItemAvailability,
    upsertCanteenItem,
  } = useApp();

  const [tab, setTab] = useState<'order' | 'manage'>(
    currentUser?.role === 'management' ? 'manage' : 'order'
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderNotice, setOrderNotice] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  // Add/Edit item form for Management/Staff
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Snacks');
  const [newPrice, setNewPrice] = useState('40');
  const [newFrom, setNewFrom] = useState('09:00');
  const [newTo, setNewTo] = useState('17:00');
  const [newVeg, setNewVeg] = useState(true);

  if (!currentUser || !canAccessScreen(currentUser, 'canteen')) return null;

  const canManageCanteen = currentUser.role === 'management' || currentUser.role === 'staff';
  const categories = ['All', 'Breakfast', 'Lunch', 'Snacks', 'Beverages'];

  const filteredItems = useMemo(() => {
    return state.canteenItems.filter((item) =>
      categoryFilter === 'All' ? true : item.category === categoryFilter
    );
  }, [state.canteenItems, categoryFilter]);

  const cartEntries: CanteenOrderItem[] = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => {
        const found = state.canteenItems.find((i) => i.id === itemId);
        if (!found) return null;
        return { itemId, name: found.name, qty, price: found.price };
      })
      .filter((x): x is CanteenOrderItem => Boolean(x));
  }, [cart, state.canteenItems]);

  const cartTotal = cartEntries.reduce((sum, e) => sum + e.price * e.qty, 0);

  const myOrders = useMemo(
    () => state.canteenOrders.filter((o) => o.userUid === currentUser.uid),
    [state.canteenOrders, currentUser.uid]
  );

  const adjustCart = (itemId: string, delta: number) => {
    setCart((prev) => {
      const nextQty = Math.max(0, (prev[itemId] || 0) + delta);
      if (nextQty === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: nextQty };
    });
  };

  const handlePlaceOrder = async () => {
    if (cartEntries.length === 0) return;
    setPlacing(true);
    setOrderNotice(null);
    try {
      const ord = await placeCanteenOrder(cartEntries);
      setCart({});
      setOrderNotice(`Order placed! Your Canteen Token Number is #${ord.tokenNumber}.`);
    } finally {
      setPlacing(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const item: CanteenItem = {
      id: `c-${Date.now()}`,
      name: newName.trim(),
      category: newCategory,
      price: Number(newPrice) || 25,
      availableFrom: newFrom,
      availableTo: newTo,
      isAvailable: true,
      veg: newVeg,
    };
    await upsertCanteenItem(item);
    setNewName('');
  };

  const statusTone = (status: OrderStatus) => {
    switch (status) {
      case 'Placed':
        return 'text-slate-700 bg-slate-100';
      case 'Preparing':
        return 'text-amber-800 bg-amber-50';
      case 'Ready':
        return 'text-emerald-800 bg-emerald-50';
      case 'Collected':
        return 'text-blue-800 bg-blue-50';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Role Switch */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-blue-700">PSNA Campus Canteen</div>
          <h2 className="text-xl font-semibold text-slate-900 mt-0.5">
            Menu, Token Ordering & Kitchen Queue
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {state.canteenItems.filter((i) => i.isAvailable).length} items available right now
          </p>
        </div>

        {canManageCanteen && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTab('order')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'order' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Order Menu
            </button>
            <button
              type="button"
              onClick={() => setTab('manage')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'manage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Orders & Menu Admin
            </button>
          </div>
        )}
      </section>

      {orderNotice && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center gap-2.5"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{orderNotice}</span>
        </div>
      )}

      {tab === 'order' ? (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Menu List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap gap-1.5 p-1 bg-white border border-slate-200 rounded-xl">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    categoryFilter === cat
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredItems.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                No items in this category.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredItems.map((item) => {
                  const qty = cart[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className={`bg-white border rounded-2xl p-5 flex flex-col justify-between gap-3 ${
                        item.isAvailable ? 'border-slate-200' : 'border-slate-200 opacity-65'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>
                            {item.category} · {item.veg ? 'Veg' : 'Non-Veg'}
                          </span>
                          <span className="font-mono tabular-nums">
                            {item.availableFrom} – {item.availableTo}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 mt-1">
                          {item.name}
                        </h3>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-lg font-semibold text-slate-900 tabular-nums">
                          ₹{item.price}
                        </span>

                        {!item.isAvailable ? (
                          <span className="text-xs font-medium text-red-700">Unavailable</span>
                        ) : qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => adjustCart(item.id, 1)}
                            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Remove one ${item.name}`}
                              onClick={() => adjustCart(item.id, -1)}
                              className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">
                              {qty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Add one ${item.name}`}
                              onClick={() => adjustCart(item.id, 1)}
                              className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Cart & My Orders */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-semibold text-slate-900">Your Order Cart</h3>
                </div>
                {cartEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart({})}
                    className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {cartEntries.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                  Add items from the menu to generate an instant canteen token.
                </p>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {cartEntries.map((entry) => (
                      <div
                        key={entry.itemId}
                        className="py-2.5 flex items-center justify-between text-sm"
                      >
                        <div>
                          <div className="font-medium text-slate-900">{entry.name}</div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {entry.qty} × ₹{entry.price}
                          </div>
                        </div>
                        <span className="font-semibold text-slate-900 tabular-nums">
                          ₹{entry.qty * entry.price}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Total Payable</span>
                    <span className="text-xl font-semibold text-slate-900 tabular-nums">
                      ₹{cartTotal}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={placing}
                    onClick={handlePlaceOrder}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
                  >
                    {placing ? 'Placing Order...' : 'Place Order & Get Token'}
                  </button>
                </>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
              <h3 className="text-base font-semibold text-slate-900">My Order Tokens</h3>
              {myOrders.length === 0 ? (
                <p className="text-sm text-slate-500">You have not placed any orders today.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {myOrders.map((ord) => (
                    <div key={ord.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                          Token #{ord.tokenNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-medium ${statusTone(
                            ord.status
                          )}`}
                        >
                          {ord.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        {ord.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        Total ₹{ord.totalAmount} ·{' '}
                        {new Date(ord.placedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        /* Management / Staff Canteen Console */
        <section className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              All Canteen Orders ({state.canteenOrders.length})
            </h3>
            {state.canteenOrders.length === 0 ? (
              <p className="text-sm text-slate-500">No canteen orders placed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Token</th>
                      <th className="py-2.5 pr-4 font-medium">Ordered By</th>
                      <th className="py-2.5 pr-4 font-medium">Items & Qty</th>
                      <th className="py-2.5 pr-4 font-medium">Total</th>
                      <th className="py-2.5 pr-4 font-medium">Time</th>
                      <th className="py-2.5 font-medium">Update Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.canteenOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="py-3 pr-4 font-mono font-semibold text-slate-900 tabular-nums">
                          #{ord.tokenNumber}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">{ord.userName}</div>
                          <div className="text-xs text-slate-500">{ord.userRole}</div>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {ord.items.map((i) => `${i.name} (×${i.qty})`).join(', ')}
                        </td>
                        <td className="py-3 pr-4 font-semibold tabular-nums">₹{ord.totalAmount}</td>
                        <td className="py-3 pr-4 text-xs text-slate-500 tabular-nums">
                          {new Date(ord.placedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3">
                          <select
                            aria-label={`Status for token ${ord.tokenNumber}`}
                            value={ord.status}
                            onChange={(e) =>
                              updateCanteenOrderStatus(ord.id, e.target.value as OrderStatus)
                            }
                            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800"
                          >
                            {STATUS_FLOW.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-slate-900">
                Menu Item Availability Toggle
              </h3>
              <div className="divide-y divide-slate-100">
                {state.canteenItems.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {item.name} · <span className="tabular-nums">₹{item.price}</span>
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {item.category} · {item.availableFrom} – {item.availableTo}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCanteenItemAvailability(item.id)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                        item.isAvailable
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {item.isAvailable ? 'Available' : 'Marked Unavailable'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleAddItem}
              className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 self-start"
            >
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">Add Menu Item</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Curd Rice Bowl"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="Breakfast">Breakfast</option>
                    <option value="Lunch">Lunch</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Beverages">Beverages</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
                  <input
                    type="time"
                    value={newFrom}
                    onChange={(e) => setNewFrom(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
                  <input
                    type="time"
                    value={newTo}
                    onChange={(e) => setNewTo(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={newVeg}
                  onChange={(e) => setNewVeg(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Vegetarian item</span>
              </label>
              <button
                type="submit"
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                Add to Menu
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
