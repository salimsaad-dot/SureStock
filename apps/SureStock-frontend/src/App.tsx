import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { RequireAuth, RequireRole } from './app/guards'
import { LoginPage } from './features/auth/LoginPage'
import { PinUnlockPage } from './features/auth/PinUnlockPage'
import { StaffPickerPage } from './features/auth/StaffPickerPage'
import { CatalogueSettingsPage } from './features/catalogue/CatalogueSettingsPage'
import { ImportPage } from './features/catalogue/ImportPage'
import { InventoryPage } from './features/catalogue/InventoryPage'
import { NewProductPage } from './features/catalogue/NewProductPage'
import { ProductDetailPage } from './features/catalogue/ProductDetailPage'
import { PurchasingPage } from './features/purchasing/PurchasingPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { SaleDetailPage } from './features/sales/SaleDetailPage'
import { SalesPage } from './features/sales/SalesPage'
import { SellPage } from './features/sell/SellPage'
import { SettingsPage } from './features/settings/SettingsPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/switch"
        element={
          <RequireAuth>
            <StaffPickerPage />
          </RequireAuth>
        }
      />
      <Route
        path="/switch/:userId"
        element={
          <RequireAuth>
            <PinUnlockPage />
          </RequireAuth>
        }
      />

      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Routes>
                <Route index element={<SellPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="inventory/:id" element={<ProductDetailPage />} />
                <Route
                  path="inventory/new"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <NewProductPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="inventory/import"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <ImportPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="inventory/settings"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <CatalogueSettingsPage />
                    </RequireRole>
                  }
                />
                <Route path="sales" element={<SalesPage />} />
                <Route path="sales/:id" element={<SaleDetailPage />} />
                <Route
                  path="reports"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <ReportsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="purchasing"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <PurchasingPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <RequireRole roles={['OWNER']}>
                      <SettingsPage />
                    </RequireRole>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default App
