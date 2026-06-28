import { useQuery } from '@tanstack/react-query'
import { Users, CreditCard, TrendingUp, AlertTriangle, Receipt, DollarSign, Boxes, ShoppingCart, Building2, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import StatCard from '../../components/ui/StatCard'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import useAuthStore from '../../store/authStore'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`

function SuperAdminDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: async () => { const { data } = await api.get('/dashboard/superadmin/'); return data },
    refetchInterval: 60000,
  })

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-blue-400">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Platform-wide overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Gyms" value={data.gyms.total} subtitle={`${data.gyms.active} active · ${data.gyms.inactive} inactive`} icon={Building2} color="primary" />
        <StatCard title="Active Gyms" value={data.gyms.active} subtitle={`${data.gyms.inactive} inactive`} icon={Building2} color="green" />
        <StatCard title="Expiring Soon" value={data.gyms.expiring_soon} subtitle="Within 7 days" icon={AlertTriangle} color="yellow" />
        <StatCard title="Subscription (Month)" value={fmt(data.subscription_revenue_month)} subtitle="Collected this month" icon={Wallet} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-100">Top Gyms by Members</h3>
          </div>
          <Table>
            <Thead>
              <Th>Gym</Th>
              <Th>Members</Th>
              <Th>Status</Th>
            </Thead>
            <Tbody>
              {data.top_gyms.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <button onClick={() => navigate(`/admin/gyms/${g.id}`)} className="font-medium text-gray-100 hover:text-blue-400 transition">
                      {g.name}
                    </button>
                  </Td>
                  <Td>{g.member_count}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${g.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                      {g.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                </Tr>
              ))}
              {!data.top_gyms.length && (
                <Tr><Td colSpan={3} className="text-center py-10 text-gray-400">No gyms yet</Td></Tr>
              )}
            </Tbody>
          </Table>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Recent Subscription Payments</h3>
            <span className="text-xs text-gray-500">Total: {fmt(data.subscription_revenue_total)}</span>
          </div>
          <Table>
            <Thead><Th>Gym</Th><Th>Amount</Th><Th>Date</Th></Thead>
            <Tbody>
              {data.recent_gym_payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium">{p.gym__name}</Td>
                  <Td className="text-green-400 font-semibold">{fmt(p.amount)}</Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                </Tr>
              ))}
              {!data.recent_gym_payments.length && (
                <Tr><Td colSpan={3} className="text-center py-8 text-gray-400">No payments yet</Td></Tr>
              )}
            </Tbody>
          </Table>
        </div>
      </div>
    </div>
  )
}

function GymDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: async () => { const { data } = await api.get('/dashboard/'); return data }, refetchInterval: 60000 })

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-blue-400">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of your gym's performance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Members" value={data.members.active} subtitle={`${data.members.total} total`} icon={Users} color="primary" />
        <StatCard title="Revenue This Month" value={fmt(data.revenue.this_month)} subtitle="Collected fees" icon={CreditCard} color="green" trend={data.revenue.growth} />
        <StatCard title="Expenses This Month" value={fmt(data.expenses.this_month)} subtitle="Total spent" icon={Receipt} color="red" />
        <StatCard title="Net Profit" value={fmt(data.net_profit)} subtitle="Revenue - Expenses" icon={DollarSign} color={data.net_profit >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Expiring Soon" value={data.members.expiring_soon} subtitle="Within 7 days" icon={AlertTriangle} color="yellow" />
        <StatCard title="Expired Members" value={data.members.expired} subtitle="Need renewal" icon={Users} color="red" />
        <StatCard title="New This Month" value={data.members.new_this_month} subtitle="Joined this month" icon={TrendingUp} color="blue" />
        <StatCard title="Inventory Products" value={data.inventory.total_products} subtitle={data.inventory.low_stock_count > 0 ? `⚠ ${data.inventory.low_stock_count} low stock` : 'All stocked'} icon={Boxes} color={data.inventory.low_stock_count > 0 ? 'yellow' : 'primary'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Inventory Stock Value" value={fmt(data.inventory.stock_value)} subtitle="At selling price" icon={Boxes} color="primary" />
        <StatCard title="Inventory Sales (Month)" value={fmt(data.inventory.revenue_this_month)} subtitle="From product sales" icon={ShoppingCart} color="green" />
        <StatCard title="Inventory Profit (Month)" value={fmt(data.inventory.profit_this_month)} subtitle="Sales minus cost" icon={DollarSign} color={data.inventory.profit_this_month >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-100">Recent Payments</h3>
          </div>
          <Table>
            <Thead><Th>Member</Th><Th>Amount</Th><Th>Status</Th><Th>Date</Th></Thead>
            <Tbody>
              {data.recent_payments.map((p) => (
                <Tr key={p.id}>
                  <Td>{p.member_name}</Td>
                  <Td className="font-medium">{fmt(p.amount_paid)}</Td>
                  <Td><span className={`badge-${p.status.toLowerCase()}`}>{p.status}</span></Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                </Tr>
              ))}
              {!data.recent_payments.length && <Tr><Td colSpan={4} className="text-center text-gray-400 py-8">No payments yet</Td></Tr>}
            </Tbody>
          </Table>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-100">Members Expiring Soon</h3>
          </div>
          <Table>
            <Thead><Th>Member</Th><Th>Phone</Th><Th>Expires</Th></Thead>
            <Tbody>
              {data.members_expiring_soon.map((m) => (
                <Tr key={m.id}>
                  <Td className="font-medium">{m.name}</Td>
                  <Td>{m.phone}</Td>
                  <Td className="text-orange-400 font-medium">{new Date(m.expiry_date).toLocaleDateString('en-PK')}</Td>
                </Tr>
              ))}
              {!data.members_expiring_soon.length && <Tr><Td colSpan={3} className="text-center text-gray-400 py-8">No members expiring soon</Td></Tr>}
            </Tbody>
          </Table>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  return user?.role === 'SUPERADMIN' ? <SuperAdminDashboard /> : <GymDashboard />
}
