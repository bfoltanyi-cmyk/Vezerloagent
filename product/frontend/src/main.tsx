import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from './i18n/t';

function App() {
  // Skeleton: routing, design system and login are built in the frontend-core task.
  return <h1>{t('app.title')}</h1>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
