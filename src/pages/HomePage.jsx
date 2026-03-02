import { Link } from 'react-router-dom';

const navCards = [
  {
    to: '/contacts',
    icon: '👥',
    title: 'Contacts',
    description: 'Manage your clients and leads',
    color: 'bg-indigo-500',
  },
  {
    to: '/deals',
    icon: '💼',
    title: 'Deals',
    description: 'Track your sales pipeline',
    color: 'bg-violet-500',
    soon: true,
  },
  {
    to: '/tasks',
    icon: '✅',
    title: 'Tasks',
    description: 'Stay on top of follow-ups',
    color: 'bg-sky-500',
    soon: true,
  },
  {
    to: '/settings',
    icon: '⚙️',
    title: 'Settings',
    description: 'Account and billing',
    color: 'bg-slate-500',
    soon: true,
  },
];

export default function HomePage() {
  return (
    <div className="py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">
          Welcome back
        </h1>
        <p className="text-slate-500 text-lg">
          What do you want to work on today?
        </p>
      </div>

      {/* Nav cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {navCards.map(({ to, icon, title, description, color, soon }) => (
          <Link
            key={to}
            to={soon ? '#' : to}
            className={`relative bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${
              soon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {soon && (
              <span className="absolute top-3 right-3 text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                Soon
              </span>
            )}
            <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-2xl`}>
              {icon}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick stats (placeholder) */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Contacts', value: '-' },
          { label: 'Active Deals', value: '-' },
          { label: 'Tasks Due Today', value: '-' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
