import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { RequireAuth, RequireRole } from './app/guards'
import { LoginPage } from './features/auth/LoginPage'
import { PinUnlockPage } from './features/auth/PinUnlockPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { StaffPickerPage } from './features/auth/StaffPickerPage'
import { CatalogueSettingsPage } from './features/catalogue/CatalogueSettingsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { OnboardingPage } from './features/onboarding/OnboardingPage'
import { ImportPage } from './features/catalogue/ImportPage'
import { InventoryPage } from './features/catalogue/InventoryPage'
import { NewProductPage } from './features/catalogue/NewProductPage'
import { ProductDetailPage } from './features/catalogue/ProductDetailPage'
import { PurchaseOrderDetailPage } from './features/purchasing/PurchaseOrderDetailPage'
import { PurchasingPage } from './features/purchasing/PurchasingPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { ReviewQueuePage } from './features/review-queue/ReviewQueuePage'
import { SaleDetailPage } from './features/sales/SaleDetailPage'
import { SalesPage } from './features/sales/SalesPage'
import { SellPage } from './features/sell/SellPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { StockTakePage } from './features/stock-take/StockTakePage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
                <Route
                  path="dashboard"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="onboarding"
                  element={
                    <RequireRole roles={['OWNER']}>
                      <OnboardingPage />
                    </RequireRole>
                  }
                />
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
                <Route
                  path="inventory/stock-take"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <StockTakePage />
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
                  path="purchasing/:id"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <PurchaseOrderDetailPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="review-queue"
                  element={
                    <RequireRole roles={['OWNER', 'MANAGER']}>
                      <ReviewQueuePage />
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
