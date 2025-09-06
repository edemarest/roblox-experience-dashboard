import SearchInput from './SearchInput';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="navbar">
      <div className="nav-left"><Link to="/">Roblox Stats</Link></div>
      <div className="nav-center"><SearchInput onQuery={() => {}} /></div>
      <div className="nav-right"><Link to="/universes">Discover</Link> <Link to="/radar">Radar</Link></div>
    </header>
  );
}
