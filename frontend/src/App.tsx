import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown, BaggageClaim, BookOpen, BriefcaseBusiness, CarFront, ChevronDown, ChevronLeft, ChevronRight, CircleArrowDown,
  CircleArrowUp, Dumbbell, Eye, EyeOff, Gift, HeartPulse, House, LogIn, LogOut, Lock, Mail, Mailbox, PawPrint,
  PiggyBank, Plus, ReceiptText, Search, ShoppingCart, SquarePen, Tag as TagIcon, Ticket, Trash2, User, UserPlus,
  Utensils, Wallet, X
} from 'lucide-react';
import financyLogo from './assets/financy-logo.svg';
import { ToolCaseIcon } from './ToolCaseIcon';

const endpoint = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3333/graphql';

type Category = { id: string; title: string; description?: string; icon: string; color: string; transactionCount: number };
type Transaction = { id: string; description: string; amount: number; type: 'INCOME' | 'EXPENSE'; date: string; category: Category };
type User = { id: string; name: string; email: string };
type Page = 'dashboard' | 'transactions' | 'categories' | 'profile';
type DialogState = { kind: 'category' | 'transaction'; data?: any; remove?: boolean } | null;

const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');
const gql = async <T,>(query: string, variables?: object): Promise<T> => {
  const token = getToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables })
  });
  const json = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
const initials = (name: string) => name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

// Cores e ícones do Style Guide (mesma ordem do Figma).
const colorNames = ['green', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow'];
const iconRenderers: Record<string, (size: number) => ReactNode> = {
  BriefcaseBusiness: (s) => <BriefcaseBusiness size={s} />,
  CarFront: (s) => <CarFront size={s} />,
  HeartPulse: (s) => <HeartPulse size={s} />,
  PiggyBank: (s) => <PiggyBank size={s} />,
  ShoppingCart: (s) => <ShoppingCart size={s} />,
  Ticket: (s) => <Ticket size={s} />,
  ToolCase: (s) => <ToolCaseIcon size={s} />,
  Utensils: (s) => <Utensils size={s} />,
  PawPrint: (s) => <PawPrint size={s} />,
  House: (s) => <House size={s} />,
  Gift: (s) => <Gift size={s} />,
  Dumbbell: (s) => <Dumbbell size={s} />,
  BookOpen: (s) => <BookOpen size={s} />,
  BaggageClaim: (s) => <BaggageClaim size={s} />,
  Mailbox: (s) => <Mailbox size={s} />,
  ReceiptText: (s) => <ReceiptText size={s} />
};
iconRenderers.Wrench = iconRenderers.ToolCase; // categorias criadas antes do ajuste
const iconNames = Object.keys(iconRenderers).filter((name) => name !== 'Wrench');
const renderIcon = (name: string, size: number) => (iconRenderers[name] ?? ((s: number) => <TagIcon size={s} />))(size);

function CategoryIcon({ category, size = 16 }: { category: Pick<Category, 'icon' | 'color'>; size?: number }) {
  return <span className={`icon-box ${category.color}`}>{renderIcon(category.icon, size)}</span>;
}
const Tag = ({ category }: { category: Pick<Category, 'title' | 'color'> }) => <span className={`tag ${category.color}`}>{category.title}</span>;
const TypeTag = ({ type }: { type: Transaction['type'] }) =>
  type === 'INCOME'
    ? <span className="type-tag income"><CircleArrowUp size={16} /> Entrada</span>
    : <span className="type-tag expense"><CircleArrowDown size={16} /> Saída</span>;

function Brand({ height = 24 }: { height?: number }) {
  return <img className="brand" style={{ height }} src={financyLogo} alt="Financy" />;
}

type FieldProps = { label: string; icon?: ReactNode; trailing?: ReactNode; helper?: string; error?: boolean } & Record<string, any>;
function Field({ label, icon, trailing, helper, error, ...props }: FieldProps) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="input-wrap">{icon}<input {...props} />{trailing}</span>
      {helper && <span className="helper">{helper}</span>}
    </label>
  );
}
function SelectField({ label, children, ...props }: { label: string; children: ReactNode } & Record<string, any>) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-wrap select-wrap"><select {...props}>{children}</select><ChevronDown size={16} /></span>
    </label>
  );
}
const IconButton = ({ label, danger, ...props }: { label: string; danger?: boolean } & Record<string, any>) =>
  <button type="button" aria-label={label} className={`icon-button ${danger ? 'danger' : ''}`} {...props} />;

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-header">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <IconButton label="Fechar" onClick={onClose}><X size={16} /></IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);

  const refresh = async () => {
    const [cats, trans] = await Promise.all([
      gql<{ categories: Category[] }>(`query { categories { id title description icon color transactionCount } }`),
      gql<{ transactions: Transaction[] }>(`query { transactions { id description amount type date category { id title description icon color transactionCount } } }`)
    ]);
    setCategories(cats.categories);
    setTransactions(trans.transactions);
  };

  useEffect(() => {
    (async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const data = await gql<{ me: User }>('query { me { id name email } }');
        setUser(data.me);
        await refresh();
      } catch {
        localStorage.removeItem('token'); sessionStorage.removeItem('token');
      } finally { setLoading(false); }
    })();
  }, []);

  const onAuthenticated = async (token: string, authUser: User, remember: boolean) => {
    localStorage.removeItem('token'); sessionStorage.removeItem('token');
    (remember ? localStorage : sessionStorage).setItem('token', token);
    setUser(authUser);
    await refresh();
  };
  const logout = () => {
    localStorage.removeItem('token'); sessionStorage.removeItem('token');
    setUser(null); setPage('dashboard'); setCategories([]); setTransactions([]);
  };

  if (loading) return <div className="center">Carregando Financy...</div>;
  if (!user) return <AuthPage onAuthenticated={onAuthenticated} />;

  const nav = (to: Page, label: string) => (
    <button className={page === to ? 'nav active' : 'nav'} onClick={() => setPage(to)}>{label}</button>
  );
  return (
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <button className="brand-button" onClick={() => setPage('dashboard')} aria-label="Dashboard"><Brand /></button>
          <nav>{nav('dashboard', 'Dashboard')}{nav('transactions', 'Transações')}{nav('categories', 'Categorias')}</nav>
          <button className="avatar" aria-label="Perfil" onClick={() => setPage('profile')}>{initials(user.name)}</button>
        </div>
      </header>
      <main>
        {page === 'dashboard' && <Dashboard transactions={transactions} categories={categories} go={setPage} open={setDialog} />}
        {page === 'transactions' && <Transactions transactions={transactions} categories={categories} open={setDialog} />}
        {page === 'categories' && <Categories categories={categories} open={setDialog} />}
        {page === 'profile' && <Profile user={user} logout={logout} onSave={async (name: string) => {
          const data = await gql<{ updateProfile: User }>('mutation($name:String!){updateProfile(name:$name){id name email}}', { name });
          setUser(data.updateProfile);
        }} />}
      </main>
      {dialog && <DialogHost dialog={dialog} categories={categories} close={() => setDialog(null)} done={async () => { setDialog(null); await refresh(); }} />}
    </>
  );
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (token: string, user: User, remember: boolean) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(''); setInfo(''); setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const query = isLogin
        ? `mutation($email:String!,$password:String!){login(email:$email,password:$password){token user{id name email}}}`
        : `mutation($name:String!,$email:String!,$password:String!){register(name:$name,email:$email,password:$password){token user{id name email}}}`;
      const variables = isLogin
        ? { email: form.get('email'), password: form.get('password') }
        : { name: form.get('name'), email: form.get('email'), password: form.get('password') };
      const data = await gql<any>(query, variables);
      const result = data[mode];
      await onAuthenticated(result.token, result.user, isLogin ? form.get('remember') === 'on' : true);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <Brand height={32} />
      <form className="auth-card" onSubmit={submit} key={mode}>
        <div className="auth-title">
          <h1>{isLogin ? 'Fazer login' : 'Criar conta'}</h1>
          <p>{isLogin ? 'Entre na sua conta para continuar' : 'Comece a controlar suas finanças ainda hoje'}</p>
        </div>
        {!isLogin && <Field label="Nome completo" name="name" placeholder="Seu nome completo" icon={<User size={16} />} required />}
        <Field label="E-mail" type="email" name="email" placeholder="mail@exemplo.com" icon={<Mail size={16} />} required />
        <Field
          label="Senha" name="password" type={showPassword ? 'text' : 'password'} placeholder="Digite sua senha" minLength={8} required
          icon={<Lock size={16} />}
          trailing={<button type="button" className="plain-icon" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <Eye size={16} /> : <EyeOff size={16} />}</button>}
          helper={isLogin ? undefined : 'A senha deve ter no mínimo 8 caracteres'}
        />
        {isLogin && (
          <div className="auth-options">
            <label className="checkbox"><input type="checkbox" name="remember" /> Lembrar-me</label>
            <button type="button" className="link-button" onClick={() => setInfo('Para redefinir a senha, entre em contato com o suporte.')}>Recuperar senha</button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {info && <div className="info">{info}</div>}
        <button className="primary" disabled={busy}>{isLogin ? 'Entrar' : 'Cadastrar'}</button>
        <div className="divider"><span>ou</span></div>
        <p className="auth-switch">{isLogin ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}</p>
        <button type="button" className="outline" onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); setInfo(''); }}>
          {isLogin ? <><UserPlus size={18} /> Criar conta</> : <><LogIn size={18} /> Fazer login</>}
        </button>
      </form>
    </div>
  );
}

function PageHeader({ title, subtitle, action, onAction }: { title: string; subtitle: string; action: string; onAction: () => void }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <button className="primary small" onClick={onAction}><Plus size={16} /> {action}</button>
    </div>
  );
}

function Dashboard({ transactions, categories, go, open }: { transactions: Transaction[]; categories: Category[]; go: (page: Page) => void; open: (d: DialogState) => void }) {
  const month = new Date().toISOString().slice(0, 7);
  const sum = (items: Transaction[], type: Transaction['type']) => items.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const monthItems = transactions.filter((t) => t.date.startsWith(month));
  const balance = sum(transactions, 'INCOME') - sum(transactions, 'EXPENSE');
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((t) => map.set(t.category.id, (map.get(t.category.id) ?? 0) + t.amount));
    return map;
  }, [transactions]);
  const itemsLabel = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;

  return (
    <div className="dashboard">
      <section className="stat-card"><div className="stat-head"><Wallet size={20} className="purple-text" /><span>Saldo total</span></div><strong>{money(balance)}</strong></section>
      <section className="stat-card"><div className="stat-head"><CircleArrowUp size={20} className="green-text" /><span>Receitas do mês</span></div><strong>{money(sum(monthItems, 'INCOME'))}</strong></section>
      <section className="stat-card"><div className="stat-head"><CircleArrowDown size={20} className="red-text" /><span>Despesas do mês</span></div><strong>{money(sum(monthItems, 'EXPENSE'))}</strong></section>

      <section className="panel recent">
        <div className="panel-head"><span className="eyebrow">Transações recentes</span><button className="link" onClick={() => go('transactions')}>Ver todas <ChevronRight size={20} /></button></div>
        {transactions.slice(0, 5).map((t) => (
          <div className="recent-row" key={t.id}>
            <CategoryIcon category={t.category} />
            <div className="recent-text"><b>{t.description}</b><span>{shortDate(t.date)}</span></div>
            <div className="recent-tag"><Tag category={t.category} /></div>
            <div className="recent-value"><b>{t.type === 'INCOME' ? '+ ' : '- '}{money(t.amount)}</b>{t.type === 'INCOME' ? <CircleArrowUp size={16} className="green-text" /> : <CircleArrowDown size={16} className="red-text" />}</div>
          </div>
        ))}
        {!transactions.length && <div className="empty">Nenhuma transação registrada</div>}
        <div className="panel-foot"><button className="link" onClick={() => open({ kind: 'transaction' })}><Plus size={20} /> Nova transação</button></div>
      </section>

      <section className="panel categories-panel">
        <div className="panel-head"><span className="eyebrow">Categorias</span><button className="link" onClick={() => go('categories')}>Gerenciar <ChevronRight size={20} /></button></div>
        <div className="category-lines">
          {categories.slice(0, 5).map((c) => (
            <div className="category-line" key={c.id}><Tag category={c} /><span>{itemsLabel(c.transactionCount)}</span><b>{money(totals.get(c.id) ?? 0)}</b></div>
          ))}
          {!categories.length && <div className="empty small">Nenhuma categoria criada</div>}
        </div>
      </section>
    </div>
  );
}

function Categories({ categories, open }: { categories: Category[]; open: (d: DialogState) => void }) {
  const totalTransactions = categories.reduce((s, c) => s + c.transactionCount, 0);
  const top = [...categories].sort((a, b) => b.transactionCount - a.transactionCount)[0];
  return (
    <>
      <PageHeader title="Categorias" subtitle="Organize suas transações por categorias" action="Nova categoria" onAction={() => open({ kind: 'category' })} />
      <section className="summary-row">
        <div className="summary-card"><span className="summary-icon"><TagIcon size={24} /></span><div><strong>{categories.length}</strong><span className="eyebrow">Total de categorias</span></div></div>
        <div className="summary-card"><span className="summary-icon"><ArrowUpDown size={24} /></span><div><strong>{totalTransactions}</strong><span className="eyebrow">Total de transações</span></div></div>
        <div className="summary-card"><span className={`summary-icon ${top?.color ?? ''}-text`}>{top ? renderIcon(top.icon, 24) : <TagIcon size={24} />}</span><div><strong>{top?.title ?? '—'}</strong><span className="eyebrow">Categoria mais utilizada</span></div></div>
      </section>
      <section className="category-grid">
        {categories.map((c) => (
          <article className="category-card" key={c.id}>
            <div className="category-card-head">
              <CategoryIcon category={c} />
              <div className="actions">
                <IconButton label="Excluir categoria" danger onClick={() => open({ kind: 'category', data: c, remove: true })}><Trash2 size={16} /></IconButton>
                <IconButton label="Editar categoria" onClick={() => open({ kind: 'category', data: c })}><SquarePen size={16} /></IconButton>
              </div>
            </div>
            <div className="category-card-text"><h3>{c.title}</h3><p>{c.description || 'Sem descrição'}</p></div>
            <div className="category-card-foot"><Tag category={c} /><span>{c.transactionCount} {c.transactionCount === 1 ? 'item' : 'itens'}</span></div>
          </article>
        ))}
        {!categories.length && <div className="empty-card">Crie sua primeira categoria para organizar as transações.</div>}
      </section>
    </>
  );
}

const PAGE_SIZE = 10;
function Transactions({ transactions, categories, open }: { transactions: Transaction[]; categories: Category[]; open: (d: DialogState) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [periodChoice, setPeriodChoice] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  const periods = useMemo(() => [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(), [transactions]);
  const currentMonth = new Date().toISOString().slice(0, 7);
  // Como no Figma, o filtro começa no mês atual quando ele tem transações.
  const period = periodChoice ?? (periods.includes(currentMonth) ? currentMonth : '');
  const monthLabel = (p: string) => {
    const [y, m] = p.split('-');
    const name = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} / ${y}`;
  };

  const visible = useMemo(() => transactions.filter((t) =>
    t.description.toLowerCase().includes(search.toLowerCase())
    && (!category || t.category.id === category) && (!type || t.type === type) && (!period || t.date.startsWith(period))
  ), [transactions, search, category, type, period]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(pageNumber, pages);
  const rows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const on = (setter: (v: string) => void) => (e: any) => { setter(e.target.value); setPageNumber(1); };

  return (
    <>
      <PageHeader title="Transações" subtitle="Gerencie todas as suas transações financeiras" action="Nova transação" onAction={() => open({ kind: 'transaction' })} />
      <section className="filters">
        <Field label="Buscar" value={search} onChange={on(setSearch)} placeholder="Buscar por descrição" icon={<Search size={16} />} />
        <SelectField label="Tipo" value={type} onChange={on(setType)}><option value="">Todos</option><option value="INCOME">Entrada</option><option value="EXPENSE">Saída</option></SelectField>
        <SelectField label="Categoria" value={category} onChange={on(setCategory)}><option value="">Todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</SelectField>
        <SelectField label="Período" value={period} onChange={(e: any) => { setPeriodChoice(e.target.value); setPageNumber(1); }}><option value="">Todos</option>{periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</SelectField>
      </section>
      <section className="panel table">
        <div className="table-scroll">
          <div className="table-row table-header"><span>Descrição</span><span className="center-cell">Data</span><span className="center-cell">Categoria</span><span className="center-cell">Tipo</span><span className="right-cell">Valor</span><span className="right-cell">Ações</span></div>
          {rows.map((t) => (
            <div className="table-row" key={t.id}>
              <div className="description"><CategoryIcon category={t.category} /><b>{t.description}</b></div>
              <span className="center-cell date">{shortDate(t.date)}</span>
              <span className="center-cell"><Tag category={t.category} /></span>
              <span className="center-cell"><TypeTag type={t.type} /></span>
              <b className="right-cell amount">{t.type === 'INCOME' ? '+ ' : '- '}{money(t.amount)}</b>
              <span className="right-cell actions">
                <IconButton label="Excluir transação" danger onClick={() => open({ kind: 'transaction', data: t, remove: true })}><Trash2 size={16} /></IconButton>
                <IconButton label="Editar transação" onClick={() => open({ kind: 'transaction', data: t })}><SquarePen size={16} /></IconButton>
              </span>
            </div>
          ))}
          {!rows.length && <div className="empty">Nenhuma transação encontrada</div>}
        </div>
        <div className="pagination">
          <span>{visible.length ? <><b>{(current - 1) * PAGE_SIZE + 1}</b> a <b>{Math.min(current * PAGE_SIZE, visible.length)}</b> | <b>{visible.length}</b> resultados</> : '0 resultados'}</span>
          <div className="pager">
            <button aria-label="Página anterior" className="page-button" disabled={current === 1} onClick={() => setPageNumber(current - 1)}><ChevronLeft size={16} /></button>
            {Array.from({ length: pages }, (_, i) => <button key={i} className={`page-button ${current === i + 1 ? 'active' : ''}`} onClick={() => setPageNumber(i + 1)}>{i + 1}</button>)}
            <button aria-label="Próxima página" className="page-button" disabled={current === pages} onClick={() => setPageNumber(current + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>
    </>
  );
}

function Profile({ user, onSave, logout }: { user: User; onSave: (name: string) => Promise<void>; logout: () => void }) {
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try { await onSave(name.trim()); setMessage('Alterações salvas'); } catch (err: any) { setMessage(err.message); }
  };
  return (
    <form className="profile-card" onSubmit={save}>
      <div className="profile-head">
        <span className="profile-avatar">{initials(user.name)}</span>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
      </div>
      <hr />
      <Field label="Nome completo" value={name} onChange={(e: any) => { setName(e.target.value); setMessage(''); }} icon={<User size={16} />} required />
      <Field label="E-mail" value={user.email} disabled icon={<Mail size={16} />} helper="O e-mail não pode ser alterado" />
      {message && <div className="info">{message}</div>}
      <button className="primary">Salvar alterações</button>
      <button type="button" className="outline" onClick={logout}><LogOut size={18} className="red-text" /> Sair da conta</button>
    </form>
  );
}

function DialogHost({ dialog, categories, close, done }: { dialog: NonNullable<DialogState>; categories: Category[]; close: () => void; done: () => Promise<void> }) {
  if (dialog.remove) return <ConfirmDelete dialog={dialog} close={close} done={done} />;
  return dialog.kind === 'category'
    ? <CategoryDialog data={dialog.data} close={close} done={done} />
    : <TransactionDialog data={dialog.data} categories={categories} close={close} done={done} />;
}

function ConfirmDelete({ dialog, close, done }: { dialog: NonNullable<DialogState>; close: () => void; done: () => Promise<void> }) {
  const [error, setError] = useState('');
  const label = dialog.kind === 'category' ? 'categoria' : 'transação';
  const remove = async () => {
    try {
      await gql(`mutation($id:ID!){${dialog.kind === 'category' ? 'deleteCategory' : 'deleteTransaction'}(id:$id)}`, { id: dialog.data.id });
      await done();
    } catch (err: any) { setError(err.message); }
  };
  return (
    <Modal title={`Excluir ${label}?`} subtitle={dialog.kind === 'category' ? 'As transações desta categoria também serão excluídas.' : 'Esta ação não pode ser desfeita.'} onClose={close}>
      {error && <div className="error">{error}</div>}
      <button className="primary danger-button" onClick={remove}>Excluir</button>
    </Modal>
  );
}

function CategoryDialog({ data, close, done }: { data?: Category; close: () => void; done: () => Promise<void> }) {
  const [icon, setIcon] = useState(data && iconRenderers[data.icon] ? (data.icon === 'Wrench' ? 'ToolCase' : data.icon) : iconNames[0]);
  const [color, setColor] = useState(data?.color || colorNames[0]);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = { title: String(form.get('title')).trim(), description: String(form.get('description') ?? '').trim() || null, icon, color };
    try {
      await gql(data
        ? `mutation($id:ID!,$input:CategoryInput!){updateCategory(id:$id,input:$input){id}}`
        : `mutation($input:CategoryInput!){createCategory(input:$input){id}}`, data ? { id: data.id, input } : { input });
      await done();
    } catch (err: any) { setError(err.message); }
  };
  return (
    <Modal title={data ? 'Editar categoria' : 'Nova categoria'} subtitle="Organize suas transações com categorias" onClose={close}>
      <form className="modal-form" onSubmit={submit}>
        <Field label="Título" name="title" defaultValue={data?.title} placeholder="Ex. Alimentação" required />
        <Field label="Descrição" name="description" defaultValue={data?.description ?? ''} placeholder="Descrição da categoria" helper="Opcional" />
        <div className="field">
          <span className="field-label">Ícone</span>
          <div className="icon-grid">
            {iconNames.map((name) => (
              <button type="button" key={name} aria-label={name} aria-pressed={icon === name} className={`icon-pick ${icon === name ? 'active' : ''}`} onClick={() => setIcon(name)}>{renderIcon(name, 20)}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Cor</span>
          <div className="color-grid">
            {colorNames.map((name) => (
              <button type="button" key={name} aria-label={name} aria-pressed={color === name} className={`swatch-pick ${color === name ? 'active' : ''}`} onClick={() => setColor(name)}><span className={`swatch ${name}`} /></button>
            ))}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="primary">Salvar</button>
      </form>
    </Modal>
  );
}

function TransactionDialog({ data, categories, close, done }: { data?: Transaction; categories: Category[]; close: () => void; done: () => Promise<void> }) {
  const [type, setType] = useState<Transaction['type']>(data?.type ?? 'EXPENSE');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = { description: String(form.get('description')).trim(), amount: Number(form.get('amount')), type, date: String(form.get('date')), categoryId: String(form.get('categoryId')) };
    try {
      await gql(data
        ? `mutation($id:ID!,$input:TransactionInput!){updateTransaction(id:$id,input:$input){id}}`
        : `mutation($input:TransactionInput!){createTransaction(input:$input){id}}`, data ? { id: data.id, input } : { input });
      await done();
    } catch (err: any) { setError(err.message); }
  };
  return (
    <Modal title={data ? 'Editar transação' : 'Nova transação'} subtitle="Registre sua despesa ou receita" onClose={close}>
      <div className="type-options">
        <button type="button" aria-pressed={type === 'EXPENSE'} className={`type-option expense ${type === 'EXPENSE' ? 'active' : ''}`} onClick={() => setType('EXPENSE')}><CircleArrowDown size={16} /> Despesa</button>
        <button type="button" aria-pressed={type === 'INCOME'} className={`type-option income ${type === 'INCOME' ? 'active' : ''}`} onClick={() => setType('INCOME')}><CircleArrowUp size={16} /> Receita</button>
      </div>
      <form className="modal-form" onSubmit={submit}>
        <Field label="Descrição" name="description" defaultValue={data?.description} placeholder="Ex. Almoço no restaurante" required />
        <div className="form-row">
          <Field label="Data" name="date" type="date" defaultValue={data?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10)} required />
          <Field label="Valor" name="amount" type="number" step="0.01" min="0.01" defaultValue={data?.amount} placeholder="0,00" icon={<span className="currency">R$</span>} required />
        </div>
        <SelectField label="Categoria" name="categoryId" defaultValue={data?.category.id ?? ''} required>
          <option value="" disabled>Selecione</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </SelectField>
        {error && <div className="error">{error}</div>}
        <button className="primary">Salvar</button>
      </form>
    </Modal>
  );
}
