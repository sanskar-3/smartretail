import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const money = (value = 0) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value) || 0)
const dateTime = (value) => value ? new Date(value).toLocaleString('en-IN', {
  dateStyle: 'medium', timeStyle: 'short',
}) : '—'
const today = () => new Date().toLocaleDateString('en-CA')

async function request(path, token, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const contentType = response.headers.get('content-type') || ''
  const result = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) throw new Error(result?.message || `Request failed (${response.status})`)
  return result
}

function Icon({ name, size = 19 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    receipt: <><path d="M4 3v18l3-2 3 2 3-2 3 2 4-2V3l-4 2-3-2-3 2-3-2-3 2Z" /><path d="M8 9h8M8 13h6" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>
}

function Button({ children, variant = 'primary', ...props }) {
  return <button className={`button button-${variant}`} {...props}>{children}</button>
}

function Modal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
      {children}
    </section>
  </div>
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

function ProductForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => initial || { sku: '', name: '', category: '', price: '', taxRate: 0, stock: 0, reorderLevel: 10 })
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSave(form) }}>
    <Field label="SKU"><input required value={form.sku} onChange={set('sku')} placeholder="e.g. GRC-001" /></Field>
    <Field label="Product name"><input required value={form.name} onChange={set('name')} placeholder="Product name" /></Field>
    <Field label="Category"><input required value={form.category} onChange={set('category')} placeholder="Grocery" /></Field>
    <Field label="Price (₹)"><input required min="0" step="0.01" type="number" value={form.price} onChange={set('price')} /></Field>
    <Field label="Tax rate (%)"><input min="0" step="0.01" type="number" value={form.taxRate} onChange={set('taxRate')} /></Field>
    {initial ? <Field label="Reorder level"><input min="0" type="number" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field> :
      <><Field label="Opening stock"><input min="0" type="number" value={form.stock} onChange={set('stock')} /></Field>
        <Field label="Reorder level"><input min="0" type="number" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field></>}
    <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Add product'}</Button></div>
  </form>
}

function CustomerForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => initial || { name: '', phone: '', address: '' })
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSave(form) }}>
    <Field label="Full name"><input required value={form.name} onChange={set('name')} placeholder="Customer name" /></Field>
    <Field label="Phone number"><input required value={form.phone} onChange={set('phone')} placeholder="Mobile number" /></Field>
    <Field label="Address"><input value={form.address || ''} onChange={set('address')} placeholder="Optional address" /></Field>
    <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Add customer'}</Button></div>
  </form>
}

function StockMovementForm({ products, onSave, onCancel, saving }) {
  const [action, setAction] = useState('purchase')
  return <form className="form-grid" onSubmit={onSave}>
    <Field label="Movement type"><select name="action" value={action} onChange={(event) => setAction(event.target.value)}><option value="purchase">Purchase / stock-in</option><option value="adjustment">Manual adjustment</option></select></Field>
    <Field label="Product"><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} · {product.stock} in stock</option>)}</select></Field>
    <Field label="Quantity"><input name="qty" type="number" required min="1" step="1" defaultValue="1" /><small>Enter a whole-number quantity.</small></Field>
    {action === 'adjustment' && <Field label="Adjustment direction"><select name="direction"><option value="add">Add stock</option><option value="remove">Remove stock</option></select></Field>}
    <Field label="Note / reference"><input name="note" placeholder="e.g. Supplier invoice or stock count" /></Field>
    <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Save movement'}</Button></div>
  </form>
}

function StaffForm({ onSave, onCancel, saving }) {
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSave(Object.fromEntries(new FormData(event.currentTarget))) }}>
    <Field label="Full name"><input name="name" required placeholder="Team member name" /></Field>
    <Field label="Username"><input name="username" required autoComplete="username" placeholder="Unique login name" /></Field>
    <Field label="Temporary password"><input name="password" type="password" minLength="6" required autoComplete="new-password" placeholder="At least 6 characters" /></Field>
    <Field label="Role"><select name="role"><option value="cashier">Cashier</option><option value="admin">Administrator</option></select></Field>
    <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving}>{saving ? 'Creating…' : 'Create account'}</Button></div>
  </form>
}

function App() {
  const [session, setSession] = useState(() => ({
    token: localStorage.getItem('smartretail-token'),
    user: JSON.parse(localStorage.getItem('smartretail-user') || 'null'),
  }))
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [active, setActive] = useState('overview')
  const [summary, setSummary] = useState(null)
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [team, setTeam] = useState([])
  const [orders, setOrders] = useState([])
  const [logs, setLogs] = useState([])
  const [report, setReport] = useState(null)
  const [reportDate, setReportDate] = useState(today)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [history, setHistory] = useState(null)
  const [live, setLive] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const isAdmin = session.user?.role === 'admin'

  const signOut = useCallback(() => {
    localStorage.removeItem('smartretail-token')
    localStorage.removeItem('smartretail-user')
    setSession({ token: null, user: null })
    setCart([])
  }, [])

  const toast = useCallback((message, type = 'success') => {
    setNotice({ message, type })
    window.setTimeout(() => setNotice(null), 3600)
  }, [])

  const refreshSummary = useCallback(async () => {
    if (!session.token) return
    try { setSummary(await request('/reports/summary', session.token)) }
    catch (error) { toast(error.message, 'error') }
  }, [session.token, toast])

  const refreshView = useCallback(async () => {
    if (!session.token) return
    try {
      if (active === 'overview') {
        const [stats, low] = await Promise.all([
          request('/reports/summary', session.token),
          request('/reports/low-stock', session.token),
        ])
        setSummary({ ...stats, lowItems: low.rows || [] })
      } else if (active === 'products' || active === 'checkout' || active === 'inventory') {
        const jobs = [request('/products', session.token)]
        if (active === 'checkout') jobs.push(request('/customers', session.token))
        const [list, customerList] = await Promise.all(jobs)
        setProducts(list)
        if (customerList) setCustomers(customerList)
        if (active === 'inventory') setLogs(await request('/inventory/logs?limit=30', session.token))
      } else if (active === 'customers') {
        setCustomers(await request('/customers', session.token))
      } else if (active === 'orders') {
        setOrders(await request('/orders?limit=100', session.token))
      } else if (active === 'team' && isAdmin) {
        setTeam(await request('/auth/users', session.token))
      } else if (active === 'reports' && isAdmin) {
        setReport(await request(`/reports/daily?date=${reportDate}`, session.token))
      }
    } catch (error) {
      if (error.message.toLowerCase().includes('login') || error.message.toLowerCase().includes('token')) signOut()
      else toast(error.message, 'error')
    }
  }, [active, isAdmin, reportDate, session.token, signOut, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => { refreshView() }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshView])
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!session.token) return undefined
    const socket = io('/', { auth: { token: session.token }, reconnectionAttempts: 5 })
    socket.on('connect', () => setLive(true))
    socket.on('disconnect', () => setLive(false))
    socket.on('connect_error', () => setLive(false))
    const reload = () => { refreshSummary(); refreshView() }
    socket.on('stock:update', reload)
    socket.on('stock:low', (event) => {
      toast(`${event.name} is low on stock (${event.stock} left)`, 'warning')
      reload()
    })
    socket.on('order:new', reload)
    socket.on('product:changed', reload)
    return () => socket.disconnect()
  }, [session.token, refreshSummary, refreshView, toast])

  const login = async (event) => {
    event.preventDefault()
    setBusy(true)
    setLoginError('')
    try {
      const data = await request('/auth/login', null, { method: 'POST', body: JSON.stringify(credentials) })
      localStorage.setItem('smartretail-token', data.token)
      localStorage.setItem('smartretail-user', JSON.stringify(data.user))
      setSession({ token: data.token, user: data.user })
      setActive('overview')
    } catch (error) {
      setLoginError(error.message)
    } finally { setBusy(false) }
  }

  const saveProduct = async (form) => {
    setBusy(true)
    try {
      const editing = Boolean(modal.product)
      await request(`/products${editing ? `/${modal.product._id}` : ''}`, session.token, {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify({
          ...form, price: Number(form.price), taxRate: Number(form.taxRate),
          stock: Number(form.stock), reorderLevel: Number(form.reorderLevel),
        }),
      })
      setModal(null)
      toast(editing ? 'Product details updated' : 'Product added to catalogue')
      refreshView()
    } catch (error) { toast(error.message, 'error') } finally { setBusy(false) }
  }

  const saveCustomer = async (form) => {
    setBusy(true)
    try {
      const editing = Boolean(modal.customer)
      await request(`/customers${editing ? `/${modal.customer._id}` : ''}`, session.token, {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify(form),
      })
      setModal(null)
      toast(editing ? 'Customer profile updated' : 'Customer added')
      refreshView()
      if (active === 'checkout') setCustomers(await request('/customers', session.token))
    } catch (error) { toast(error.message, 'error') } finally { setBusy(false) }
  }

  const saveStaff = async (form) => {
    setBusy(true)
    try {
      await request('/auth/register', session.token, { method: 'POST', body: JSON.stringify(form) })
      setModal(null)
      toast('Team account created')
      refreshView()
    } catch (error) { toast(error.message, 'error') } finally { setBusy(false) }
  }

  const addToCart = (product) => setCart((items) => {
    const found = items.find((item) => item._id === product._id)
    if ((found?.qty || 0) >= product.stock) {
      toast('Cannot add more than the available stock', 'warning')
      return items
    }
    return found ? items.map((item) => item._id === product._id ? { ...item, qty: item.qty + 1 } : item) :
      [...items, { ...product, qty: 1 }]
  })

  const changeQuantity = (id, change) => setCart((items) => items.flatMap((item) => {
    if (item._id !== id) return [item]
    const qty = item.qty + change
    if (qty < 1) return []
    if (qty > item.stock) {
      toast('Quantity exceeds available stock', 'warning')
      return [item]
    }
    return [{ ...item, qty }]
  }))

  const cartTotals = useMemo(() => cart.reduce((total, item) => {
    const amount = item.price * item.qty
    total.subtotal += amount
    total.tax += amount * item.taxRate / 100
    return total
  }, { subtotal: 0, tax: 0 }), [cart])

  const completeSale = async () => {
    if (!cart.length) return
    setBusy(true)
    try {
      const order = await request('/orders', session.token, {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedCustomer || null, paymentMode,
          items: cart.map((item) => ({ productId: item._id, qty: item.qty })),
        }),
      })
      setSelectedOrder(order)
      setCart([])
      setSelectedCustomer('')
      toast(`Sale complete · ${order.invoiceNo}`)
      refreshView()
      refreshSummary()
    } catch (error) { toast(error.message, 'error') } finally { setBusy(false) }
  }

  const openOrder = async (order) => {
    setBusy(true)
    try { setSelectedOrder(await request(`/orders/${order._id}`, session.token)) }
    catch (error) { toast(error.message, 'error') }
    finally { setBusy(false) }
  }

  const saveStockAction = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const productId = form.get('productId')
    const rawQty = Number(form.get('qty'))
    const qty = form.get('action') === 'adjustment' && form.get('direction') === 'remove' ? -rawQty : rawQty
    const endpoint = form.get('action') === 'purchase' ? '/inventory/stock-in' : '/inventory/adjust'
    const body = form.get('action') === 'purchase'
      ? { productId, qty, note: form.get('note') }
      : { productId, delta: qty, note: form.get('note') }
    setBusy(true)
    try {
      await request(endpoint, session.token, { method: 'POST', body: JSON.stringify(body) })
      setModal(null)
      toast('Inventory updated and movement recorded')
      refreshView()
      refreshSummary()
    } catch (error) { toast(error.message, 'error') } finally { setBusy(false) }
  }

  const openHistory = async (customer) => {
    try { setHistory(await request(`/customers/${customer._id}/history`, session.token)) }
    catch (error) { toast(error.message, 'error') }
  }

  const openReport = async (date) => {
    setReportDate(date)
    if (session.token) {
      try { setReport(await request(`/reports/daily?date=${date}`, session.token)) }
      catch (error) { toast(error.message, 'error') }
    }
  }

  if (!session.token) return <main className="login-page">
    <div className="login-art">
      <div className="login-brand"><span className="brand-mark">S</span><span>smart<span>retail</span></span></div>
      <div className="login-message"><span className="eyebrow">YOUR STORE, IN SYNC</span><h1>Good business<br />starts here.</h1><p>One clear view of your products, customers, sales and stock — in real time.</p></div>
      <div className="login-bottom"><span className="live-pulse" /> Live store operations <span>·</span> Built for your counter</div>
    </div>
    <form className="login-form" onSubmit={login}>
      <div className="mobile-brand login-brand"><span className="brand-mark">S</span><span>smart<span>retail</span></span></div>
      <span className="eyebrow">WELCOME BACK</span><h2>Sign in to your store</h2><p className="muted">Enter your account details to continue.</p>
      <Field label="Username"><input autoComplete="username" required autoFocus value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} placeholder="Your username" /></Field>
      <Field label="Password"><input type="password" autoComplete="current-password" required value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} placeholder="Your password" /></Field>
      {loginError && <div className="inline-error">{loginError}</div>}
      <Button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <Icon name="arrow" /></Button>
      <p className="login-foot">Secure access for your store team</p>
    </form>
  </main>

  const nav = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'checkout', label: 'New sale', icon: 'bag' },
    { id: 'products', label: 'Products', icon: 'box' },
    { id: 'customers', label: 'Customers', icon: 'users' },
    { id: 'orders', label: 'Orders', icon: 'receipt' },
    ...(isAdmin ? [{ id: 'inventory', label: 'Inventory', icon: 'box' }, { id: 'reports', label: 'Reports', icon: 'chart' }, { id: 'team', label: 'Team', icon: 'users' }] : []),
  ]
  const titles = { overview: 'Overview', checkout: 'New sale', products: 'Products', customers: 'Customers', orders: 'Orders', inventory: 'Inventory', reports: 'Reports', team: 'Team' }
  const filteredProducts = products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase()))
  const filteredCustomers = customers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(search.toLowerCase()))

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">S</span><span>smart<span>retail</span></span></div>
      <div className="store-label">STORE WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {nav.map((item) => <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => { setActive(item.id); setSearch('') }}>
          <Icon name={item.icon} /><span>{item.label}</span>{item.id === 'inventory' && summary?.lowStock > 0 && <b className="nav-count">{summary.lowStock}</b>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="connection"><span className={`live-pulse ${live ? '' : 'pulse-off'}`} /><div><strong>{live ? 'Live connection' : 'Reconnecting'}</strong><small>Store updates</small></div></div>
        <div className="user-card"><div className="avatar">{session.user?.name?.slice(0, 1).toUpperCase()}</div><div className="user-info"><strong>{session.user?.name}</strong><small>{session.user?.role}</small></div><button className="icon-button logout" title="Sign out" onClick={signOut}><Icon name="logout" /></button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand brand"><span className="brand-mark">S</span><span>smart<span>retail</span></span></div>
        <div className="breadcrumb">Store <span>/</span> <strong>{titles[active]}</strong></div>
        <div className="topbar-right"><span className="date-label">{currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span><div className="top-avatar">{session.user?.name?.slice(0, 1).toUpperCase()}</div></div>
      </header>
      <div className="content-area">
        {active === 'overview' && <section>
          <div className="page-heading"><div><span className="eyebrow">STORE PULSE</span><h1>Good {currentTime.getHours() < 12 ? 'morning' : currentTime.getHours() < 17 ? 'afternoon' : 'evening'}, {session.user?.name?.split(' ')[0]}</h1><p>Here’s what’s happening at your store today.</p></div><Button onClick={() => setActive('checkout')}><Icon name="plus" /> New sale</Button></div>
          <div className="stat-grid">
            <StatCard label="Sales today" value={summary?.today ? money(summary.today.total) : '—'} hint={summary?.today ? `${summary.today.orders} bills completed` : 'Admin overview'} icon="chart" color="mint" />
            <StatCard label="Bills today" value={summary?.today?.orders ?? '—'} hint="Completed transactions" icon="receipt" color="blue" />
            <StatCard label="Products" value={summary?.productCount ?? '—'} hint="In your catalogue" icon="box" color="peach" />
            <StatCard label="Low stock" value={summary?.lowStock ?? '—'} hint={summary?.lowStock ? 'Needs attention' : 'Stock levels look good'} icon="bell" color="rose" />
          </div>
          <div className="dashboard-grid">
            <div className="panel">
              <div className="panel-head"><div><h2>Low stock watch</h2><p>Products at or below reorder level</p></div><button className="text-button" onClick={() => isAdmin && setActive('inventory')}>View inventory <Icon name="arrow" size={15} /></button></div>
              <LowStockTable items={summary?.lowItems || []} />
            </div>
            <div className="panel insight-panel"><div className="panel-head"><div><h2>Today at a glance</h2><p>Keep the counter moving</p></div></div>
              <div className="glance-total">{summary?.today ? money(summary.today.total) : '—'}<small>gross sales today</small></div>
              <div className="glance-row"><span>Completed bills</span><strong>{summary?.today?.orders ?? '—'}</strong></div>
              <div className="glance-row"><span>Products in catalogue</span><strong>{summary?.productCount ?? '—'}</strong></div>
              <div className="glance-row"><span>Live status</span><strong className="status-good"><span className={`live-pulse ${live ? '' : 'pulse-off'}`} />{live ? 'Connected' : 'Reconnecting'}</strong></div>
              {isAdmin && <button className="report-link" onClick={() => setActive('reports')}>Explore sales reports <Icon name="arrow" size={16} /></button>}
            </div>
          </div>
          <div className="tip-banner"><div className="tip-icon"><Icon name="bell" /></div><div><strong>Stay ahead of stock-outs</strong><p>Stock alerts update live when a sale or adjustment changes availability.</p></div><Button variant="light" onClick={() => setActive(isAdmin ? 'inventory' : 'products')}>Review stock <Icon name="arrow" size={16} /></Button></div>
        </section>}

        {active === 'checkout' && <section>
          <div className="page-heading compact-heading"><div><span className="eyebrow">POINT OF SALE</span><h1>New sale</h1><p>Find products, add quantities, and check out.</p></div></div>
          <div className="pos-layout">
            <div className="panel catalog-panel"><div className="search-field"><Icon name="search" /><input aria-label="Search products" placeholder="Search by product, SKU or category" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
              <div className="catalog-meta">{filteredProducts.length} products <span>Tap a product to add it</span></div>
              <div className="catalog-grid">{filteredProducts.map((product) => <button className="catalog-item" key={product._id} onClick={() => addToCart(product)} disabled={product.stock < 1}>
                <div className="product-tile">{product.name.slice(0, 1).toUpperCase()}</div><div className="catalog-product-name">{product.name}</div><div className="catalog-product-meta">{product.sku} · {product.stock} in stock</div><div className="catalog-price">{money(product.price)}<span>+</span></div>
              </button>)}</div>
            </div>
            <aside className="panel cart-panel"><div className="cart-title"><div><h2>Current bill</h2><p>{cart.length} {cart.length === 1 ? 'item' : 'items'}</p></div><button className="text-button" disabled={!cart.length} onClick={() => setCart([])}>Clear</button></div>
              <Field label="Customer"><div className="customer-select"><select value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} · {customer.phone}</option>)}</select><button title="Add customer" className="icon-button" onClick={() => setModal({ type: 'customer' })}><Icon name="plus" /></button></div></Field>
              <div className="cart-items">{cart.length ? cart.map((item) => <div className="cart-line" key={item._id}><div className="cart-line-info"><strong>{item.name}</strong><small>{money(item.price)} × {item.qty}</small></div><div className="qty-control"><button onClick={() => changeQuantity(item._id, -1)} aria-label={`Remove one ${item.name}`}>−</button><span>{item.qty}</span><button onClick={() => changeQuantity(item._id, 1)} aria-label={`Add one ${item.name}`}>+</button></div><strong className="cart-line-total">{money(item.price * item.qty)}</strong></div>) : <div className="empty-cart"><div className="empty-icon"><Icon name="bag" size={24} /></div><strong>Your bill is empty</strong><span>Choose products from the catalogue to begin.</span></div>}</div>
              <div className="payment-field"><Field label="Payment method"><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></Field></div>
              <div className="bill-totals"><div><span>Subtotal</span><span>{money(cartTotals.subtotal)}</span></div><div><span>Tax</span><span>{money(cartTotals.tax)}</span></div><div className="bill-total"><strong>Total due</strong><strong>{money(cartTotals.subtotal + cartTotals.tax)}</strong></div></div>
              <Button disabled={!cart.length || busy} onClick={completeSale}>{busy ? 'Processing…' : 'Complete sale'} <Icon name="arrow" /></Button>
              <p className="stock-note">Stock is checked live before the bill is saved.</p>
            </aside>
          </div>
        </section>}

        {active === 'products' && <section>
          <PageTitle eyebrow="CATALOGUE" title="Products" description="Manage your store catalogue and stock levels." action={isAdmin && <Button onClick={() => setModal({ type: 'product' })}><Icon name="plus" /> Add product</Button>} />
          <div className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Icon name="search" /><input placeholder="Search products, SKU or category" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span>{filteredProducts.length} products</span></div>
            <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Tax</th><th>Stock</th><th>Availability</th>{isAdmin && <th />}</tr></thead><tbody>
              {filteredProducts.map((product) => <tr key={product._id}><td><div className="table-product"><span className="mini-product">{product.name.slice(0, 1)}</span><strong>{product.name}</strong></div></td><td className="mono">{product.sku}</td><td>{product.category}</td><td>{money(product.price)}</td><td>{product.taxRate}%</td><td><strong>{product.stock}</strong><small className="table-sub">Reorder at {product.reorderLevel}</small></td><td><StockBadge product={product} /></td>{isAdmin && <td><button className="row-action" onClick={() => setModal({ type: 'product', product })}>Edit</button></td>}</tr>)}
              {!filteredProducts.length && <EmptyRow count={isAdmin ? 8 : 7} text="No products found. Add one to start your catalogue." />}
            </tbody></table></div>
          </div>
        </section>}

        {active === 'customers' && <section>
          <PageTitle eyebrow="RELATIONSHIPS" title="Customers" description="Keep customer details and purchase history close at hand." action={<Button onClick={() => setModal({ type: 'customer' })}><Icon name="plus" /> Add customer</Button>} />
          <div className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Icon name="search" /><input placeholder="Search name or phone number" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span>{filteredCustomers.length} customers</span></div>
            <div className="table-scroll"><table><thead><tr><th>Customer</th><th>Phone</th><th>Address</th><th>Added</th><th /></tr></thead><tbody>
              {filteredCustomers.map((customer) => <tr key={customer._id}><td><div className="table-product"><span className="customer-avatar">{customer.name.slice(0, 1).toUpperCase()}</span><strong>{customer.name}</strong></div></td><td>{customer.phone}</td><td>{customer.address || '—'}</td><td>{new Date(customer.createdAt).toLocaleDateString('en-IN')}</td><td className="row-actions"><button className="row-action" onClick={() => openHistory(customer)}>History</button><button className="row-action" onClick={() => setModal({ type: 'customer', customer })}>Edit</button></td></tr>)}
              {!filteredCustomers.length && <EmptyRow count={5} text="No customers yet. Add a regular customer or save one at checkout." />}
            </tbody></table></div>
          </div>
        </section>}

        {active === 'orders' && <section>
          <PageTitle eyebrow="TRANSACTIONS" title="Orders" description="Browse bills and reopen an invoice for printing." />
          <div className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Icon name="search" /><input placeholder="Search invoice or customer" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span>Latest {orders.length} bills</span></div>
            <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date & time</th><th>Payment</th><th>Items</th><th>Total</th><th /></tr></thead><tbody>
              {orders.filter((order) => `${order.invoiceNo} ${order.customer?.name || 'Walk-in'}`.toLowerCase().includes(search.toLowerCase())).map((order) => <tr key={order._id}><td className="mono">{order.invoiceNo}</td><td>{order.customer?.name || 'Walk-in'}</td><td>{dateTime(order.createdAt)}</td><td><span className="payment-pill">{order.paymentMode}</span></td><td>{order.items.reduce((sum, item) => sum + item.qty, 0)}</td><td><strong>{money(order.total)}</strong></td><td><button className="row-action" onClick={() => openOrder(order)}>View bill</button></td></tr>)}
              {!orders.length && <EmptyRow count={7} text="No bills have been created yet." />}
            </tbody></table></div>
          </div>
        </section>}

        {active === 'inventory' && isAdmin && <section>
          <PageTitle eyebrow="STOCK CONTROL" title="Inventory" description="Record purchases and adjustments; every movement is auditable." action={<Button onClick={() => setModal({ type: 'stock' })}><Icon name="plus" /> Record stock</Button>} />
          <div className="stat-grid inventory-stats"><StatCard label="Catalogue items" value={products.length} hint="Tracked products" icon="box" color="blue" /><StatCard label="Low-stock products" value={products.filter((product) => product.stock <= product.reorderLevel).length} hint="At or below reorder level" icon="bell" color="rose" /><StatCard label="Stock movements" value={logs.length} hint="Latest recorded activity" icon="receipt" color="mint" /></div>
          <div className="dashboard-grid inventory-grid"><div className="panel"><div className="panel-head"><div><h2>Live stock levels</h2><p>Current quantity and reorder point</p></div></div><div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>In stock</th><th>Reorder at</th><th>Status</th></tr></thead><tbody>{products.slice().sort((a, b) => a.stock - b.stock).map((product) => <tr key={product._id}><td><strong>{product.name}</strong></td><td className="mono">{product.sku}</td><td><strong>{product.stock}</strong></td><td>{product.reorderLevel}</td><td><StockBadge product={product} /></td></tr>)}</tbody></table></div></div>
            <div className="panel"><div className="panel-head"><div><h2>Recent movements</h2><p>Purchases, adjustments and sales</p></div></div><div className="movement-list">{logs.map((log) => <div className="movement" key={log._id}><span className={`movement-mark ${log.type}`}>{log.quantity > 0 ? '+' : '−'}</span><div><strong>{log.product?.name || 'Product'}</strong><small>{log.reference || log.type} · {dateTime(log.createdAt)}</small></div><b className={log.quantity > 0 ? 'positive' : ''}>{log.quantity > 0 ? '+' : ''}{log.quantity}</b></div>)}{!logs.length && <p className="empty-note">No stock movements recorded.</p>}</div></div>
          </div>
        </section>}

        {active === 'reports' && isAdmin && <section>
          <PageTitle eyebrow="BUSINESS INSIGHTS" title="Sales reports" description="Review daily performance and export records for your bookkeeping." />
          <div className="report-date"><Field label="Sales date"><input type="date" max={today()} value={reportDate} onChange={(event) => openReport(event.target.value)} /></Field><a className="button button-secondary" href={`/api/reports/daily?date=${reportDate}&format=csv`} onClick={(event) => { event.preventDefault(); downloadReport(`/reports/daily?date=${reportDate}&format=csv`, `sales-${reportDate}.csv`) }}>Export CSV <Icon name="arrow" size={16} /></a></div>
          <div className="stat-grid report-stats"><StatCard label="Gross sales" value={money(report?.summary?.total)} hint={reportDate} icon="chart" color="mint" /><StatCard label="Bills" value={report?.summary?.orders ?? 0} hint="Completed transactions" icon="receipt" color="blue" /><StatCard label="Tax collected" value={money(report?.summary?.tax)} hint="Included in gross sales" icon="box" color="peach" /></div>
          <div className="dashboard-grid"><div className="panel"><div className="panel-head"><div><h2>Sales on {reportDate}</h2><p>Bill-by-bill view of the selected day</p></div></div><div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Time</th><th>Customer</th><th>Payment</th><th>Total</th></tr></thead><tbody>{report?.rows?.map((row) => <tr key={row.invoiceNo}><td className="mono">{row.invoiceNo}</td><td>{row.time}</td><td>{row.customer}</td><td><span className="payment-pill">{row.paymentMode}</span></td><td><strong>{money(row.total)}</strong></td></tr>)}{!report?.rows?.length && <EmptyRow count={5} text="No sales recorded for this date." />}</tbody></table></div></div>
            <div className="panel"><div className="panel-head"><div><h2>Top products</h2><p>Best sellers by quantity</p></div></div><div className="top-products">{report?.top?.map((item, index) => <div className="top-product" key={item.name}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.name}</strong><small>{item.qtySold} sold</small></div><b>{money(item.revenue)}</b></div>)}{!report?.top?.length && <p className="empty-note">Top products appear after your first sale.</p>}</div></div>
          </div>
        </section>}

        {active === 'team' && isAdmin && <section>
          <PageTitle eyebrow="STORE ACCESS" title="Team accounts" description="Give each counter team member a secure sign-in and the right level of access." action={<Button onClick={() => setModal({ type: 'staff' })}><Icon name="plus" /> Add team member</Button>} />
          <div className="panel table-panel"><div className="panel-head"><div><h2>People with store access</h2><p>Cashiers can bill customers; administrators can manage store operations.</p></div></div>
            <div className="table-scroll"><table><thead><tr><th>Team member</th><th>Username</th><th>Role</th><th>Account created</th></tr></thead><tbody>
              {team.map((member) => <tr key={member._id}><td><div className="table-product"><span className="customer-avatar">{member.name.slice(0, 1).toUpperCase()}</span><strong>{member.name}</strong>{member._id === session.user?.id && <span className="you-label">You</span>}</div></td><td className="mono">{member.username}</td><td><span className={`role-pill ${member.role}`}>{member.role}</span></td><td>{new Date(member.createdAt).toLocaleDateString('en-IN')}</td></tr>)}
              {!team.length && <EmptyRow count={4} text="No team accounts found." />}
            </tbody></table></div>
          </div>
          <div className="team-note"><strong>Access stays role-based.</strong><span>Cashier accounts can create bills and customer records. Only administrators can edit the catalogue, record stock movements, and access reports.</span></div>
        </section>}
      </div>
      <footer className="app-footer"><span>SmartRetail <i>·</i> Store operations</span><span><span className={`live-pulse ${live ? '' : 'pulse-off'}`} /> {live ? 'Live updates on' : 'Reconnecting to live updates'}</span></footer>
    </main>

    {modal?.type === 'product' && <Modal title={modal.product ? 'Edit product' : 'Add product'} onClose={() => setModal(null)}><ProductForm initial={modal.product} onSave={saveProduct} onCancel={() => setModal(null)} saving={busy} /></Modal>}
    {modal?.type === 'customer' && <Modal title={modal.customer ? 'Edit customer' : 'Add customer'} onClose={() => setModal(null)}><CustomerForm initial={modal.customer} onSave={saveCustomer} onCancel={() => setModal(null)} saving={busy} /></Modal>}
    {modal?.type === 'staff' && <Modal title="Create team account" onClose={() => setModal(null)}><StaffForm onSave={saveStaff} onCancel={() => setModal(null)} saving={busy} /></Modal>}
    {modal?.type === 'stock' && <Modal title="Record stock movement" onClose={() => setModal(null)}><StockMovementForm products={products} onSave={saveStockAction} onCancel={() => setModal(null)} saving={busy} /></Modal>}
    {selectedOrder && <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    {history && <Modal title="Customer purchase history" onClose={() => setHistory(null)} wide><div className="history-customer"><span className="customer-avatar">{history.customer.name.slice(0, 1)}</span><div><strong>{history.customer.name}</strong><small>{history.customer.phone} · Lifetime spend {money(history.totalSpent)}</small></div></div>
      <div className="table-scroll history-table"><table><thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>Total</th></tr></thead><tbody>{history.orders.map((order) => <tr key={order._id}><td className="mono">{order.invoiceNo}</td><td>{dateTime(order.createdAt)}</td><td>{order.items.reduce((sum, item) => sum + item.qty, 0)}</td><td>{money(order.total)}</td></tr>)}{!history.orders.length && <EmptyRow count={4} text="No purchases on record." />}</tbody></table></div>
    </Modal>}
    {selectedOrder && <div className="print-surface"><Receipt order={selectedOrder} /></div>}
    {notice && <div className={`toast toast-${notice.type}`} role="status">{notice.type === 'error' ? '!' : '✓'} {notice.message}</div>}
  </div>
}

function StatCard({ label, value, hint, icon, color }) {
  return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon name={icon} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-hint">{hint}</span></div>
}

function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function StockBadge({ product }) {
  const low = product.stock <= product.reorderLevel
  return <span className={`stock-badge ${low ? 'low' : 'in-stock'}`}><span />{low ? 'Low stock' : 'In stock'}</span>
}

function LowStockTable({ items }) {
  return <div className="low-stock-list">{items.slice(0, 6).map((item) => <div className="low-stock-row" key={item.sku}><div className="low-product-icon">{item.name.slice(0, 1)}</div><div className="low-product-name"><strong>{item.name}</strong><small>{item.sku} · {item.category}</small></div><div className="stock-level"><strong>{item.stock}</strong><small>of {item.reorderLevel} minimum</small></div><span className="stock-badge low"><span />Low</span></div>)}{!items.length && <div className="all-stock-good"><span>✓</span><strong>Everything looks well stocked</strong><small>Low-stock products will appear here.</small></div>}</div>
}

function EmptyRow({ count, text }) {
  return <tr><td colSpan={count}><div className="table-empty">{text}</div></td></tr>
}

function Receipt({ order }) {
  return <div className="receipt"><div className="receipt-brand"><span className="brand-mark">S</span><div><strong>smartretail</strong><small>Store invoice</small></div></div>
    <div className="receipt-rule" /><div className="receipt-meta"><span>INVOICE</span><strong>{order.invoiceNo}</strong><span>{dateTime(order.createdAt)}</span></div>
    <div className="receipt-meta"><span>Customer</span><strong>{order.customer?.name || 'Walk-in customer'}</strong><span>Payment: {order.paymentMode?.toUpperCase()}</span></div>
    <div className="receipt-rule" /><div className="receipt-lines">{order.items?.map((item, index) => <div className="receipt-line" key={`${item.product}-${index}`}><div><strong>{item.name}</strong><small>{item.qty} × {money(item.price)} · Tax {item.taxRate}%</small></div><b>{money(item.amount)}</b></div>)}</div>
    <div className="receipt-rule" /><div className="receipt-total"><span>Subtotal</span><b>{money(order.subtotal)}</b><span>Tax</span><b>{money(order.tax)}</b><strong>Total paid</strong><strong>{money(order.total)}</strong></div>
    <p className="receipt-thanks">Thank you for shopping with us!</p>
  </div>
}

function OrderModal({ order, onClose }) {
  return <Modal title="Bill details" onClose={onClose} wide><div className="order-modal-layout"><div className="order-summary"><span className="eyebrow">INVOICE</span><h3>{order.invoiceNo}</h3><p>{dateTime(order.createdAt)}</p><div className="order-summary-line"><span>Customer</span><strong>{order.customer?.name || 'Walk-in customer'}</strong></div><div className="order-summary-line"><span>Payment</span><strong className="payment-pill">{order.paymentMode}</strong></div><div className="order-summary-line"><span>Handled by</span><strong>{order.billedBy?.name || 'Store team'}</strong></div><Button onClick={() => window.print()}><Icon name="print" /> Print invoice</Button></div><Receipt order={order} /></div></Modal>
}

async function downloadReport(path, filename) {
  const token = localStorage.getItem('smartretail-token')
  try {
    const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) {
      const body = await response.json()
      throw new Error(body.message || 'Could not export report')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    window.alert(error.message)
  }
}

export default App
