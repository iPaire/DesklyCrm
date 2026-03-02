import { Link, useLocation } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/contacts', label: 'Contacts' },
];

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-slate-900 tracking-tight">
          Simple<span className="text-indigo-500">CRM</span>
        </Link>
        <div className="flex items-center gap-2">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === to
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
