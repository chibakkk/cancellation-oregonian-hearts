import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { ConnectionBadge } from "./components/ConnectionBadge";
import NewGameTable from "./components/NewGameTable";
import { GameProvider } from "./context/GameProvider";
import { CreateRoom } from "./pages/CreateRoom";
import { NewHome } from "./pages/NewHome";

function App() {
  return (
    <GameProvider>
      <Router>
        <ConnectionBadge />
        <Routes>
          <Route
            path="/"
            element={<NewHome />}
          />
          <Route
            path="/game"
            element={<NewGameTable />}
          />
          <Route
            path="/create-room"
            element={<CreateRoom />}
          />
        </Routes>
      </Router>
    </GameProvider>
  );
}

export default App;
