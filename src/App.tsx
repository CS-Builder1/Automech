import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Customers } from '@/pages/Customers'
import { CustomerForm } from '@/pages/CustomerForm'
import { CustomerDetail } from '@/pages/CustomerDetail'
import { VehicleForm } from '@/pages/VehicleForm'
import { Jobs } from '@/pages/Jobs'
import { WorkOrderStart } from '@/pages/WorkOrderStart'
import { WorkOrderDetail } from '@/pages/WorkOrderDetail'
import { Invoices } from '@/pages/Invoices'
import { InvoiceDetail } from '@/pages/InvoiceDetail'
import { InspectionEditor } from '@/pages/InspectionEditor'
import { Settings } from '@/pages/Settings'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/new', element: <CustomerForm /> },
      { path: 'customers/:id', element: <CustomerDetail /> },
      { path: 'customers/:id/edit', element: <CustomerForm /> },
      { path: 'customers/:customerId/vehicles/new', element: <VehicleForm /> },
      { path: 'customers/:customerId/vehicles/:vehicleId/edit', element: <VehicleForm /> },
      { path: 'jobs', element: <Jobs /> },
      { path: 'jobs/new', element: <WorkOrderStart /> },
      { path: 'jobs/:id', element: <WorkOrderDetail /> },
      { path: 'invoices', element: <Invoices /> },
      { path: 'invoices/:id', element: <InvoiceDetail /> },
      { path: 'inspections/:id', element: <InspectionEditor /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
