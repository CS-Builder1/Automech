import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Customers } from '@/pages/Customers'
import { CustomerForm } from '@/pages/CustomerForm'
import { CustomerDetail } from '@/pages/CustomerDetail'
import { VehicleForm } from '@/pages/VehicleForm'
import { Search } from '@/pages/Search'
import { VehicleDetail } from '@/pages/VehicleDetail'
import { Jobs } from '@/pages/Jobs'
import { WorkOrderStart } from '@/pages/WorkOrderStart'
import { WorkOrderDetail } from '@/pages/WorkOrderDetail'
import { Settings } from '@/pages/Settings'

import { Operations } from '@/pages/Operations'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'search', element: <Search /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/new', element: <CustomerForm /> },
      { path: 'customers/:id', element: <CustomerDetail /> },
      { path: 'customers/:id/edit', element: <CustomerForm /> },
      { path: 'customers/:customerId/vehicles/new', element: <VehicleForm /> },
      { path: 'customers/:customerId/vehicles/:vehicleId', element: <VehicleDetail /> },
      { path: 'customers/:customerId/vehicles/:vehicleId/edit', element: <VehicleForm /> },
      { path: 'jobs', element: <Jobs /> },
      { path: 'jobs/new', element: <WorkOrderStart /> },
      { path: 'jobs/:id', element: <WorkOrderDetail /> },
      { path: 'operations', element: <Operations /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
