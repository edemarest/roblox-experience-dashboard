
import Navbar from './components/Navbar';
import Home from './pages/Home';
import UniversesPage from './pages/Universes';
import ExperiencePage from './pages/Experience';
import RadarPage from './pages/Radar';
import AdminPage from './pages/Admin';
import AdminViewer from './pages/AdminViewer';
import Layout from './components/Layout';
import './styles/tokens.css';
import './styles/global.css';
import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <Layout>
      <Navbar />
      <div className="page">
        <Routes>
          <Route path="/" element={<Home/>} />
          <Route path="/universes" element={<UniversesPage/>} />
          <Route path="/experience/:id" element={<ExperiencePage/>} />
          <Route path="/radar" element={<RadarPage/>} />
          <Route path="/admin" element={<AdminPage/>} />
          <Route path="/admin/viewer" element={<AdminViewer/>} />
        </Routes>
      </div>
    </Layout>
  );
}
