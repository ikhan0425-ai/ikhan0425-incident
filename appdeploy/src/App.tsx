import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Footer, Header } from './components/Header';
import { AuthProvider, useAuth } from './lib/auth';
import { HomePage } from './pages/HomePage';
import { ImagePage } from './pages/ImagePage';
import { ImagesPage } from './pages/ImagesPage';
import { ModelPage } from './pages/ModelPage';
import { NewImagePage } from './pages/NewImagePage';
import { NewModelPage } from './pages/NewModelPage';
import { NewVersionPage } from './pages/NewVersionPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { UserPage } from './pages/UserPage';

/** 페이지가 바뀌면 맨 위로 (같은 페이지의 쿼리스트링만 바뀌는 필터 변경은 제외) */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Notice() {
  const { notice, clearNotice } = useAuth();
  if (!notice) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-4 z-[200] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-2xl shadow-black/50">
      <span>{notice}</span>
      <button type="button" className="btn btn-ghost px-2 py-1" onClick={clearNotice}>
        닫기
      </button>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ScrollToTop />
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/models/new" element={<NewModelPage />} />
              <Route path="/models/:id" element={<ModelPage />} />
              <Route path="/models/:id/versions/new" element={<NewVersionPage />} />
              <Route path="/images" element={<ImagesPage />} />
              <Route path="/images/new" element={<NewImagePage />} />
              <Route path="/images/:id" element={<ImagePage />} />
              <Route path="/users/:id" element={<UserPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
        <Notice />
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
